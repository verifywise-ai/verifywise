import { QueryTypes } from "sequelize";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  asText,
  buildExcelTemplate,
  MAX_IMPORT_ROWS,
  normalizePatch,
  validateStructure,
  deleteImportedFrameworkQuery,
  importFramework,
  listImportedFrameworksQuery,
  updateImportedFrameworkQuery,
  validateRow,
  FrameworkImportRow,
} from "../frameworkImport.service";
import { sequelize } from "../../../database/db";

jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockQuery = sequelize.query as jest.Mock;
const mockTransaction = sequelize.transaction as jest.Mock;

const FAKE_TX = { id: "tx" };

const ORG_ID = 7;
const USER_ID = 42;

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockResolvedValue(FAKE_TX);
});

function committed() {
  return (FAKE_TX as any).commit.mock.calls.length > 0;
}
function rolledBack() {
  return (FAKE_TX as any).rollback.mock.calls.length > 0;
}

/** Wire commit/rollback spies onto the fake transaction before each test that needs them. */
function spyOnTx() {
  (FAKE_TX as any).commit = jest.fn().mockResolvedValue(undefined);
  (FAKE_TX as any).rollback = jest.fn().mockResolvedValue(undefined);
}

const validRow = (overrides: Partial<FrameworkImportRow> = {}): FrameworkImportRow => ({
  framework_name: "Internal AI Policy",
  framework_description: "Org-wide AI governance policy",
  topic_number: "1",
  topic_name: "Governance",
  ...overrides,
});

