import {
  formatFieldValue,
  recordEntityChange,
  recordEntityCreation,
  recordEntityCreationBulk,
  recordEntityDeletion,
  recordEntityDeletionBulk,
  recordEntityFieldChangeBulk,
  trackEntityChanges,
} from "../changeHistory.base.utils";
import { sequelize } from "../../database/db";
import { appendToAuditLedger } from "../auditLedger.utils";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn(),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockQuery = sequelize.query as jest.Mock;
const mockAppend = appendToAuditLedger as jest.Mock;

/** A transaction double that collects afterCommit hooks so a test can fire them. */
const makeTransaction = () => {
  const hooks: Array<() => void> = [];
  return {
    hooks,
    afterCommit: jest.fn((hook: () => void) => hooks.push(hook)),
  };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[], 0]);
  mockAppend.mockResolvedValue(undefined);
});

describe("recordEntityChange audit ledger timing", () => {
  it("appends to the ledger immediately when no transaction is passed", async () => {
    await recordEntityChange("risk", 10, "updated", 3, 1, "Mitigation status", "a", "b");
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  it("defers the ledger append until the transaction commits", async () => {
    const tx = makeTransaction();
    await recordEntityChange("risk", 10, "updated", 3, 1, "Mitigation status", "a", "b", tx as any);

    // Nothing written to the append-only ledger yet: a rollback must leave no entry.
    expect(mockAppend).not.toHaveBeenCalled();
    expect(tx.afterCommit).toHaveBeenCalledTimes(1);

    tx.hooks.forEach((hook) => hook());
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(mockAppend.mock.calls[0][0]).toMatchObject({
      organizationId: 1,
      entityType: "risk",
      entityId: 10,
      userId: 3,
    });
  });
});

describe("recordEntityFieldChangeBulk", () => {
  it("writes every row in one INSERT inside the transaction, with a null actor", async () => {
    const tx = makeTransaction();
    await recordEntityFieldChangeBulk(
      "risk",
      [10, 11, 12],
      1,
      "Mitigation status",
      "Completed",
      "Requires review",
      tx as any,
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("unnest(ARRAY[:entity_ids]::int[])");
    expect(sql).toContain("NULL, true, NOW()");
    expect(sql).toContain("changed_by_system");
    expect(opts.transaction).toBe(tx);
    expect(opts.replacements).toMatchObject({
      organization_id: 1,
      entity_ids: [10, 11, 12],
      old_value: "Completed",
      new_value: "Requires review",
    });
  });

  it("appends ledger entries only after commit, one at a time", async () => {
    const tx = makeTransaction();
    let inFlight = 0;
    let maxInFlight = 0;
    mockAppend.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await flush();
      inFlight--;
    });

    await recordEntityFieldChangeBulk(
      "risk",
      [10, 11, 12],
      1,
      "Mitigation status",
      "Completed",
      "Requires review",
      tx as any,
    );
    expect(mockAppend).not.toHaveBeenCalled();

    tx.hooks.forEach((hook) => hook());
    for (let i = 0; i < 6; i++) await flush();

    expect(mockAppend).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
    expect(mockAppend.mock.calls.map(([entry]) => entry.entityId)).toEqual([10, 11, 12]);
    expect(mockAppend.mock.calls.every(([entry]) => entry.userId === null)).toBe(true);
  });

  it("does nothing for an empty id list", async () => {
    const tx = makeTransaction();
    await recordEntityFieldChangeBulk("risk", [], 1, "f", "a", "b", tx as any);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(tx.afterCommit).not.toHaveBeenCalled();
  });
});

describe("recordEntityDeletion and recordEntityDeletionBulk", () => {
  it("records a user's deletion as before", async () => {
    await recordEntityDeletion("model_risk", 7, 9, 1);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("changed_by_system");
    expect(opts.replacements).toMatchObject({
      entity_id: 7,
      action: "deleted",
      field_name: "Model Risk",
      old_value: "Active",
      new_value: "Deleted",
      changed_by_user_id: 9,
    });
  });

  it("records a deletion as the system's, with no actor", async () => {
    await recordEntityDeletion("model_risk", 7, null, 1, undefined, true);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("changed_by_system");
    expect(opts.replacements.changed_by_user_id).toBe(null);
  });

  it("the bulk variant writes one INSERT for a user, with the same row values", async () => {
    const tx = makeTransaction();
    await recordEntityDeletionBulk("model_risk", [7, 8], 9, 1, tx as any);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("unnest(ARRAY[:entity_ids]::int[])");
    expect(sql).not.toContain("changed_by_system");
    expect(opts.transaction).toBe(tx);
    expect(opts.replacements).toMatchObject({
      organization_id: 1,
      entity_ids: [7, 8],
      action: "deleted",
      field_name: "Model Risk",
      old_value: "Active",
      new_value: "Deleted",
      changed_by_user_id: 9,
    });

    tx.hooks.forEach((hook) => hook());
    for (let i = 0; i < 4; i++) await flush();
    expect(mockAppend.mock.calls.map(([entry]) => [entry.entityId, entry.userId])).toEqual([
      [7, 9],
      [8, 9],
    ]);
  });

  it("the bulk variant records the system's deletions with a null actor", async () => {
    const tx = makeTransaction();
    await recordEntityDeletionBulk("model_risk", [7], null, 1, tx as any, true);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("changed_by_system");
    expect(sql).toContain("NULL, true, NOW()");
  });
});

describe("model risk model_id history values", () => {
  it("formats a model id as the model's name, looked up in the organization", async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      /FROM model_inventories/.test(sql) ? [{ name: "Fraud model" }] : [[], 0],
    );
    await expect(
      formatFieldValue("model_risk", "model_id", 5, { organizationId: 1 }),
    ).resolves.toBe("Fraud model");
    const lookup = mockQuery.mock.calls.find(([sql]) => /FROM model_inventories/.test(sql))!;
    expect(lookup[0]).toContain("organization_id = :organizationId");
    expect(lookup[1].replacements).toEqual({ id: 5, organizationId: 1 });
  });

  it("an edit of the model records names, not ids", async () => {
    mockQuery.mockImplementation(async (sql: string, opts: any) =>
      /FROM model_inventories/.test(sql) ? [{ name: `Model ${opts.replacements.id}` }] : [[], 0],
    );
    const changes = await trackEntityChanges(
      "model_risk",
      { model_id: 5 },
      { model_id: 6 },
      { organizationId: 1 },
    );
    expect(changes).toEqual([
      { fieldName: "Associated model", oldValue: "Model 5", newValue: "Model 6" },
    ]);
  });

  it("without an organization it never looks a name up", async () => {
    await expect(formatFieldValue("model_risk", "model_id", 5)).resolves.toBe("Model #5");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("recordEntityCreationBulk", () => {
  const riskData = (name: string) => ({
    risk_name: name,
    risk_owner: 7,
    risk_approval: 7,
    ai_lifecycle_phase: "Model development & training",
    risk_description: "Accuracy degrades",
    risk_category: ["Operational risk", "Data privacy risk"],
    impact: "",
    likelihood: "Possible",
    severity: "Major",
    review_notes: null,
    deadline: "2026-12-31",
  });

  /** Answers the user-name lookups; every other statement returns nothing. */
  const answerLookups = () =>
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes("FROM users")
        ? [{ id: 7, name: "Ada", surname: "Lovelace", email: null }]
        : [[], 0],
    );

  const historyInserts = () =>
    mockQuery.mock.calls.filter(([sql]: [string]) =>
      sql.trimStart().startsWith('INSERT INTO "project_risk_change_history"'),
    );
  const userLookups = () =>
    mockQuery.mock.calls.filter(([sql]: [string]) => sql.includes("FROM users"));

  /** recordEntityCreation's rows for one risk, as [entity, action, field, old, new, user]. */
  const singleRows = async (id: number, data: Record<string, unknown>) => {
    mockQuery.mockClear();
    const tx = makeTransaction();
    await recordEntityCreation("risk", id, 77, 3, data, tx as never);
    return historyInserts().map(([sql, options]: [string, any]) => {
      expect(sql).toContain("organization_id");
      expect(options.replacements.organization_id).toBe(3);
      expect(options.transaction).toBe(tx);
      const r = options.replacements;
      return [r.entity_id, r.action, r.field_name, r.old_value, r.new_value, r.changed_by_user_id];
    });
  };

  it("writes the same rows recordEntityCreation writes for each risk", async () => {
    answerLookups();
    const expected = [
      ...(await singleRows(41, riskData("A"))),
      ...(await singleRows(42, riskData("B"))),
    ];
    expect(expected.length).toBeGreaterThan(0);

    mockQuery.mockClear();
    const tx = makeTransaction();
    await recordEntityCreationBulk(
      "risk",
      [
        { id: 41, data: riskData("A") },
        { id: 42, data: riskData("B") },
      ],
      77,
      3,
      tx as never,
    );

    const inserts = historyInserts();
    expect(inserts).toHaveLength(1);
    const [sql, options] = inserts[0] as [string, any];
    expect(sql).toContain("'created'");
    expect(sql).toContain("'-'");
    expect(options.transaction).toBe(tx);
    const r = options.replacements;
    expect(r.organization_id).toBe(3);
    const actual = r.entity_ids.map((id: number, i: number) => [
      id,
      "created",
      r.field_names[i],
      "-",
      r.new_values[i],
      r.changed_by_user_id,
    ]);
    expect(actual).toEqual(expected);
    // The owner and approver are one user: looked up once per field, not per risk.
    expect(userLookups()).toHaveLength(2);
  });

  it("appends the same ledger entries, only after the commit", async () => {
    answerLookups();
    const singleTx = makeTransaction();
    await recordEntityCreation("risk", 41, 77, 3, riskData("A"), singleTx as never);
    singleTx.hooks.forEach((hook) => hook());
    await flush();
    const expected = mockAppend.mock.calls.map(([entry]) => entry);
    mockAppend.mockClear();

    const tx = makeTransaction();
    await recordEntityCreationBulk("risk", [{ id: 41, data: riskData("A") }], 77, 3, tx as never);
    expect(mockAppend).not.toHaveBeenCalled();
    tx.hooks.forEach((hook) => hook());
    for (let i = 0; i < expected.length + 1; i++) await flush();
    expect(mockAppend.mock.calls.map(([entry]) => entry)).toEqual(expected);
  });

  it("splits a large import into several INSERTs", async () => {
    answerLookups();
    const entities = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      data: riskData(`R${i}`),
    }));
    await recordEntityCreationBulk("risk", entities, 77, 3, makeTransaction() as never);
    const inserts = historyInserts();
    // 120 risks x 9 non-empty fields = 1,080 rows: one full chunk and a remainder.
    expect(inserts.map(([, o]: [string, any]) => o.replacements.entity_ids.length)).toEqual([
      1000, 80,
    ]);
  });

  it("writes nothing for no entities, and lets an INSERT failure propagate", async () => {
    const tx = makeTransaction();
    await recordEntityCreationBulk("risk", [], 77, 3, tx as never);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(tx.afterCommit).not.toHaveBeenCalled();

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("project_risk_change_history")) throw new Error("insert failed");
      return [[], 0];
    });
    await expect(
      recordEntityCreationBulk("risk", [{ id: 1, data: { risk_name: "A" } }], 77, 3, tx as never),
    ).rejects.toThrow("insert failed");
  });
});
