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
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  recordEntityCreation: (...args: unknown[]) => mockRecordCreation(...args),
}));

import { buildExcelTemplate, importRisks, RiskImportRow } from "../riskImport.service";

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

describe("importRisks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotInOrg.mockResolvedValue([]);
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
      const result = await importRisks([validRow(override)], 1, 5);
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
    const result = await importRisks(
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
        sql.includes("FROM risks") ? [{ name: "model drift" }] : [],
      );
      const result = await importRisks([validRow({ risk_name: "  MODEL Drift " })], 9, 5);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatchObject({ row: 2, field: "risk_name" });
      expect(result.errors[0].message).toContain("already exists");
      const lookup = mockQuery.mock.calls.find((c) => sqlOf(c).includes("FROM risks"))!;
      expect(sqlOf(lookup)).toContain("organization_id = :organizationId");
      expect((lookup[1] as any).replacements.organizationId).toBe(9);
      expect(mockQuery.mock.calls.some((c) => sqlOf(c).includes("INSERT INTO risks"))).toBe(false);
    });

    it("rejects a name repeated earlier in the same file", async () => {
      const result = await importRisks(
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
      const result = await importRisks(
        [validRow({ risk_name: "A" }), validRow({ risk_name: "B" }), validRow({ risk_name: "C" })],
        1,
        5,
      );
      expect(result.success).toBe(false);
      expect(result.imported).toBe(0);
      expect(result.errors).toEqual([
        { row: 2, field: "general", message: "Failed to import: value too long" },
      ]);
      // Rows 2 and 3 were attempted after the failure instead of tripping on an aborted transaction.
      expect(inserts).toBe(3);
      const sqls = mockQuery.mock.calls.map((c) => sqlOf(c));
      expect(sqls).toContain("ROLLBACK TO SAVEPOINT risk_import_row_0");
      expect(sqls).toContain("RELEASE SAVEPOINT risk_import_row_1");
      expect(sqls).toContain("RELEASE SAVEPOINT risk_import_row_2");
      expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });

    it("writes a creation history entry per imported risk, attributed to the importer", async () => {
      let id = 40;
      mockQuery.mockImplementation(async (sql: string) =>
        sql.includes("INSERT INTO risks") ? [{ id: ++id }] : [],
      );
      const result = await importRisks(
        [validRow({ risk_name: "A" }), validRow({ risk_name: "B" })],
        3,
        77,
      );
      expect(result).toMatchObject({ success: true, imported: 2 });
      expect(mockRecordCreation).toHaveBeenCalledTimes(2);
      expect(mockRecordCreation).toHaveBeenNthCalledWith(
        1,
        "risk",
        41,
        77,
        3,
        expect.objectContaining({ risk_name: "A", likelihood: "Possible" }),
        mockTransaction,
      );
      expect(mockRecordCreation.mock.calls[1][1]).toBe(42);
      expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    });
  });
});
