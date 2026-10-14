jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn({ id: "txn" })),
  },
}));

jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { ENTITY_CONFIGS } from "../../config/changeHistory.config";
import { sequelize } from "../../database/db";
import {
  AUDIT_RECORD_TABLES,
  countAuditRecordsBefore,
  deleteAuditRowsBatch,
  getLatestRetentionRuns,
  recordRetentionRun,
  safeRecordRetentionRun,
  resetErrorCodeColumnCache,
  ERROR_CODE_RECHECK_MS,
} from "../dataRetention.utils";
import logger from "../logger/fileLogger";

const mockQuery = sequelize.query as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
});

describe("AUDIT_RECORD_TABLES", () => {
  it("covers every change-history entity table", () => {
    const names = AUDIT_RECORD_TABLES.map((t) => t.table);
    for (const config of Object.values(ENTITY_CONFIGS)) {
      expect(names).toContain(config.tableName);
    }
  });

  it("includes the FRIA change history", () => {
    expect(AUDIT_RECORD_TABLES).toContainEqual({
      table: "fria_change_history",
      timestampColumn: "changed_at",
    });
  });

  it("only contains plain identifiers and never the ledger itself", () => {
    for (const { table, timestampColumn } of AUDIT_RECORD_TABLES) {
      expect(table).toMatch(/^[a-z_]+$/);
      expect(timestampColumn).toMatch(/^[a-z_]+$/);
      expect(table).not.toBe("audit_ledger");
    }
  });
});

describe("deleteAuditRowsBatch", () => {
  it("throws for a table that is not in the list", async () => {
    await expect(
      deleteAuditRowsBatch(1, { table: "users", timestampColumn: "created_at" }, "2020-01-01", 10),
    ).rejects.toThrow(/Not an audit record table/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("throws when the column does not match the listed table", async () => {
    await expect(
      deleteAuditRowsBatch(
        1,
        { table: "event_logs", timestampColumn: "1; DROP TABLE users" },
        "2020-01-01",
        10,
      ),
    ).rejects.toThrow(/Not an audit record table/);
  });

  it("deletes a batch scoped to the org and returns the row count", async () => {
    mockQuery.mockResolvedValueOnce([{}]).mockResolvedValueOnce([undefined, { rowCount: 7 }]);
    const n = await deleteAuditRowsBatch(4, AUDIT_RECORD_TABLES[0], "2020-01-01", 10);
    expect(n).toBe(7);
    // No existence check of its own: callers check with auditTableExists.
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes("to_regclass"))).toBe(false);
    const [sql, opts] = mockQuery.mock.calls[1];
    expect(sql).toContain("DELETE FROM event_logs");
    expect(sql).toContain("organization_id = :organizationId");
    expect(opts.replacements).toEqual({ organizationId: 4, cutoff: "2020-01-01", batchSize: 10 });
  });
});

describe("countAuditRecordsBefore", () => {
  const allTables = () => AUDIT_RECORD_TABLES.map((t) => ({ name: t.table }));

  it("sums the ledger bound count and one count over every existing table", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("AS cutoff")) return [{ cutoff: "2020-01-01 00:00:00+00" }];
      if (sql.includes("set_config")) return [{}];
      if (sql.includes("FROM audit_ledger")) return [{ n: 5 }];
      if (sql.includes("to_regclass")) return allTables();
      return [{ n: 40 }];
    });
    const total = await countAuditRecordsBefore(1, 24);
    expect(total).toBe(45);
    // cutoff, set_config, ledger, existence, counts: a fixed number of queries.
    expect(mockQuery).toHaveBeenCalledTimes(5);
    const countSql = String(mockQuery.mock.calls[4][0]);
    expect(countSql.match(/UNION ALL/g)).toHaveLength(AUDIT_RECORD_TABLES.length - 1);
  });

  it("counts only tables that exist", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("AS cutoff")) return [{ cutoff: "2020-01-01 00:00:00+00" }];
      if (sql.includes("set_config")) return [{}];
      if (sql.includes("FROM audit_ledger")) return [{ n: 5 }];
      if (sql.includes("to_regclass")) return [{ name: "event_logs" }];
      return [{ n: 2 }];
    });
    const total = await countAuditRecordsBefore(1, 24);
    expect(total).toBe(5 + 2);
    const countSql = String(mockQuery.mock.calls[4][0]);
    expect(countSql).toContain("FROM event_logs");
    expect(countSql).not.toContain("UNION ALL");
  });

  it("skips the count when no audit table exists", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("AS cutoff")) return [{ cutoff: "2020-01-01 00:00:00+00" }];
      if (sql.includes("FROM audit_ledger")) return [{ n: 3 }];
      if (sql.includes("to_regclass")) return [];
      return [{}];
    });
    expect(await countAuditRecordsBefore(1, 24)).toBe(3);
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it("runs the existence check and the count inside its own transaction", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("AS cutoff")) return [{ cutoff: "2020-01-01 00:00:00+00" }];
      if (sql.includes("to_regclass")) return allTables();
      return [{ n: 0 }];
    });
    await countAuditRecordsBefore(1, 24);
    const [check, count] = mockQuery.mock.calls.slice(3);
    expect(check[1].replacements.tables).toEqual(AUDIT_RECORD_TABLES.map((t) => t.table));
    // A query outside the transaction would borrow a second pooled connection.
    expect(check[1].transaction).toEqual({ id: "txn" });
    expect(count[1].transaction).toEqual({ id: "txn" });
  });
});

