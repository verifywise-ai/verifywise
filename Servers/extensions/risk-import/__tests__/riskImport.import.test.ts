import ExcelJS from "exceljs";

const mockQuery = jest.fn();
const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../../database/db", () => ({
  sequelize: {
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: jest.fn(async () => mockTransaction),
  },
}));
const mockNotInOrg = jest.fn();
jest.mock("../../../utils/user.utils", () => ({
  findUsersNotInOrganization: (...args: unknown[]) => mockNotInOrg(...args),
}));
const mockRecordCreation = jest.fn();
const mockLogError = jest.fn();
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: {
    error: (...args: unknown[]) => mockLogError(...args),
    info: jest.fn(),
    warn: jest.fn(),
  },
  logStructuredError: (...args: unknown[]) => mockLogError(...args),
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  recordEntityCreationBulk: (...args: unknown[]) => mockRecordCreation(...args),
}));
const mockNotifyApprovers = jest.fn();
jest.mock("../../../services/riskApproverNotification.service", () => ({
  notifyRiskApprovers: (...args: unknown[]) => mockNotifyApprovers(...args),
}));

import {
  buildExcelTemplate,
  importRisks,
  RISK_IMPORT_MESSAGES,
  RiskImportRow,
} from "../riskImport.service";
import { MAX_IMPORT_ROWS } from "../../importLimits";

// The /api/v1 contract; the legacy rules are covered in the "legacy" block.
const strictImport = (rows: RiskImportRow[], org: number, user: number, callerIsAdmin = false) =>
  importRisks(rows, org, user, { strict: true, callerIsAdmin });
const legacyImport = (rows: RiskImportRow[], org: number, user: number, callerIsAdmin = false) =>
  importRisks(rows, org, user, { strict: false, callerIsAdmin });

const validRow = (overrides: Partial<RiskImportRow> = {}): RiskImportRow => ({
  risk_name: "Model drift",
  risk_owner: "Ada Lovelace - ada@example.com (ID: 7)",
  ai_lifecycle_phase: "Model development & training",
  risk_description: "Accuracy degrades over time",
  likelihood: "Possible",
  severity: "Major",
  ...overrides,
});

const sqlOf = (call: unknown[]): string => String(call[0]);

/** The parsed data the creation history received for the nth imported risk. */
const historyData = (n = 0) =>
  (mockRecordCreation.mock.calls[0][1] as Array<{ data: Record<string, unknown> }>)[n].data;

