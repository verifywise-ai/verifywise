import { QueryTypes } from "sequelize";
import {
  ConflictException,
  NotFoundException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  buildExcelTemplate,
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
    const errors = validateRow(
      validRow({ topic_name: { richText: [{ text: "  " }] } as any }),
      2,
    );
    expect(errors.some((e) => e.field === "topic_name")).toBe(true);
  });
});

describe("importFramework", () => {
  it("fails the whole batch when any row is invalid, without touching the DB", async () => {
    const result = await importFramework(
      [validRow(), validRow({ topic_name: "" }), validRow({ topic_number: "2" })],
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

  it("inserts a new imported framework with deduped topics and subtopics", async () => {
    spyOnTx();
    mockQuery
      // no existing imported framework
      .mockResolvedValueOnce([])
      // frameworks INSERT ... RETURNING id
      .mockResolvedValueOnce([{ id: 101 }])
      // topic 1 INSERT
      .mockResolvedValueOnce([{ id: 1001 }])
      // topic 2 INSERT
      .mockResolvedValueOnce([{ id: 1002 }]);

    const result = await importFramework(
      [
        validRow({ subtopic_number: "1.1", subtopic_name: "Accountability" }),
        validRow({ subtopic_number: "1.2", subtopic_name: "Oversight" }),
        validRow({ topic_number: "2", topic_name: "Risk management" }),
      ],
      ORG_ID,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(result.imported_framework_id).toBe(101);
    expect(result.imported_topics).toBe(2);
    expect(result.imported_subtopics).toBe(2);
    expect(result.failed).toBe(0);
    expect(committed()).toBe(true);
    expect(rolledBack()).toBe(false);

    // framework insert carries org + source (call 1: the upsert SELECT)
    const frameworkInsertCall = mockQuery.mock.calls.find(([sql]: [string]) =>
      (sql as string).includes("INSERT INTO frameworks"),
    )!;
    expect(frameworkInsertCall[0] as string).toContain("'imported'");
    expect(frameworkInsertCall[1].replacements).toMatchObject({
      organizationId: ORG_ID,
      frameworkName: "Internal AI Policy",
    });
    // topic dedup: 2 INSERTs for 3 rows
    const topicInserts = mockQuery.mock.calls.filter(([sql]: [string]) =>
      sql.includes("INSERT INTO imported_framework_topics"),
    );
    expect(topicInserts).toHaveLength(2);
  });

  it("re-importing the same name replaces the existing structure (idempotent upsert)", async () => {
    spyOnTx();
    mockQuery
      // existing imported framework found
      .mockResolvedValueOnce([{ id: 55 }])
      // UPDATE frameworks description
      .mockResolvedValueOnce([])
      // DELETE subtopics
      .mockResolvedValueOnce([])
      // DELETE topics
      .mockResolvedValueOnce([])
      // topic INSERT
      .mockResolvedValueOnce([{ id: 900 }]);

    const result = await importFramework([validRow()], ORG_ID, USER_ID);

    expect(result.success).toBe(true);
    expect(result.imported_framework_id).toBe(55);
    // no frameworks INSERT — the existing row was reused
    const frameworkInserts = mockQuery.mock.calls.filter(([sql]: [string]) =>
      sql.includes("INSERT INTO frameworks"),
    );
    expect(frameworkInserts).toHaveLength(0);
    expect(committed()).toBe(true);
  });

  it("rolls back and maps unique violations to ConflictException", async () => {
    spyOnTx();
    mockQuery.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));

    await expect(importFramework([validRow()], ORG_ID, USER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(rolledBack()).toBe(true);
  });
});

describe("listImportedFrameworksQuery", () => {
  it("scopes the listing to the organization and imported source", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5, name: "X", topics: [] }]);
    const rows = await listImportedFrameworksQuery(ORG_ID);
    expect(rows).toEqual([{ id: 5, name: "X", topics: [] }]);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql as string).toContain("f.organization_id = :organizationId");
    expect(sql as string).toContain("f.source = 'imported'");
    expect(options.replacements).toEqual({ organizationId: ORG_ID });
    expect(options.type).toBe(QueryTypes.SELECT);
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
  });

  it("404s when the framework is bundled or belongs to another org", async () => {
    spyOnTx();
    mockQuery.mockResolvedValueOnce([]); // guard select finds nothing

    await expect(
      updateImportedFrameworkQuery(1, ORG_ID, { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rolledBack()).toBe(true);
  });

  it("rejects invalid names before touching the DB", async () => {
    await expect(updateImportedFrameworkQuery(9, ORG_ID, { name: "x" })).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("deleteImportedFrameworkQuery", () => {
  it("deletes structure then the framework row in one transaction", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([{ id: 9 }]) // guard select
      .mockResolvedValueOnce([]) // DELETE subtopics
      .mockResolvedValueOnce([]) // DELETE topics
      .mockResolvedValueOnce([]); // DELETE framework

    await deleteImportedFrameworkQuery(9, ORG_ID);
    expect(committed()).toBe(true);
    const statements = mockQuery.mock.calls.map(([sql]: [string]) => sql);
    expect(statements.some((s) => s.includes("DELETE FROM imported_framework_subtopics"))).toBe(
      true,
    );
    expect(statements.some((s) => s.includes("DELETE FROM frameworks"))).toBe(true);
  });

  it("404s when the framework is not an org-owned import", async () => {
    spyOnTx();
    mockQuery.mockResolvedValueOnce([]);

    await expect(deleteImportedFrameworkQuery(2, ORG_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rolledBack()).toBe(true);
  });
});
