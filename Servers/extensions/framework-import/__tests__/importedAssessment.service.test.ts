import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  attachImportedFrameworkQuery,
  countTree,
  deleteProjectImportedFrameworksQuery,
  detachImportedFrameworkQuery,
  getImportedFrameworksForProjectsQuery,
  getLinkTreeQuery,
  LinkContext,
  parseIdList,
  replaceImplRisksQuery,
  updateImplQuery,
} from "../importedAssessment.service";
import { sequelize } from "../../../database/db";

jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockQuery = sequelize.query as jest.Mock;
const mockTransaction = sequelize.transaction as jest.Mock;

const ORG_ID = 7;

function fakeTx() {
  return {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };
}
let tx: ReturnType<typeof fakeTx>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  tx = fakeTx();
  mockTransaction.mockResolvedValue(tx);
});

function statements(): Array<{ sql: string; options: any }> {
  return mockQuery.mock.calls.map(([sql, options]: [string, any]) => ({ sql, options }));
}

/** Every statement names this org and never touches the bundled framework tables. */
function expectOrgScoped() {
  const all = statements();
  expect(all.length).toBeGreaterThan(0);
  for (const { sql, options } of all) {
    expect(sql).toMatch(/organization_id/);
    expect(sql).toMatch(/:organizationId/);
    expect(options.replacements.organizationId).toBe(ORG_ID);
    expect(sql).not.toMatch(/\bprojects_frameworks\b/);
    expect(sql).not.toMatch(/(?<![_a-z])frameworks\b/);
  }
}

/** Route each statement to a canned answer by a fragment of its SQL. */
function answer(routes: Array<[string | RegExp, unknown]>) {
  mockQuery.mockImplementation(async (sql: string) => {
    for (const [match, result] of routes) {
      if (typeof match === "string" ? sql.includes(match) : match.test(sql)) {
        return typeof result === "function" ? (result as () => unknown)() : result;
      }
    }
    return [];
  });
}

const LINK: LinkContext = {
  id: 12,
  project_id: 3,
  imported_framework_id: 5,
  name: "Acme policy",
  description: "Internal",
  is_demo: false,
};