describe("buildExcelTemplate", () => {
  it("returns a styled workbook buffer and the expected filename", async () => {
    const { buffer, filename } = await buildExcelTemplate(ORG_ID);
    expect(filename).toBe("framework_import_template.xlsx");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // .xlsx files start with the ZIP local-file magic "PK"
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("validateRow", () => {
  it("accepts a fully populated row", () => {
    expect(validateRow(validRow(), 2)).toEqual([]);
  });

  it("requires framework name, topic number and topic name", () => {
    const errors = validateRow({}, 5);
    const fields = errors.map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(["framework_name", "topic_number", "topic_name"]),
    );
    expect(errors.every((e) => e.row === 5)).toBe(true);
  });

  it("rejects a one-character framework name", () => {
    const errors = validateRow(validRow({ framework_name: "A" }), 2);
    expect(errors.some((e) => e.field === "framework_name")).toBe(true);
  });

  it("requires subtopic number when subtopic name is present", () => {
    const errors = validateRow(validRow({ subtopic_name: "Accountability" }), 2);
    expect(errors).toEqual([
      {
        row: 2,
        field: "subtopic_number",
        message: "Subtopic number is required when subtopic name is provided",
      },
    ]);
  });

  it("requires subtopic name when subtopic number is present", () => {
    const errors = validateRow(validRow({ subtopic_number: "1.1" }), 2);
    expect(errors).toEqual([
      {
        row: 2,
        field: "subtopic_name",
        message: "Subtopic name is required when subtopic number is provided",
      },
    ]);
  });

  it("flattens ExcelJS rich-text cell values", () => {
    const errors = validateRow(validRow({ topic_name: { richText: [{ text: "  " }] } as any }), 2);
    expect(errors.some((e) => e.field === "topic_name")).toBe(true);
  });
});

/** Every statement the service ran, with its replacements. */
function statements(): Array<{ sql: string; replacements: Record<string, unknown> }> {
  return mockQuery.mock.calls.map(([sql, options]: [string, any]) => ({
    sql,
    replacements: options?.replacements ?? {},
  }));
}

/**
 * Tenant scoping, checked on every statement: it names this org's id and
 * never touches the global `frameworks` catalog (only imported_* tables).
 */
function expectOrgScopedAndOffTheCatalog() {
  const all = statements();
  expect(all.length).toBeGreaterThan(0);
  for (const { sql, replacements } of all) {
    expect(sql).not.toMatch(/(?<!imported_)\bframeworks\b/);
    expect(sql).toMatch(/organization_id/);
    expect(replacements.organizationId).toBe(ORG_ID);
  }
}

describe("asText", () => {
  it("reads the cached result of a formula cell instead of [object Object]", () => {
    expect(asText({ formula: "A1&B1", result: "Governance" })).toBe("Governance");
    expect(asText({ sharedFormula: "A1", result: 12 })).toBe("12");
    expect(asText({ formula: "A1" })).toBeUndefined();
  });

  it("flattens rich text and hyperlinks, and drops error cells", () => {
    expect(asText({ richText: [{ text: " Gover" }, { text: "nance " }] })).toBe("Governance");
    expect(asText({ text: "Docs", hyperlink: "https://x" })).toBe("Docs");
    expect(asText({ error: "#REF!" })).toBeUndefined();
  });

  it("formats dates as YYYY-MM-DD", () => {
    expect(asText(new Date("2026-01-02T00:00:00Z"))).toBe("2026-01-02");
  });
});

describe("validateStructure", () => {
  it("reports a subtopic number repeated under the same topic, on the repeating row", () => {
    const errors = validateStructure([
      validRow({ subtopic_number: "1.1", subtopic_name: "A" }),
      validRow({ subtopic_number: "1.1", subtopic_name: "B" }),
    ]);
    expect(errors).toEqual([
      {
        row: 3,
        field: "subtopic_number",
        message: "Subtopic 1.1 already appears under topic 1 on row 2",
      },
    ]);
  });

  it("allows the same subtopic number under different topics", () => {
    expect(
      validateStructure([
        validRow({ subtopic_number: "a", subtopic_name: "A" }),
        validRow({
          topic_number: "2",
          topic_name: "Risk",
          subtopic_number: "a",
          subtopic_name: "A",
        }),
      ]),
    ).toEqual([]);
  });

  it("reports a topic number reused with a different name instead of merging silently", () => {
    const errors = validateStructure([validRow(), validRow({ topic_name: "Oversight" })]);
    expect(errors).toEqual([
      {
        row: 3,
        field: "topic_name",
        message:
          'Topic 1 is named "Governance" on row 2; every row of a topic must use the same name',
      },
    ]);
  });
});

describe("importFramework", () => {
  it("fails the whole batch when any row is invalid, without touching the DB", async () => {
    const result = await importFramework(
      [
        validRow(),
        validRow({ topic_name: "" }),
        validRow({ topic_number: "2", topic_name: "Risk" }),
      ],
      ORG_ID,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.failed).toBe(3);
    expect(result.imported_topics).toBe(0);
    expect(result.errors).toEqual([
      { row: 3, field: "topic_name", message: "Topic name is required" },
    ]);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects sheets that switch framework name mid-way", async () => {
    const result = await importFramework(
      [validRow(), validRow({ framework_name: "Other Framework" })],
      ORG_ID,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      {
        row: 3,
        field: "framework_name",
        message: "All rows must define the same framework",
      },
    ]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns duplicate subtopics as row errors instead of a name conflict", async () => {
    const result = await importFramework(
      [
        validRow({ subtopic_number: "1.1", subtopic_name: "A" }),
        validRow({ subtopic_number: "1.1", subtopic_name: "A" }),
      ],
      ORG_ID,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.errors.map((e) => [e.row, e.field])).toEqual([[3, "subtopic_number"]]);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rows before validating or writing`, async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) =>
      validRow({ subtopic_number: String(i), subtopic_name: "S" }),
    );
    const result = await importFramework(rows, ORG_ID, USER_ID);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 0, field: "file" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("inserts a new org-owned framework with one batched insert per level", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([]) // no existing imported framework
      .mockResolvedValueOnce([{ id: 101 }]) // imported_frameworks INSERT
      .mockResolvedValueOnce([
        { id: 1001, topic_number: "1" },
        { id: 1002, topic_number: "2" },
      ]) // topics INSERT
      .mockResolvedValueOnce([]); // subtopics INSERT

    const result = await importFramework(
      [
        validRow({ subtopic_number: "1.1", subtopic_name: "Accountability" }),
        validRow({ subtopic_number: "1.2", subtopic_name: "Oversight" }),
        validRow({ topic_number: "2", topic_name: "Risk management" }),
      ],
      ORG_ID,
      USER_ID,
    );

    expect(result).toMatchObject({
      success: true,
      imported_framework_id: 101,
      imported_topics: 2,
      imported_subtopics: 2,
      failed: 0,
    });
    expect(committed()).toBe(true);
    expect(rolledBack()).toBe(false);
    expectOrgScopedAndOffTheCatalog();

    const all = statements();
    const frameworkInsert = all.find((s) => s.sql.includes("INSERT INTO imported_frameworks"))!;
    expect(frameworkInsert.replacements).toMatchObject({
      frameworkName: "Internal AI Policy",
      userId: USER_ID,
    });
    expect(all.filter((s) => s.sql.includes("INSERT INTO imported_framework_topics"))).toHaveLength(
      1,
    );
    const subInsert = all.find((s) => s.sql.includes("INSERT INTO imported_framework_subtopics"))!;
    // Both subtopics land under topic 1 (id 1001), in sheet order.
    expect(subInsert.replacements).toMatchObject({ p0: 1001, o0: 0, p1: 1001, o1: 1 });
  });

  it("re-importing the same name (any case) replaces this org's structure only", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([{ id: 55 }]) // existing imported framework
      .mockResolvedValueOnce([]) // UPDATE description
      .mockResolvedValueOnce([]) // DELETE subtopics
      .mockResolvedValueOnce([]) // DELETE topics
      .mockResolvedValueOnce([{ id: 900, topic_number: "1" }]); // topics INSERT

    const result = await importFramework([validRow()], ORG_ID, USER_ID);

    expect(result.success).toBe(true);
    expect(result.imported_framework_id).toBe(55);
    expectOrgScopedAndOffTheCatalog();
    const all = statements();
    expect(all[0].sql).toContain("lower(name) = lower(:frameworkName)");
    expect(all.some((s) => s.sql.includes("INSERT INTO imported_frameworks"))).toBe(false);
    expect(committed()).toBe(true);
  });

  it("rolls back and maps a racing duplicate name to ConflictException", async () => {
    spyOnTx();
    mockQuery.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));

    await expect(importFramework([validRow()], ORG_ID, USER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(rolledBack()).toBe(true);
  });
});

describe("listImportedFrameworksQuery", () => {
  it("scopes the framework, its topics and its subtopics to the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5, name: "X", topics: [] }]);
    const rows = await listImportedFrameworksQuery(ORG_ID);
    expect(rows).toEqual([{ id: 5, name: "X", topics: [] }]);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql as string).toContain("f.organization_id = :organizationId");
    expect(sql as string).toContain("topic.organization_id = :organizationId");
    expect(sql as string).toContain("sub.organization_id = :organizationId");
    expect(options.replacements).toEqual({ organizationId: ORG_ID });
    expect(options.type).toBe(QueryTypes.SELECT);
    expectOrgScopedAndOffTheCatalog();
  });
});

describe("normalizePatch", () => {
  it.each([
    [{ name: 42 }, "name"],
    [{ name: "x" }, "name"],
    [{ description: 5 }, "description"],
    [{ description: "d".repeat(1001) }, "description"],
    [{ is_active: "yes" }, "is_active"],
  ])("rejects %j as a validation error", (patch, _field) => {
    expect(() => normalizePatch(patch)).toThrow(ValidationException);
  });

  it("trims the name and keeps an explicit null description", () => {
    expect(normalizePatch({ name: "  Policy  ", description: null, is_active: false })).toEqual({
      name: "Policy",
      description: null,
      is_active: false,
    });
  });
});

describe("updateImportedFrameworkQuery", () => {
  it("updates a patch on an imported framework owned by the org", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([{ id: 9 }]) // guard select
      .mockResolvedValueOnce([]); // UPDATE

    await updateImportedFrameworkQuery(9, ORG_ID, { name: "Renamed", is_active: false });
    expect(committed()).toBe(true);
    expectOrgScopedAndOffTheCatalog();
  });

  it("404s when the framework belongs to another org", async () => {
    spyOnTx();
    mockQuery.mockResolvedValueOnce([]); // guard select finds nothing

    await expect(updateImportedFrameworkQuery(1, ORG_ID, { name: "Nope" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rolledBack()).toBe(true);
    expectOrgScopedAndOffTheCatalog();
  });

  it("rejects invalid patches before touching the DB", async () => {
    await expect(updateImportedFrameworkQuery(9, ORG_ID, { name: "x" })).rejects.toBeInstanceOf(
      ValidationException,
    );
    await expect(updateImportedFrameworkQuery(9, ORG_ID, { name: 7 })).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("deleteImportedFrameworkQuery", () => {
  it("deletes structure then the framework row in one org-scoped transaction", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([{ id: 9 }]) // guard select
      .mockResolvedValueOnce([]) // DELETE subtopics
      .mockResolvedValueOnce([]) // DELETE topics
      .mockResolvedValueOnce([]); // DELETE framework

    await deleteImportedFrameworkQuery(9, ORG_ID);
    expect(committed()).toBe(true);
    expectOrgScopedAndOffTheCatalog();
    const sqls = statements().map((s) => s.sql);
    expect(sqls.some((s) => s.includes("DELETE FROM imported_framework_subtopics"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM imported_frameworks"))).toBe(true);
  });

  it("404s when the framework is not an org-owned import", async () => {
    spyOnTx();
    mockQuery.mockResolvedValueOnce([]);

    await expect(deleteImportedFrameworkQuery(2, ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(rolledBack()).toBe(true);
  });
});