describe("recordRetentionRun / getLatestRetentionRuns", () => {
  it("inserts the run with a null error by default", async () => {
    mockQuery.mockResolvedValue([]);
    await recordRetentionRun({
      organizationId: 1,
      recordType: "audit_records",
      cutoff: null,
      deletedCount: 3,
      status: "success",
    });
    expect(mockQuery.mock.calls[0][1].replacements).toMatchObject({
      organizationId: 1,
      recordType: "audit_records",
      deletedCount: 3,
      error: null,
    });
  });

  it("returns the latest run per record type", async () => {
    mockQuery.mockResolvedValue([
      {
        record_type: "audit_records",
        ran_at: new Date("2026-01-02T00:00:00Z"),
        deleted_count: "9",
        status: "capped",
        error: null,
      },
      {
        record_type: "ai_gateway_spend_logs",
        ran_at: new Date("2026-01-03T00:00:00Z"),
        deleted_count: "0",
        status: "failed",
        error: "Purge refused: internal key rejected",
        error_code: "internal_key_rejected",
      },
    ]);
    const runs = await getLatestRetentionRuns(1);
    expect(mockQuery.mock.calls[0][0]).toContain("DISTINCT ON (record_type)");
    expect(runs.audit_records).toEqual({
      ran_at: "2026-01-02T00:00:00.000Z",
      deleted_count: 9,
      status: "capped",
      error: null,
      error_code: null,
    });
    expect(runs.ai_gateway_spend_logs?.error).toBe("Purge refused: internal key rejected");
    expect(runs.ai_gateway_spend_logs?.error_code).toBe("internal_key_rejected");
    expect(mockQuery.mock.calls[0][0]).toContain("error_code");
    expect(runs.mrm_metrics).toBeUndefined();
  });
});

