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

// The /api/v1 contract; the legacy rules are covered in the "legacy" block.
const strictImport = (rows: RiskImportRow[], org: number, user: number) =>
  importRisks(rows, org, user, { strict: true });
const legacyImport = (rows: RiskImportRow[], org: number, user: number) =>
  importRisks(rows, org, user, { strict: false });

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
      const result = await strictImport(
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
      expect(mockRecordCreation.mock.calls[0][4]).toMatchObject({
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
    it("skips the creation history for rows after the first failed insert", async () => {
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
      // Row A was written before the failure; row C comes after it and is rolled back anyway.
      expect(mockRecordCreation).toHaveBeenCalledTimes(1);
    });
  });

  describe("legacy (strict: false)", () => {
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
      expect(mockRecordCreation.mock.calls[0][4]).toMatchObject({
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
      expect(mockRecordCreation.mock.calls[0][4]).toMatchObject({ impact: "5" });
    });
  });
});
