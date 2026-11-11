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

  describe("re-importing an existing framework (any case)", () => {
    /**
     * Existing structure: topics 1 (id 900), 2 (id 901, assessed), 3 (id 902,
     * not assessed); subtopics 1.1 (id 950 under 1), 2.1 (id 951 under 2,
     * not assessed), 3.1 (id 952 under 3, assessed).
     * The new sheet keeps topic 1 (renamed) with 1.1, adds topic 4 and 1.2.
     */
    function existingStructure(withData: { topics: number[]; subtopics: number[] }) {
      mockQuery.mockImplementation(async (sql: string, options: any) => {
        if (sql.includes("FROM imported_frameworks")) return [{ id: 55 }];
        if (sql.startsWith("SELECT id, topic_number FROM imported_framework_topics")) {
          return [
            { id: 900, topic_number: "1" },
            { id: 901, topic_number: "2" },
            { id: 902, topic_number: "3" },
          ];
        }
        if (sql.includes("SELECT s.id, s.topic_id, s.subtopic_number")) {
          return [
            { id: 950, topic_id: 900, subtopic_number: "1.1" },
            { id: 951, topic_id: 901, subtopic_number: "2.1" },
            { id: 952, topic_id: 902, subtopic_number: "3.1" },
          ];
        }
        if (sql.startsWith("UPDATE imported_framework_topics AS s")) return [{ id: 900 }];
        if (sql.startsWith("UPDATE imported_framework_subtopics AS s")) return [];
        if (sql.includes("INSERT INTO imported_framework_topics")) {
          return [{ id: 903, topic_number: "4" }];
        }
        if (sql.includes("SELECT DISTINCT i.topic_id")) {
          return withData.topics
            .filter((id) => options.replacements.structIds.includes(id))
            .map((id) => ({ id }));
        }
        if (sql.includes("SELECT DISTINCT i.subtopic_id")) {
          return withData.subtopics
            .filter((id) => options.replacements.structIds.includes(id))
            .map((id) => ({ id }));
        }
        if (sql.includes("SET is_retired = TRUE")) {
          return options.replacements.ids.map((id: number) => ({ id }));
        }
        return [];
      });
    }

    const sheet = () => [
      validRow({ topic_name: "Governance v2", subtopic_number: "1.1", subtopic_name: "Acc" }),
      validRow({ topic_name: "Governance v2", subtopic_number: "1.2", subtopic_name: "New" }),
      validRow({ topic_number: "4", topic_name: "Monitoring" }),
    ];

    it("updates in place, retires assessed items, deletes the rest and seeds use cases", async () => {
      spyOnTx();
      existingStructure({ topics: [901], subtopics: [952] });

      const result = await importFramework(sheet(), ORG_ID, USER_ID);

      expect(result).toMatchObject({
        success: true,
        imported_framework_id: 55,
        added: 2, // topic 4, subtopic 1.2
        updated: 1, // topic 1 renamed
        retired: 3, // subtopic 3.1 (data), topic 2 (data), topic 3 (keeps 3.1)
        removed: 1, // subtopic 2.1
      });
      expect(committed()).toBe(true);
      expectOrgScopedAndOffTheCatalog();

      const all = statements();
      expect(all[0].sql).toContain("lower(name) = lower(:frameworkName)");
      expect(all[0].sql).toContain("FOR UPDATE");
      expect(all.some((s) => s.sql.includes("INSERT INTO imported_frameworks"))).toBe(false);
      // Nothing is wiped wholesale.
      expect(
        all.some(
          (s) =>
            s.sql.includes("DELETE FROM imported_framework_topics") && !s.sql.includes("IN (:ids)"),
        ),
      ).toBe(false);

      const topicUpdate = all.find((s) =>
        s.sql.startsWith("UPDATE imported_framework_topics AS s"),
      )!;
      expect(topicUpdate.sql).toContain("is_retired = FALSE");
      expect(topicUpdate.replacements).toMatchObject({ i0: 900, n0: "Governance v2", o0: 0 });
      const subInsert = all.find((s) =>
        s.sql.includes("INSERT INTO imported_framework_subtopics"),
      )!;
      expect(subInsert.replacements).toMatchObject({ p0: 900, n0: "1.2", o0: 1 });

      const retire = all.filter((s) => s.sql.includes("SET is_retired = TRUE"));
      expect(retire.map((s) => s.replacements.ids)).toEqual([[952], [901, 902]]);
      const subDelete = all.find((s) =>
        s.sql.startsWith("DELETE FROM imported_framework_subtopics"),
      )!;
      expect(subDelete.replacements.ids).toEqual([951]);
      // Empty assessment rows go before the subtopic they point at (RESTRICT FK).
      const implDelete = all.findIndex((s) =>
        s.sql.includes("DELETE FROM imported_framework_subtopic_impl"),
      );
      expect(implDelete).toBeGreaterThan(-1);
      expect(implDelete).toBeLessThan(all.indexOf(subDelete));
      expect(all.some((s) => s.sql.startsWith("DELETE FROM imported_framework_topics"))).toBe(
        false,
      );

      // Every attached use case gets rows for the new items, in the same transaction.
      const seeds = all.filter((s) =>
        /INSERT INTO imported_framework_(sub)?topic_impl\b/.test(s.sql),
      );
      expect(seeds).toHaveLength(2);
      for (const seed of seeds) {
        expect(seed.sql).toContain("l.imported_framework_id = :scopeId");
        expect(seed.replacements.scopeId).toBe(55);
      }
      for (const [, options] of mockQuery.mock.calls) expect(options.transaction).toBe(FAKE_TX);
    });

    it("deletes missing items nobody assessed", async () => {
      spyOnTx();
      existingStructure({ topics: [], subtopics: [] });

      const result = await importFramework(sheet(), ORG_ID, USER_ID);

      expect(result).toMatchObject({ added: 2, updated: 1, retired: 0, removed: 4 });
      const all = statements();
      expect(
        all.find((s) => s.sql.startsWith("DELETE FROM imported_framework_subtopics"))!.replacements
          .ids,
      ).toEqual([951, 952]);
      expect(
        all.find((s) => s.sql.startsWith("DELETE FROM imported_framework_topics"))!.replacements
          .ids,
      ).toEqual([901, 902]);
      expect(all.some((s) => s.sql.includes("SET is_retired = TRUE"))).toBe(false);
    });
  });

  it("reports everything as added on a first import", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([]) // no existing imported framework
      .mockResolvedValueOnce([{ id: 101 }]) // imported_frameworks INSERT
      .mockResolvedValueOnce([{ id: 1001, topic_number: "1" }]) // topics INSERT
      .mockResolvedValueOnce([]); // subtopics INSERT
    const result = await importFramework(
      [validRow({ subtopic_number: "1.1", subtopic_name: "Acc" })],
      ORG_ID,
      USER_ID,
    );
    expect(result).toMatchObject({ added: 2, updated: 0, retired: 0, removed: 0 });
    // No use case can use a brand new framework, so nothing is seeded.
    expect(statements().some((s) => s.sql.includes("_impl"))).toBe(false);
  });

  // Sequelize's UniqueConstraintError carries the Postgres code on
  // .parent / .original; a bare driver error carries it on itself.
  it.each([
    ["Sequelize .original", { original: { code: "23505" } }],
    ["Sequelize .parent", { parent: { code: "23505" } }],
    ["bare driver .code", { code: "23505" }],
  ])(
    "rolls back and maps a racing duplicate name to ConflictException (%s)",
    async (_label, shape) => {
      spyOnTx();
      mockQuery.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), shape));

      await expect(importFramework([validRow()], ORG_ID, USER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(rolledBack()).toBe(true);
    },
  );
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

  it("maps a rename onto an existing name (Sequelize UniqueConstraintError) to 409", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([{ id: 9 }]) // guard select
      .mockRejectedValueOnce(
        Object.assign(new Error("Validation error"), {
          name: "SequelizeUniqueConstraintError",
          parent: { code: "23505" },
          original: { code: "23505" },
        }),
      );

    await expect(
      updateImportedFrameworkQuery(9, ORG_ID, { name: "Taken name" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rolledBack()).toBe(true);
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
      .mockResolvedValueOnce([]) // no use case uses it
      .mockResolvedValueOnce([]) // DELETE subtopics
      .mockResolvedValueOnce([]) // DELETE topics
      .mockResolvedValueOnce([]); // DELETE framework

    await deleteImportedFrameworkQuery(9, ORG_ID);
    expect(committed()).toBe(true);
    expectOrgScopedAndOffTheCatalog();
    const sqls = statements().map((s) => s.sql);
    expect(sqls[0]).toContain("FOR UPDATE");
    expect(sqls.some((s) => s.includes("DELETE FROM imported_framework_subtopics"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM imported_frameworks"))).toBe(true);
  });

  it("409s with the use case names while a use case uses it, deleting nothing", async () => {
    spyOnTx();
    mockQuery
      .mockResolvedValueOnce([{ id: 9 }]) // guard select
      .mockResolvedValueOnce([{ project_title: "Chatbot" }, { project_title: "Scoring" }]);

    const error = await deleteImportedFrameworkQuery(9, ORG_ID).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.metadata.use_cases).toEqual(["Chatbot", "Scoring"]);
    expect(error.i18nVars).toEqual({ names: "Chatbot, Scoring" });
    expect(rolledBack()).toBe(true);
    expect(statements().some((s) => s.sql.includes("DELETE"))).toBe(false);
    expectOrgScopedAndOffTheCatalog();
  });

  it("404s when the framework is not an org-owned import", async () => {
    spyOnTx();
    mockQuery.mockResolvedValueOnce([]);

    await expect(deleteImportedFrameworkQuery(2, ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(rolledBack()).toBe(true);
  });
});