describe("before the error_code migration has run", () => {
  beforeEach(() => {
    resetErrorCodeColumnCache();
  });
  afterEach(() => {
    resetErrorCodeColumnCache();
  });
  const missingColumn = () =>
    Object.assign(
      new Error('column "error_code" of relation "data_retention_runs" does not exist'),
      {
        parent: { code: "42703" },
      },
    );

  it("records the run without its code", async () => {
    mockQuery.mockRejectedValueOnce(missingColumn()).mockResolvedValueOnce([]);
    await recordRetentionRun({
      organizationId: 1,
      recordType: "ai_gateway_spend_logs",
      cutoff: null,
      deletedCount: 0,
      status: "failed",
      error: "Purge refused: internal key rejected",
      errorCode: "internal_key_rejected",
    });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const retrySql = String(mockQuery.mock.calls[1][0]);
    expect(retrySql).not.toContain("error_code");
    expect(mockQuery.mock.calls[1][1].replacements.error).toBe(
      "Purge refused: internal key rejected",
    );
  });

  it("reads the latest runs without codes", async () => {
    mockQuery.mockRejectedValueOnce(missingColumn()).mockResolvedValueOnce([
      {
        record_type: "audit_records",
        ran_at: "2026-01-02T00:00:00.000Z",
        deleted_count: 1,
        status: "success",
        error: null,
      },
    ]);
    const runs = await getLatestRetentionRuns(1);
    expect(String(mockQuery.mock.calls[1][0])).not.toContain("error_code");
    expect(runs.audit_records?.error_code).toBeNull();
  });

  it("remembers the missing column, so later calls go straight to the fallback", async () => {
    mockQuery.mockRejectedValueOnce(missingColumn()).mockResolvedValue([]);
    const run = {
      organizationId: 1,
      recordType: "audit_records" as const,
      cutoff: null,
      deletedCount: 0,
      status: "success" as const,
    };
    await recordRetentionRun(run);
    await recordRetentionRun(run);
    await getLatestRetentionRuns(1);

    // One failed attempt, then the fallback for everything after it.
    expect(mockQuery).toHaveBeenCalledTimes(4);
    for (const call of mockQuery.mock.calls.slice(1)) {
      expect(String(call[0])).not.toContain("error_code");
    }
  });

  describe("rechecking the column", () => {
    const run = {
      organizationId: 1,
      recordType: "audit_records" as const,
      cutoff: null,
      deletedCount: 0,
      status: "success" as const,
    };
    const sqlOf = (index: number) => String(mockQuery.mock.calls[index][0]);

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("does not recheck within the interval", async () => {
      mockQuery.mockRejectedValueOnce(missingColumn()).mockResolvedValue([]);
      await recordRetentionRun(run);
      jest.setSystemTime(Date.now() + ERROR_CODE_RECHECK_MS - 1);
      await recordRetentionRun(run);

      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls.some((call) => String(call[0]).includes("pg_attribute"))).toBe(
        false,
      );
    });

    it("uses error_code again once a later check finds the column", async () => {
      mockQuery.mockRejectedValueOnce(missingColumn()).mockResolvedValueOnce([]); // fail, fallback
      await recordRetentionRun(run);

      jest.setSystemTime(Date.now() + ERROR_CODE_RECHECK_MS);
      mockQuery.mockResolvedValueOnce([{ "?column?": 1 }]).mockResolvedValueOnce([]); // check, insert
      await recordRetentionRun(run);

      expect(sqlOf(2)).toContain("FROM pg_attribute");
      expect(sqlOf(2)).toContain("to_regclass('data_retention_runs')");
      expect(sqlOf(2)).toContain("NOT attisdropped");
      expect(sqlOf(2)).not.toMatch(/verifywise\./);
      expect(sqlOf(3)).toContain("error_code");
    });

    it("keeps skipping when the column is still missing, and checks again later", async () => {
      mockQuery.mockRejectedValueOnce(missingColumn()).mockResolvedValueOnce([]);
      await recordRetentionRun(run);

      jest.setSystemTime(Date.now() + ERROR_CODE_RECHECK_MS);
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // check: none, fallback
      await recordRetentionRun(run);
      expect(sqlOf(3)).not.toContain("error_code");

      // Within the next interval: straight to the fallback, no check.
      mockQuery.mockResolvedValueOnce([]);
      await recordRetentionRun(run);
      expect(mockQuery).toHaveBeenCalledTimes(5);
      expect(sqlOf(4)).not.toContain("pg_attribute");
    });
  });

  it("does not hide other database errors", async () => {
    mockQuery.mockRejectedValueOnce(
      Object.assign(new Error("deadlock detected"), { parent: { code: "40P01" } }),
    );
    await expect(
      recordRetentionRun({
        organizationId: 1,
        recordType: "audit_records",
        cutoff: null,
        deletedCount: 0,
        status: "success",
      }),
    ).rejects.toThrow("deadlock detected");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("safeRecordRetentionRun", () => {
  const run = {
    organizationId: 3,
    recordType: "mrm_metrics" as const,
    cutoff: null,
    deletedCount: 4,
    status: "failed" as const,
  };

  it.each([
    [new Error("statement timeout"), "statement timeout"],
    ["gateway down", "gateway down"],
    [undefined, null],
  ])("stores error %p as %p", async (error, stored) => {
    mockQuery.mockResolvedValue([]);
    await safeRecordRetentionRun({ ...run, error });
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      organizationId: 3,
      recordType: "mrm_metrics",
      cutoff: null,
      deletedCount: 4,
      status: "failed",
      error: stored,
      errorCode: null,
    });
  });

  it("stores the machine-readable error code", async () => {
    mockQuery.mockResolvedValue([]);
    await safeRecordRetentionRun({
      ...run,
      error: "Purge refused: internal key rejected",
      errorCode: "internal_key_rejected",
    });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("error_code");
    expect(opts.replacements.errorCode).toBe("internal_key_rejected");
  });

  it("logs a recording failure instead of throwing", async () => {
    mockQuery.mockRejectedValue(new Error("insert failed"));
    await expect(safeRecordRetentionRun(run)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("mrm_metrics retention run failed for org 3"),
      expect.objectContaining({ message: "insert failed" }),
    );
  });
});