describe("attachImportedFrameworkQuery", () => {
  it("links the framework and seeds non-retired topics and subtopics in one transaction", async () => {
    answer([
      ["FROM projects\n", [{ id: 3, is_organizational: false, is_demo: true }]],
      [
        "FROM imported_frameworks",
        [{ id: 5, name: "Acme policy", description: null, is_active: true }],
      ],
      ["INSERT INTO projects_imported_frameworks", [{ id: 12, created_at: "now" }]],
      ["INSERT INTO imported_framework_topic_impl", [{ id: 1 }, { id: 2 }]],
      ["INSERT INTO imported_framework_subtopic_impl", [{ id: 3 }]],
    ]);

    const link = await attachImportedFrameworkQuery(3, 5, ORG_ID);

    expect(link).toEqual({
      id: 12,
      imported_framework_id: 5,
      name: "Acme policy",
      description: null,
      created_at: "now",
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(tx.commit).toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
    expectOrgScoped();
    for (const { options } of statements()) expect(options.transaction).toBe(tx);

    const linkInsert = statements().find((s) => s.sql.includes("INSERT INTO projects_imported"))!;
    expect(linkInsert.options.replacements).toMatchObject({
      projectId: 3,
      importedFrameworkId: 5,
      isDemo: true,
    });
    const topicSeed = statements().find((s) =>
      s.sql.includes("INTO imported_framework_topic_impl"),
    )!;
    expect(topicSeed.sql).toContain("t.is_retired = FALSE");
    expect(topicSeed.sql).toContain("l.id = :scopeId");
    expect(topicSeed.options.replacements).toMatchObject({ scopeId: 12, status: "Not started" });
    const subSeed = statements().find((s) =>
      s.sql.includes("INTO imported_framework_subtopic_impl"),
    )!;
    expect(subSeed.sql).toContain("s.is_retired = FALSE");
  });

  it("refuses the organizational project with a 400 before writing", async () => {
    answer([["FROM projects\n", [{ id: 3, is_organizational: true, is_demo: false }]]]);
    await expect(attachImportedFrameworkQuery(3, 5, ORG_ID)).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(tx.rollback).toHaveBeenCalled();
    expect(statements().some((s) => s.sql.includes("INSERT"))).toBe(false);
  });

  it("refuses an inactive import with a 400", async () => {
    answer([
      ["FROM projects\n", [{ id: 3, is_organizational: false, is_demo: false }]],
      ["FROM imported_frameworks", [{ id: 5, name: "X", description: null, is_active: false }]],
    ]);
    await expect(attachImportedFrameworkQuery(3, 5, ORG_ID)).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(statements().some((s) => s.sql.includes("INSERT"))).toBe(false);
  });

  it("treats another organization's framework as not found", async () => {
    answer([
      ["FROM projects\n", [{ id: 3, is_organizational: false, is_demo: false }]],
      ["FROM imported_frameworks", []],
    ]);
    await expect(attachImportedFrameworkQuery(3, 5, ORG_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expectOrgScoped();
  });

  it("answers a duplicate with 409 and rolls back", async () => {
    answer([
      ["FROM projects\n", [{ id: 3, is_organizational: false, is_demo: false }]],
      ["FROM imported_frameworks", [{ id: 5, name: "X", description: null, is_active: true }]],
      ["INSERT INTO projects_imported_frameworks", []],
    ]);
    await expect(attachImportedFrameworkQuery(3, 5, ORG_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(statements().some((s) => s.sql.includes("impl"))).toBe(false);
  });
});

describe("detachImportedFrameworkQuery", () => {
  it("removes evidence links of both levels, then the link, in one transaction", async () => {
    answer([["SELECT id FROM projects_imported_frameworks", [{ id: 12 }]]]);
    await detachImportedFrameworkQuery(3, 12, ORG_ID);

    const sqls = statements().map((s) => s.sql);
    const evidence = statements().filter((s) => s.sql.includes("DELETE FROM file_entity_links"));
    expect(evidence.map((s) => s.options.replacements.entityType)).toEqual([
      "imported_topic",
      "imported_subtopic",
    ]);
    for (const e of evidence) expect(e.options.replacements.frameworkType).toBe("imported");
    const linkDelete = sqls.findIndex((s) =>
      s.includes("DELETE FROM projects_imported_frameworks"),
    );
    expect(linkDelete).toBeGreaterThan(sqls.findIndex((s) => s.includes("file_entity_links")));
    expect(tx.commit).toHaveBeenCalled();
    expectOrgScoped();
  });

  it("404s a link of another use case or organization without deleting anything", async () => {
    answer([["SELECT id FROM projects_imported_frameworks", []]]);
    await expect(detachImportedFrameworkQuery(3, 12, ORG_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(statements().some((s) => s.sql.includes("DELETE"))).toBe(false);
    expect(tx.rollback).toHaveBeenCalled();
  });
});

describe("deleteProjectImportedFrameworksQuery", () => {
  it("does nothing when the use case has no imported frameworks", async () => {
    answer([]);
    await deleteProjectImportedFrameworksQuery(3, ORG_ID, tx as any);
    expect(statements()).toHaveLength(1);
  });

  it("removes evidence links and links of the use case", async () => {
    answer([["SELECT id FROM projects_imported_frameworks", [{ id: 12 }, { id: 13 }]]]);
    await deleteProjectImportedFrameworksQuery(3, ORG_ID, tx as any);
    const evidence = statements().filter((s) => s.sql.includes("file_entity_links"));
    expect(evidence[0].options.replacements.linkIds).toEqual([12, 13]);
    expect(statements().some((s) => s.sql.includes("DELETE FROM projects_imported"))).toBe(true);
    expectOrgScoped();
  });
});

describe("getImportedFrameworksForProjectsQuery", () => {
  it("skips the query for no use cases and groups rows by use case", async () => {
    expect((await getImportedFrameworksForProjectsQuery([], ORG_ID)).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();

    answer([
      [
        "FROM projects_imported_frameworks",
        [
          { project_id: 1, project_imported_framework_id: 12, imported_framework_id: 5, name: "A" },
          { project_id: 1, project_imported_framework_id: 13, imported_framework_id: 6, name: "B" },
        ],
      ],
    ]);
    const map = await getImportedFrameworksForProjectsQuery([1, 2], ORG_ID);
    expect(map.get(1)).toEqual([
      { project_imported_framework_id: 12, imported_framework_id: 5, name: "A" },
      { project_imported_framework_id: 13, imported_framework_id: 6, name: "B" },
    ]);
    expect(map.get(2)).toBeUndefined();
    expectOrgScoped();
  });
});

const topicRow = (o: Record<string, unknown>) => ({
  parent_id: 5,
  description: null,
  is_retired: false,
  impl_id: null,
  status: "Not started",
  owner: null,
  reviewer: null,
  approver: null,
  due_date: null,
  has_data: false,
  ...o,
});

describe("getLinkTreeQuery", () => {
  it("returns the generic three-level shape with retired items only when assessed", async () => {
    answer([
      [
        "FROM imported_framework_topics t\n",
        [
          topicRow({ struct_id: 1, number: "1", title: "Gov", order_no: 0, impl_id: 101 }),
          // retired, no data on this link, no kept children: omitted
          topicRow({
            struct_id: 2,
            number: "2",
            title: "Old",
            order_no: 1,
            is_retired: true,
            impl_id: 102,
          }),
          // retired, no data itself, but a retired subtopic with data: kept as its parent
          topicRow({
            struct_id: 3,
            number: "3",
            title: "Parent",
            order_no: 2,
            is_retired: true,
            impl_id: 103,
          }),
          // retired with data: kept
          topicRow({
            struct_id: 4,
            number: "4",
            title: "Kept",
            order_no: 3,
            is_retired: true,
            impl_id: 104,
            status: "Draft",
            has_data: true,
          }),
        ],
      ],
      [
        "FROM imported_framework_subtopics s",
        [
          topicRow({
            struct_id: 11,
            parent_id: 1,
            number: "1.1",
            title: "Acc",
            order_no: 0,
            impl_id: 201,
            owner: 9,
          }),
          topicRow({
            struct_id: 12,
            parent_id: 1,
            number: "1.2",
            title: "Gone",
            order_no: 1,
            is_retired: true,
            impl_id: 202,
          }),
          topicRow({
            struct_id: 31,
            parent_id: 3,
            number: "3.1",
            title: "Has data",
            order_no: 0,
            is_retired: true,
            impl_id: 301,
            status: "Audited",
            has_data: true,
          }),
        ],
      ],
    ]);

    const result = await getLinkTreeQuery(LINK, ORG_ID);

    expect(result.projects_frameworks_id).toBe(12);
    expect(result.framework).toEqual({
      id: 12,
      key: "imported",
      framework_type: "imported",
      display_name: "Acme policy",
      entity_types: { l2_impl: "imported_topic", l3_impl: "imported_subtopic" },
      hierarchy_type: "three_level",
      imported_framework_id: 5,
    });
    expect(result.tree).toHaveLength(1);
    const [l1] = result.tree;
    expect(l1).toMatchObject({ id: 5, title: "Acme policy", order_no: 1 });
    expect(l1.children.map((t) => t.struct_id)).toEqual([1, 3, 4]);
    expect(l1.children[0]).toMatchObject({
      order_no: 1,
      number: "1",
      retired: false,
      impl_id: 101,
    });
    expect(l1.children[0].children!.map((s) => s.struct_id)).toEqual([11]);
    expect(l1.children[1]).toMatchObject({ retired: true });
    expect(l1.children[1].children!.map((s) => s.struct_id)).toEqual([31]);
    expect(l1.children[2]).toMatchObject({ retired: true, status: "Draft" });

    for (const { options } of statements()) {
      expect(options.replacements).toEqual({ organizationId: ORG_ID, linkId: 12, frameworkId: 5 });
    }
    expectOrgScoped();

    const counts = countTree(result.tree);
    // Shown rows: topics 1, 3, 4 and subtopics 11, 31.
    expect(counts.progress).toEqual({ total: 5, done: 1 });
    expect(counts.assignments).toEqual({ total: 5, assigned: 1 });
    expect(counts.statusBreakdown).toMatchObject({ notStarted: 3, draft: 1, implemented: 1 });
    expect(counts.entity_type).toBe("imported_topic");
  });
});

describe("parseIdList", () => {
  it("reads JSON strings and arrays, dedupes, and treats empty as none", () => {
    expect(parseIdList(undefined, "x")).toEqual([]);
    expect(parseIdList("", "x")).toEqual([]);
    expect(parseIdList('[1, "2", 1]', "x")).toEqual([1, 2]);
    expect(parseIdList([3], "x")).toEqual([3]);
  });

  it.each(["not json", "{}", "[0]", "[-1]", "[1.5]", '["a"]'])("rejects %s with a 400", (raw) => {
    expect(() => parseIdList(raw, "risksMitigated")).toThrow(ValidationException);
  });
});

describe("updateImplQuery", () => {
  const run = (input: Record<string, unknown>, uploaded: number[] = [], deleted: number[] = []) =>
    updateImplQuery(LINK, "l3", 301, ORG_ID, input, uploaded, deleted, tx as any);

  it("rejects an unknown status before any write", async () => {
    await expect(run({ status: "Done" })).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects an owner who is not a member of the organization", async () => {
    answer([["FROM organization_members", [{ user_id: 9 }]]]);
    await expect(run({ owner: "9", reviewer: 10 })).rejects.toBeInstanceOf(ValidationException);
    const member = statements()[0];
    expect(member.options.replacements).toEqual({ organizationId: ORG_ID, userIds: [9, 10] });
    expect(statements().some((s) => s.sql.startsWith("UPDATE"))).toBe(false);
  });

  it.each([
    [{ implementation_description: 5 }],
    [{ due_date: "next week" }],
    [{ owner: "abc" }],
    [{ risksMitigated: "[1," }],
  ])("rejects %j with a 400 before writing", async (input) => {
    await expect(run(input)).rejects.toBeInstanceOf(ValidationException);
    expect(statements().some((s) => /^\s*(UPDATE|INSERT|DELETE)/.test(s.sql))).toBe(false);
  });

  it("refuses to link a risk that is not on this use case", async () => {
    answer([
      [
        "SELECT projects_risks_id FROM imported_framework_subtopic_impl__risks",
        [{ projects_risks_id: 1 }],
      ],
      ["FROM projects_risks pr", []],
    ]);
    await expect(run({ risksMitigated: "[2]" })).rejects.toBeInstanceOf(ValidationException);
    const check = statements().find((s) => s.sql.includes("FROM projects_risks pr"))!;
    expect(check.options.replacements).toEqual({
      organizationId: ORG_ID,
      projectId: 3,
      riskIds: [2],
    });
    expect(
      statements().some((s) =>
        s.sql.includes("INSERT INTO imported_framework_subtopic_impl__risks"),
      ),
    ).toBe(false);
  });

  it("saves fields, evidence and risks scoped to the org and the link", async () => {
    answer([
      ["FROM organization_members", [{ user_id: 9 }]],
      [
        "SELECT projects_risks_id FROM imported_framework_subtopic_impl__risks\n      WHERE organization_id = :organizationId AND subtopic_impl_id = :implId;",
        [{ projects_risks_id: 1 }],
      ],
      ["FROM projects_risks pr", [{ risk_id: 2 }]],
      ["FROM imported_framework_subtopic_impl i\n", [{ id: 301, status: "Draft" }]],
    ]);

    const row = await run(
      {
        status: "Draft",
        implementation_description: "",
        owner: "9",
        due_date: "2026-12-01",
        risksMitigated: "[2]",
        risksDelete: "[1]",
      },
      [70],
      [71],
    );
    expect(row).toMatchObject({ id: 301, status: "Draft" });

    const update = statements().find((s) =>
      s.sql.includes("UPDATE imported_framework_subtopic_impl"),
    )!;
    expect(update.sql).toContain("project_imported_framework_id = :linkId");
    expect(update.sql).toContain("updated_at = NOW()");
    expect(update.options.replacements).toMatchObject({
      organizationId: ORG_ID,
      implId: 301,
      linkId: 12,
      status: "Draft",
      implementation_description: null,
      owner: 9,
      due_date: "2026-12-01",
    });

    const fileInsert = statements().find((s) => s.sql.includes("INSERT INTO file_entity_links"))!;
    expect(fileInsert.options.replacements).toMatchObject({
      fileId: 70,
      frameworkType: "imported",
      entityType: "imported_subtopic",
      implId: 301,
      projectId: 3,
    });
    const fileDelete = statements().find((s) => s.sql.includes("DELETE FROM file_entity_links"))!;
    expect(fileDelete.options.replacements).toMatchObject({ deletedFileIds: [71], implId: 301 });

    const riskDelete = statements().find((s) =>
      s.sql.includes("DELETE FROM imported_framework_subtopic_impl__risks"),
    )!;
    expect(riskDelete.options.replacements.removed).toEqual([1]);
    const riskInsert = statements().find((s) =>
      s.sql.includes("INSERT INTO imported_framework_subtopic_impl__risks"),
    )!;
    expect(riskInsert.options.replacements).toMatchObject({ risk0: 2, implId: 301 });

    for (const { options } of statements()) expect(options.transaction).toBe(tx);
    expectOrgScoped();
  });
});

describe("replaceImplRisksQuery", () => {
  it("keeps already linked risks without re-checking them and adds checked new ones", async () => {
    answer([
      [
        "SELECT projects_risks_id FROM imported_framework_topic_impl__risks\n      WHERE organization_id = :organizationId AND topic_impl_id = :implId;",
        [{ projects_risks_id: 1 }],
      ],
      ["FROM projects_risks pr", [{ risk_id: 4 }]],
      ["SELECT r.*", [{ id: 1 }, { id: 4 }]],
    ]);
    const risks = await replaceImplRisksQuery(LINK, "l2", 101, ORG_ID, [1, 4], tx as any);
    expect(risks).toEqual([{ id: 1 }, { id: 4 }]);
    const check = statements().find((s) => s.sql.includes("FROM projects_risks pr"))!;
    expect(check.options.replacements.riskIds).toEqual([4]);
    expect(
      statements().some((s) => s.sql.includes("DELETE FROM imported_framework_topic_impl__risks")),
    ).toBe(false);
    expectOrgScoped();
  });
});