describe("importRisks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotInOrg.mockResolvedValue([]);
    mockNotifyApprovers.mockResolvedValue(undefined);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO risks")) return [{ id: 100 }];
      if (sql.includes("FROM risks")) return [];
      return [];
    });
  });

  describe("required fields", () => {
    it.each([
      ["ai_lifecycle_phase", { ai_lifecycle_phase: undefined }],
      ["likelihood", { likelihood: undefined }],
      ["severity", { severity: undefined }],
      ["risk_description", { risk_description: " " }],
      ["risk_name", { risk_name: "" }],
      ["risk_owner", { risk_owner: undefined }],
    ])("rejects a row with no %s", async (field, override) => {
      const result = await strictImport([validRow(override)], 1, 5);
      expect(result.success).toBe(false);
      expect(result.errors.map((e) => e.field)).toContain(field);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });

    it("marks exactly the enforced fields with * in the template", async () => {
      const { buffer } = await buildExcelTemplate(1);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const headers: string[] = [];
      workbook.worksheets[0].getRow(1).eachCell((c) => headers.push(String(c.value)));
      const starred = headers.filter((h) => h.endsWith("*")).map((h) => h.replace(/ \*$/, ""));
      expect(starred.sort()).toEqual(
        [
          "Risk Name",
          "Risk Owner",
          "AI Lifecycle Phase",
          "Risk Description",
          "Likelihood",
          "Severity",
        ].sort(),
      );
    });
  });

  it("reports invalid risk categories by name instead of dropping them", async () => {
    const result = await strictImport(
      [validRow({ risk_category: "Operational risk, Made up risk, Other bad" })],
      1,
      5,
    );
    expect(result.success).toBe(false);
    const error = result.errors.find((e) => e.field === "risk_category");
    expect(error?.message).toContain("Made up risk, Other bad");
  });

  describe("duplicate detection", () => {
    it("rejects a name that already exists in the organization (trimmed, case-insensitive)", async () => {
      mockQuery.mockImplementation(async (sql: string) =>
        sql.includes("FROM risks") ? [{ risk_name: "Model drift" }] : [],
      );
      const result = await strictImport([validRow({ risk_name: "  MODEL Drift " })], 9, 5);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatchObject({ row: 2, field: "risk_name" });
      expect(result.errors[0].message).toContain("already exists");
      const lookup = mockQuery.mock.calls.find((c) => sqlOf(c).includes("FROM risks"))!;
      expect(sqlOf(lookup)).toContain("organization_id = :organizationId");
      expect((lookup[1] as any).replacements.organizationId).toBe(9);
      // Only candidates are fetched: the SQL receives the trimmed, lower-cased keys.
      expect(sqlOf(lookup)).toContain("lower(regexp_replace(risk_name");
      expect((lookup[1] as any).replacements.keys).toEqual(["model drift"]);
      expect((lookup[1] as any).replacements.trimPattern).toContain("\u00a0");
      expect(mockQuery.mock.calls.some((c) => sqlOf(c).includes("INSERT INTO risks"))).toBe(false);
    });

    it("matches an existing name that ends in a non-breaking space or tab", async () => {
      mockQuery.mockImplementation(async (sql: string) =>
        sql.includes("FROM risks") ? [{ risk_name: "Model drift\u00a0\t" }] : [],
      );
      const result = await strictImport([validRow()], 1, 5);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain("already exists");
    });

    it("catches a non-ASCII existing name that differs only by case", async () => {
      // PostgreSQL lower() may not fold these letters, so the candidate query
      // also returns every non-ASCII name and the JS key makes the decision.
      mockQuery.mockImplementation(async (sql: string) =>
        sql.includes("FROM risks") ? [{ risk_name: "Ärger mit Übergröße" }] : [],
      );
      const result = await strictImport([validRow({ risk_name: "ÄRGER MIT ÜBERGRÖßE" })], 1, 5);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatchObject({ row: 2, field: "risk_name" });
      const lookup = mockQuery.mock.calls.find((c) => sqlOf(c).includes("FROM risks"))!;
      expect(sqlOf(lookup)).toContain("OR risk_name ~ :nonAscii");
      expect((lookup[1] as any).replacements.nonAscii).toBe("[^\\x01-\\x7F]");
    });

    it("checks existing names inside the insert transaction, after the org lock", async () => {
      await strictImport([validRow()], 9, 5);
      const sqls = mockQuery.mock.calls.map((c) => sqlOf(c));
      const lock = sqls.findIndex((q) => q.includes("pg_advisory_xact_lock"));
      const lookup = sqls.findIndex((q) => q.includes("FROM risks"));
      const insert = sqls.findIndex((q) => q.includes("INSERT INTO risks"));
      expect(lock).toBeGreaterThanOrEqual(0);
      expect(lock).toBeLessThan(lookup);
      expect(lookup).toBeLessThan(insert);
      expect(mockQuery.mock.calls[lock][1]).toMatchObject({
        replacements: { organizationId: 9 },
        transaction: mockTransaction,
      });
      expect(mockQuery.mock.calls[lookup][1]).toMatchObject({ transaction: mockTransaction });
    });

    it("rolls back and reports a name that appeared after the up-front validation", async () => {
      mockQuery.mockImplementation(async (sql: string) =>
        sql.includes("FROM risks") ? [{ risk_name: "model drift" }] : [],
      );
      const result = await strictImport([validRow()], 1, 5);
      expect(result.success).toBe(false);
      expect(result.errors).toMatchObject([
        { row: 2, field: "risk_name", message: 'A risk named "Model drift" already exists' },
      ]);
      expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
      expect(mockQuery.mock.calls.some((c) => sqlOf(c).includes("INSERT INTO risks"))).toBe(false);
    });

    it("rejects a name repeated earlier in the same file", async () => {
      const result = await strictImport(
        [validRow(), validRow({ risk_name: "other" }), validRow({ risk_name: "MODEL DRIFT" })],
        1,
        5,
      );
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ row: 4, field: "risk_name" });
      expect(result.errors[0].message).toContain("row 2");
    });
  });

  describe("insert phase", () => {
    it("uses a savepoint per row so later rows report their own errors, and rolls everything back", async () => {
      let inserts = 0;
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO risks")) {
          inserts++;
          if (inserts === 1) throw new Error("value too long");
          return [{ id: 100 + inserts }];
        }
        return [];
      });
      const result = await strictImport(
        [validRow({ risk_name: "A" }), validRow({ risk_name: "B" }), validRow({ risk_name: "C" })],
        1,
        5,
      );
      expect(result.success).toBe(false);
      expect(result.imported).toBe(0);
      expect(result.errors).toMatchObject([
        {
          row: 2,
          field: "general",
          message: RISK_IMPORT_MESSAGES.rowNotSaved,
          messageKey: RISK_IMPORT_MESSAGES.rowNotSaved,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain("value too long");
      expect(mockLogError.mock.calls.flat().join(" ")).toContain("value too long");
      // Rows 2 and 3 were attempted after the failure instead of tripping on an aborted transaction.
      expect(inserts).toBe(3);
      const sqls = mockQuery.mock.calls.map((c) => sqlOf(c));
      expect(sqls.filter((q) => q === "SAVEPOINT risk_import_row;")).toHaveLength(3);
      expect(sqls.filter((q) => q === "ROLLBACK TO SAVEPOINT risk_import_row;")).toHaveLength(1);
      // Every savepoint is released, the failed one after its rollback, so none nest.
      expect(sqls.filter((q) => q === "RELEASE SAVEPOINT risk_import_row;")).toHaveLength(3);
      const rollbackAt = sqls.indexOf("ROLLBACK TO SAVEPOINT risk_import_row;");
      expect(sqls[rollbackAt + 1]).toBe("RELEASE SAVEPOINT risk_import_row;");
      expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });

    it("reports every failed row, sorted by sheet row", async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO risks")) throw new Error("boom");
        return [];
      });
      const result = await strictImport(
        [
          validRow({ risk_name: "A", row_number: 9 }),
          validRow({ risk_name: "B", row_number: 3 }),
          validRow({ risk_name: "C", row_number: 5 }),
        ],
        1,
        5,
      );
      expect(result).toMatchObject({ success: false, imported: 0, failed: 3 });
      expect(result.errors.map((e) => e.row)).toEqual([3, 5, 9]);
      const sqls = mockQuery.mock.calls.map((c) => sqlOf(c));
      expect(sqls.filter((q) => q === "ROLLBACK TO SAVEPOINT risk_import_row;")).toHaveLength(3);
      expect(sqls.filter((q) => q === "RELEASE SAVEPOINT risk_import_row;")).toHaveLength(3);
    });

    it("logs a refused insert with its code, constraint, column and original stack", async () => {
      const dbError = Object.assign(new Error("null value in column\nforged line"), {
        original: { code: "23502", constraint: "risks_x_check", column: "risk_name" },
      });
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO risks")) throw dbError;
        return [];
      });
      await strictImport([validRow()], 1, 5);
      const logged = mockLogError.mock.calls[0][1] as Error;
      expect(logged).toBeInstanceOf(Error);
      expect(logged.message).toBe(
        "null value in column forged line code=23502 constraint=risks_x_check column=risk_name",
      );
      const frames = dbError.stack!.split("\n").filter((l) => /^\s+at \S/.test(l));
      expect(frames.length).toBeGreaterThan(0);
      expect(logged.stack).toBe([`Error: ${logged.message}`, ...frames].join("\n"));
    });

    it("fails the request when the creation history cannot be written", async () => {
      mockRecordCreation.mockRejectedValueOnce(new Error("history column missing"));
      await expect(strictImport([validRow()], 1, 5)).rejects.toThrow("history column missing");
      expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });

    it("writes the creation history for all imported risks at once, attributed to the importer", async () => {
      let id = 40;
      mockQuery.mockImplementation(async (sql: string) =>
        sql.includes("INSERT INTO risks") ? [{ id: ++id }] : [],
      );
      const result = await strictImport(
        [validRow({ risk_name: "A" }), validRow({ risk_name: "B" })],
        3,
        77,
      );
      expect(result).toMatchObject({ success: true, imported: 2 });
      expect(mockRecordCreation).toHaveBeenCalledTimes(1);
      expect(mockRecordCreation).toHaveBeenCalledWith(
        "risk",
        [
          { id: 41, data: expect.objectContaining({ risk_name: "A", likelihood: "Possible" }) },
          { id: 42, data: expect.objectContaining({ risk_name: "B" }) },
        ],
        77,
        3,
        mockTransaction,
      );
      // Written after the last row, before the commit.
      const historyOrder = mockRecordCreation.mock.invocationCallOrder[0];
      const lastInsert = Math.max(
        ...mockQuery.mock.calls.map((c, i) =>
          sqlOf(c).includes("INSERT INTO risks") ? mockQuery.mock.invocationCallOrder[i] : 0,
        ),
      );
      expect(historyOrder).toBeGreaterThan(lastInsert);
      expect(historyOrder).toBeLessThan(mockTransaction.commit.mock.invocationCallOrder[0]);
      expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("cell values", () => {
    it("accepts numeric and rich-text cells instead of throwing", async () => {
      const result = await strictImport(
        [
          validRow({
            risk_name: 2024 as unknown as string,
            risk_description: { richText: [{ text: "Accuracy " }, { text: "drops" }] } as never,
            impact: 5 as unknown as string,
          }),
        ],
        1,
        5,
      );
      expect(result).toMatchObject({ success: true, imported: 1 });
      expect(historyData()).toMatchObject({
        risk_name: "2024",
        risk_description: "Accuracy drops",
        impact: "5",
      });
    });

    it("reports a numeric name as a duplicate of the same name in the file", async () => {
      const result = await strictImport(
        [validRow({ risk_name: 2024 as never }), validRow({ risk_name: "2024" })],
        1,
        5,
      );
      expect(result.errors[0].message).toContain("already appears on row 2");
    });

    it("still refuses a numeric date cell", async () => {
      const result = await strictImport([validRow({ deadline: 46022 as never })], 1, 5);
      expect(result.errors.map((e) => e.field)).toContain("deadline");
    });
  });

  describe("row numbers", () => {
    it("uses the sheet row number sent by the client", async () => {
      const result = await strictImport(
        [validRow({ row_number: 2 }), validRow({ risk_name: "B", row_number: 9, likelihood: "x" })],
        1,
        5,
      );
      expect(result.errors[0]).toMatchObject({ row: 9, field: "likelihood" });
    });

    it("falls back to index + 2 when the row number is missing or not a positive integer", async () => {
      const result = await strictImport(
        [
          validRow({ risk_name: "A", likelihood: "x", row_number: 0 }),
          validRow({ risk_name: "B", likelihood: "x", row_number: 3.5 }),
          validRow({ risk_name: "C", likelihood: "x" }),
        ],
        1,
        5,
      );
      expect(result.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    });

    it("reports insert failures on the sheet row", async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO risks")) throw new Error("boom");
        return [];
      });
      const result = await strictImport([validRow({ row_number: 12 })], 1, 5);
      expect(result.errors[0].row).toBe(12);
    });
  });

  describe("insert failures", () => {
    it("writes no creation history when any row fails", async () => {
      let inserts = 0;
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO risks")) {
          inserts++;
          if (inserts === 2) throw new Error("boom");
          return [{ id: 100 + inserts }];
        }
        return [];
      });
      const result = await strictImport(
        [validRow({ risk_name: "A" }), validRow({ risk_name: "B" }), validRow({ risk_name: "C" })],
        1,
        5,
      );
      expect(result.errors).toHaveLength(1);
      expect(inserts).toBe(3);
      // The import rolls back, so rows A and C get no history either.
      expect(mockRecordCreation).not.toHaveBeenCalled();
    });
  });

  describe("message keys", () => {
    it("carries the en.json key and its params on a validation error", async () => {
      const result = await strictImport([validRow({ likelihood: "x" })], 1, 5);
      expect(result.errors[0]).toMatchObject({
        field: "likelihood",
        messageKey: RISK_IMPORT_MESSAGES.likelihoodInvalid,
        params: { values: expect.stringContaining("Possible") },
      });
    });

    it("carries the duplicate-in-file key with the first row", async () => {
      const result = await strictImport([validRow(), validRow()], 1, 5);
      expect(result.errors[0]).toMatchObject({
        row: 3,
        messageKey: RISK_IMPORT_MESSAGES.duplicateInFile,
        params: { name: "Model drift", row: 2 },
      });
    });
  });

  describe("row cap", () => {
    it.each([
      ["strict", strictImport],
      ["legacy", legacyImport],
    ])("%s: refuses more than the cap before validating or writing anything", async (_, run) => {
      const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({}));
      const result = await run(rows, 1, 5);
      expect(result).toMatchObject({ success: false, imported: 0, failed: MAX_IMPORT_ROWS + 1 });
      expect(result.errors).toEqual([
        expect.objectContaining({
          row: 0,
          field: "file",
          messageKey: RISK_IMPORT_MESSAGES.tooManyRows,
        }),
      ]);
      expect(mockNotInOrg).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe("legacy (strict: false)", () => {
    it("takes no advisory lock, since it checks no existing names", async () => {
      await legacyImport([{ risk_name: "A", risk_owner: 7, risk_description: "d" }], 1, 5);
      const sqls = mockQuery.mock.calls.map((c) => sqlOf(c));
      expect(sqls.some((q) => q.includes("pg_advisory_xact_lock"))).toBe(false);
      expect(sqls.some((q) => q.includes("INSERT INTO risks"))).toBe(true);
    });

    it("returns the generic row message on a failed insert too", async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO risks")) throw new Error('relation "risks" violates x');
        return [];
      });
      const result = await legacyImport(
        [{ risk_name: "A", risk_owner: 7, risk_description: "d" }],
        1,
        5,
      );
      expect(result.errors[0].message).toBe(RISK_IMPORT_MESSAGES.rowNotSaved);
      expect(JSON.stringify(result)).not.toContain("violates");
    });

    const sparse = (overrides: Partial<RiskImportRow> = {}): RiskImportRow => ({
      risk_name: "Model drift",
      risk_owner: 7,
      risk_description: "Accuracy degrades",
      ...overrides,
    });

    it("accepts a row without phase, likelihood or severity", async () => {
      const result = await legacyImport([sparse()], 1, 5);
      expect(result).toMatchObject({ success: true, imported: 1 });
    });

    it("still enum-checks phase, likelihood and severity when present", async () => {
      const result = await legacyImport(
        [sparse({ ai_lifecycle_phase: "x", likelihood: "y", severity: "z" })],
        1,
        5,
      );
      expect(result.errors.map((e) => e.field).sort()).toEqual([
        "ai_lifecycle_phase",
        "likelihood",
        "severity",
      ]);
    });

    it("still requires name, owner and description", async () => {
      const result = await legacyImport([{}], 1, 5);
      expect(result.errors.map((e) => e.field).sort()).toEqual([
        "risk_description",
        "risk_name",
        "risk_owner",
      ]);
    });

    it("drops unknown categories silently and keeps the known ones", async () => {
      const result = await legacyImport(
        [sparse({ risk_category: "Operational risk, Made up risk" })],
        1,
        5,
      );
      expect(result.success).toBe(true);
      expect(historyData()).toMatchObject({
        risk_category: ["Operational risk"],
      });
    });

    it("does not check duplicate names, in the file or in the organization", async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO risks")) return [{ id: 1 }];
        if (sql.includes("FROM risks")) return [{ risk_name: "Model drift" }];
        return [];
      });
      const result = await legacyImport([sparse(), sparse()], 1, 5);
      expect(result).toMatchObject({ success: true, imported: 2 });
      expect(mockQuery.mock.calls.some((c) => sqlOf(c).includes("FROM risks"))).toBe(false);
    });

    it("numbers rows index + 2 and ignores a sent row_number", async () => {
      const result = await legacyImport(
        [sparse({ row_number: 40, likelihood: "x" }), sparse({ row_number: 41, likelihood: "x" })],
        1,
        5,
      );
      expect(result.errors.map((e) => e.row)).toEqual([2, 3]);
    });

    it("keeps the bug fixes: string coercion and creation history", async () => {
      const result = await legacyImport([sparse({ impact: 5 as never })], 1, 5);
      expect(result.success).toBe(true);
      expect(historyData()).toMatchObject({ impact: "5" });
    });
  });

  describe("approval (decision 5, K9)", () => {
    // Importing user 5; user 7 owns, user 8 approves.
    const approvalRow = (overrides: Partial<RiskImportRow> = {}) =>
      validRow({ risk_approval: 8, ...overrides });
    const statusError = (result: { errors: Array<{ field: string }> }, field: string) =>
      result.errors.find((e) => e.field === field);

    describe("strict (/api/v1)", () => {
      it.each(["In progress", "Maybe", "Completed"])(
        "rejects the file when a row's status is %p",
        async (status) => {
          const result = await strictImport([approvalRow({ approval_status: status })], 1, 5);
          expect(result.success).toBe(false);
          expect(statusError(result, "approval_status")).toMatchObject({
            row: 2,
            messageKey: RISK_IMPORT_MESSAGES.approvalStatusInvalid,
            params: { values: "Pending, Approved, Rejected, Not required" },
          });
          expect(mockQuery.mock.calls.some((c) => sqlOf(c).includes("INSERT INTO risks"))).toBe(
            false,
          );
        },
      );

      it("accepts the four values however they are spelled", async () => {
        const result = await strictImport(
          [
            approvalRow({ risk_name: "A", approval_status: "pending" }),
            approvalRow({ risk_name: "B", approval_status: "NOT_REQUIRED" }),
          ],
          1,
          5,
        );
        expect(result.success).toBe(true);
      });

      it.each(["Approved", "rejected"])(
        "rejects %p from an importer who is not an Admin, approver or not",
        async (status) => {
          for (const approver of [8, undefined]) {
            const result = await strictImport(
              [validRow({ risk_approval: approver, approval_status: status })],
              1,
              5,
            );
            expect(result.success).toBe(false);
            expect(statusError(result, "approval_status")).toMatchObject({
              messageKey: RISK_IMPORT_MESSAGES.approvalDecisionAdminOnly,
            });
          }
        },
      );

      it("rejects a non-Admin naming themself as the approver", async () => {
        const result = await strictImport([approvalRow({ risk_approval: 5 })], 1, 5);
        expect(result.success).toBe(false);
        expect(statusError(result, "risk_approval")).toMatchObject({
          messageKey: RISK_IMPORT_MESSAGES.approverSelf,
        });
      });

      it("lets an Admin import a decision and name themself", async () => {
        const result = await strictImport(
          [approvalRow({ risk_approval: 5, approval_status: "Approved" })],
          1,
          5,
          true,
        );
        expect(result.success).toBe(true);
        expect(historyData()).toMatchObject({ risk_approval: 5, approval_status: "Approved" });
      });

      it("stores a blank status as Pending with an approver, Not required without", async () => {
        const result = await strictImport(
          [approvalRow({ risk_name: "A" }), validRow({ risk_name: "B" })],
          1,
          5,
        );
        expect(result.success).toBe(true);
        expect(historyData(0)).toMatchObject({ approval_status: "Pending" });
        expect(historyData(1)).toMatchObject({ approval_status: "Not required" });
      });
    });

    describe("legacy (strict: false) keeps its accept rules (K2)", () => {
      it("maps an unknown status and a non-Admin decision silently", async () => {
        const result = await legacyImport(
          [
            approvalRow({ risk_name: "A", approval_status: "In progress" }),
            validRow({ risk_name: "B", approval_status: "Maybe" }),
            approvalRow({ risk_name: "C", approval_status: "Approved" }),
          ],
          1,
          5,
        );
        expect(result.success).toBe(true);
        expect(historyData(0)).toMatchObject({ approval_status: "Pending" });
        expect(historyData(1)).toMatchObject({ approval_status: "Not required" });
        expect(historyData(2)).toMatchObject({ approval_status: "Pending" });
      });

      it("keeps a row where a non-Admin names themself, as Pending", async () => {
        const result = await legacyImport(
          [approvalRow({ risk_approval: 5, approval_status: "Approved" })],
          1,
          5,
        );
        expect(result.success).toBe(true);
        expect(historyData()).toMatchObject({ risk_approval: 5, approval_status: "Pending" });
      });
    });

    describe("approver notices", () => {
      it("hands every imported risk with an approver to the notifier after commit", async () => {
        let id = 100;
        mockQuery.mockImplementation(async (sql: string) =>
          sql.includes("INSERT INTO risks") ? [{ id: id++ }] : [],
        );
        mockNotifyApprovers.mockImplementation(async () => {
          expect(mockTransaction.commit).toHaveBeenCalled();
        });
        const result = await strictImport(
          [
            approvalRow({ risk_name: "A" }),
            validRow({ risk_name: "B" }),
            approvalRow({ risk_name: "C", risk_approval: 9 }),
          ],
          1,
          5,
        );
        expect(result.success).toBe(true);
        expect(mockNotifyApprovers).toHaveBeenCalledTimes(1);
        const [org, assigner, risks] = mockNotifyApprovers.mock.calls[0];
        expect(org).toBe(1);
        expect(assigner).toBe(5);
        expect(risks).toEqual([
          expect.objectContaining({ id: 100, risk_name: "A", risk_approval: 8 }),
          expect.objectContaining({ id: 102, risk_name: "C", risk_approval: 9 }),
        ]);
      });

      it("does not fail the import when the notifier fails", async () => {
        mockNotifyApprovers.mockRejectedValue(new Error("smtp down"));
        const result = await strictImport([approvalRow()], 1, 5);
        expect(result.success).toBe(true);
      });

      it("sends nothing for a rejected import", async () => {
        await strictImport([approvalRow({ approval_status: "Maybe" })], 1, 5);
        expect(mockNotifyApprovers).not.toHaveBeenCalled();
      });
    });
  });
});
