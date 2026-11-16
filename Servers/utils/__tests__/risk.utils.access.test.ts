jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../history/riskHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../customField.utils", () => ({ fetchCustomFieldsForEntities: jest.fn() }));
jest.mock("../user.utils", () => ({
  findUsersNotInOrganization: jest.fn().mockResolvedValue([]),
  parseReferencedIds: jest.fn((ids: unknown[]) => ids),
}));
jest.mock("../projectRiskChangeHistory.utils", () => ({
  recordProjectRiskDeletion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../riskVisibility.utils", () => ({
  ...jest.requireActual("../riskVisibility.utils"),
  getAccessibleProjectIdsQuery: jest.fn(),
  isRiskVisibleQuery: jest.fn(),
}));

import { sequelize } from "../../database/db";
import {
  archiveRiskQuery,
  assertRiskReferencesInOrganization,
  getAllRisksQuery,
  getRiskByIdQuery,
  getRisksByFrameworkQuery,
  getRisksByProjectQuery,
  linkRiskToProjectQuery,
  updateRiskByIdQuery,
} from "../risk.utils";
import {
  getAccessibleProjectIdsQuery,
  isRiskVisibleQuery,
  SYSTEM_RISK_VIEWER,
} from "../riskVisibility.utils";

const mockQuery = sequelize.query as jest.Mock;
const mockAccessible = getAccessibleProjectIdsQuery as jest.Mock;
const mockVisible = isRiskVisibleQuery as jest.Mock;

const quiet = { recordSnapshots: false, runAutomations: false };
const editor = { userId: 7, role: "Editor" };
const admin = { userId: 1, role: "Admin" };
const tx = {} as any;

/** Answers the org check from `orgProjects`, the link read from `linked`. */
const answerSql = (orgProjects: number[], linked: number[] = []) => {
  mockQuery.mockImplementation(async (sql: string, opts?: { type?: string }) => {
    if (sql.includes("FROM projects WHERE organization_id")) {
      return orgProjects.map((id) => ({ id }));
    }
    if (sql.includes("SELECT project_id FROM projects_risks")) {
      const rows = linked.map((project_id) => ({ project_id }));
      return opts?.type === "SELECT" ? rows : [rows, rows.length];
    }
    if (sql.includes("FROM risks") && sql.includes("is_deleted")) return [{ id: 5 }];
    if (sql.includes("SELECT * FROM risks")) return [[{ id: 5 }]];
    return [[]];
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVisible.mockResolvedValue(true);
});

describe("assertRiskReferencesInOrganization with a viewer", () => {
  it("rejects a use case the viewer cannot write to with the organization error", async () => {
    answerSql([3, 4]);
    mockAccessible.mockResolvedValue([3]);
    await expect(
      assertRiskReferencesInOrganization({ projects: [3, 4] }, 1, tx, { viewer: editor }),
    ).rejects.toMatchObject({
      message: "Linked use cases must belong to this organization",
    });
  });

  it("accepts use cases the viewer can write to", async () => {
    answerSql([3]);
    mockAccessible.mockResolvedValue([3]);
    await expect(
      assertRiskReferencesInOrganization({ projects: [3] }, 1, tx, { viewer: editor }),
    ).resolves.toBeUndefined();
  });

  it("does not re-check links that already exist", async () => {
    answerSql([3, 4]);
    mockAccessible.mockResolvedValue([]);
    await expect(
      assertRiskReferencesInOrganization({ projects: [3, 4] }, 1, tx, {
        viewer: editor,
        alreadyLinked: [3, 4],
      }),
    ).resolves.toBeUndefined();
    expect(mockAccessible).toHaveBeenCalledWith([], 1, editor, tx);
  });

  it.each([
    ["an Admin", admin],
    ["no viewer", undefined],
  ])("checks nothing for %s", async (_n, viewer) => {
    answerSql([3, 4]);
    await assertRiskReferencesInOrganization({ projects: [3, 4] }, 1, tx, { viewer });
    expect(mockAccessible).not.toHaveBeenCalled();
  });
});

describe("linkRiskToProjectQuery with a viewer", () => {
  it("treats a risk the viewer cannot see as missing", async () => {
    answerSql([3]);
    mockVisible.mockResolvedValue(false);
    await expect(linkRiskToProjectQuery(5, 3, 1, tx, editor)).rejects.toMatchObject({
      message: "Risk not found",
    });
  });

  it("rejects an inaccessible use case like one outside the organization", async () => {
    answerSql([3]);
    mockAccessible.mockResolvedValue([]);
    await expect(linkRiskToProjectQuery(5, 3, 1, tx, editor)).rejects.toMatchObject({
      message: "Linked use cases must belong to this organization",
    });
  });

  it("links for the system viewer without a use case check", async () => {
    answerSql([3]);
    await linkRiskToProjectQuery(5, 3, 1, tx, SYSTEM_RISK_VIEWER);
    expect(mockAccessible).not.toHaveBeenCalled();
  });
});

describe("updateRiskByIdQuery link replacement", () => {
  const deleteSql = () =>
    mockQuery.mock.calls.find((c) => String(c[0]).startsWith("DELETE FROM projects_risks"));

  it("keeps the links a non-Admin cannot see", async () => {
    answerSql([3], [3, 8]);
    // use case 8 is hidden from the editor
    mockAccessible.mockImplementation(async (ids: number[]) => ids.filter((i) => i === 3));
    await updateRiskByIdQuery(5, { projects: [3] } as any, 1, tx, { viewer: editor, ...quiet });
    const del = deleteSql()!;
    expect(del[0]).toContain("AND project_id NOT IN (:keptHiddenIds)");
    expect(del[1].replacements.keptHiddenIds).toEqual([8]);
  });

  it("does not map-clean a hidden link it keeps", async () => {
    answerSql([3], [3, 8]);
    mockAccessible.mockImplementation(async (ids: number[]) => ids.filter((i) => i === 3));
    await updateRiskByIdQuery(5, { deletedLinkedProject: true } as any, 1, tx, {
      viewer: editor,
      ...quiet,
    });
    // removing every visible link leaves 8: the delete still spares it
    expect(deleteSql()![1].replacements.keptHiddenIds).toEqual([8]);
  });

  it("replaces every link for an Admin", async () => {
    answerSql([3], [3, 8]);
    await updateRiskByIdQuery(5, { projects: [3] } as any, 1, tx, { viewer: admin, ...quiet });
    expect(deleteSql()![0]).not.toContain("NOT IN");
    expect(mockAccessible).not.toHaveBeenCalled();
  });

  it("replaces every link for the system viewer", async () => {
    answerSql([3], [3, 8]);
    await updateRiskByIdQuery(5, { projects: [3] } as any, 1, tx, {
      ...quiet,
      viewer: SYSTEM_RISK_VIEWER,
    });
    expect(deleteSql()![0]).not.toContain("NOT IN");
  });
});

describe("updateRiskByIdQuery reads the links once", () => {
  // Reads in the update's transaction (the change-diff read of the risk
  // itself runs outside it and is not part of the link edit).
  const linkReads = () =>
    mockQuery.mock.calls.filter(
      (c) =>
        String(c[0]).includes("SELECT project_id FROM projects_risks") && c[1]?.transaction === tx,
    );

  it.each([
    ["a non-Admin", editor],
    ["an Admin", admin],
  ])("reads the risk's use case links once for %s", async (_label, viewer) => {
    answerSql([3], [3, 8]);
    mockAccessible.mockImplementation(async (ids: number[]) => ids.filter((i) => i === 3));
    await updateRiskByIdQuery(5, { projects: [3] } as any, 1, tx, { viewer, ...quiet });
    expect(linkReads()).toHaveLength(1);
  });

  it("does not read the links when they are not edited", async () => {
    answerSql([], []);
    await updateRiskByIdQuery(5, { risk_name: "R" } as any, 1, tx, { viewer: editor, ...quiet });
    expect(linkReads()).toHaveLength(0);
  });
});

describe("getRiskByIdQuery and archiveRiskQuery take a viewer", () => {
  beforeEach(() => mockQuery.mockReset());

  it("answers a risk hidden from a non-Admin like a missing one", async () => {
    mockQuery.mockResolvedValue([[], 0]);
    await expect(getRiskByIdQuery(5, 1, editor)).resolves.toBeNull();
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(options.replacements).toMatchObject({ id: 5, organizationId: 1, visibilityUserId: 7 });
  });

  it("reads any risk of the organization for an Admin or the system viewer", async () => {
    mockQuery.mockResolvedValue([[], 0]);
    await getRiskByIdQuery(5, 1, admin);
    await getRiskByIdQuery(5, 1, SYSTEM_RISK_VIEWER, true);
    expect(mockQuery.mock.calls[0][0]).not.toContain("visibilityUserId");
    expect(mockQuery.mock.calls[1][0]).not.toContain("visibilityUserId");
    expect(mockQuery.mock.calls[1][0]).not.toContain("is_deleted");
  });

  it("archives nothing, and answers like a missing risk, when the risk is hidden", async () => {
    // the soft-delete UPDATE matches no row
    mockQuery.mockResolvedValue([[], 0]);
    await expect(archiveRiskQuery(5, 1, 7, tx, { viewer: editor })).resolves.toBeNull();
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/^UPDATE risks SET is_deleted = true/);
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(options.replacements).toMatchObject({ id: 5, organizationId: 1, visibilityUserId: 7 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("updateRiskByIdQuery guards the write itself", () => {
  const updateSql = () => mockQuery.mock.calls.find((c) => String(c[0]).startsWith("UPDATE risks"));

  it("answers a risk hidden from a non-Admin with null before validating or writing", async () => {
    answerSql([3], [3]);
    mockVisible.mockResolvedValue(false);
    await expect(
      updateRiskByIdQuery(5, { risk_name: "R", projects: [3] } as any, 1, tx, {
        viewer: editor,
        ...quiet,
      }),
    ).resolves.toBeNull();
    expect(mockVisible).toHaveBeenCalledWith(5, 1, editor, tx);
    expect(mockAccessible).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("applies the visibility rule in the UPDATE's WHERE", async () => {
    answerSql([], []);
    await updateRiskByIdQuery(5, { risk_name: "R" } as any, 1, tx, { viewer: editor, ...quiet });
    const [sql, options] = updateSql()!;
    expect(sql).toContain("WHERE id = :id AND organization_id = :organizationId AND (NOT EXISTS");
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(options.replacements).toMatchObject({ id: 5, organizationId: 1, visibilityUserId: 7 });
  });

  it("returns null and writes no links when the UPDATE matches no row", async () => {
    answerSql([3], [3]);
    mockAccessible.mockResolvedValue([3]);
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, opts?: any) =>
      String(sql).startsWith("UPDATE risks") ? [] : base(sql, opts),
    );
    await expect(
      updateRiskByIdQuery(5, { risk_name: "R", projects: [3] } as any, 1, tx, {
        viewer: editor,
        ...quiet,
      }),
    ).resolves.toBeNull();
    const writes = mockQuery.mock.calls.filter((c) =>
      /^(DELETE FROM projects_risks|INSERT INTO projects_risks)/.test(String(c[0]).trim()),
    );
    expect(writes).toHaveLength(0);
  });

  it("does not add the rule for an Admin and skips the visibility read", async () => {
    answerSql([], []);
    await updateRiskByIdQuery(5, { risk_name: "R" } as any, 1, tx, { viewer: admin, ...quiet });
    expect(mockVisible).not.toHaveBeenCalled();
    expect(updateSql()![0]).not.toContain("visibilityUserId");
  });

  it("reads the accessible use cases once, current and requested together", async () => {
    answerSql([3, 4], [3, 8]);
    mockAccessible.mockImplementation(async (ids: number[]) => ids.filter((i) => i !== 8));
    await updateRiskByIdQuery(5, { projects: [3, 4] } as any, 1, tx, { viewer: editor, ...quiet });
    expect(mockAccessible).toHaveBeenCalledTimes(1);
    expect([...mockAccessible.mock.calls[0][0]].sort()).toEqual([3, 4, 8]);
    const del = mockQuery.mock.calls.find((c) =>
      String(c[0]).startsWith("DELETE FROM projects_risks"),
    )!;
    expect(del[1].replacements.keptHiddenIds).toEqual([8]);
  });

  it("still rejects a requested use case the viewer cannot access", async () => {
    answerSql([3, 4], [3]);
    mockAccessible.mockImplementation(async (ids: number[]) => ids.filter((i) => i === 3));
    await expect(
      updateRiskByIdQuery(5, { projects: [3, 4] } as any, 1, tx, { viewer: editor, ...quiet }),
    ).rejects.toThrow("Linked use cases must belong to this organization");
    expect(mockAccessible).toHaveBeenCalledTimes(1);
  });
});

describe("risk reads narrow the use cases a risk names", () => {
  beforeEach(() => mockQuery.mockReset());

  it.each([
    ["the list", () => getAllRisksQuery(1, "active", editor), "pr.project_id"],
    ["by use case", () => getRisksByProjectQuery(3, 1, "active", editor), "p.id"],
    ["by framework", () => getRisksByFrameworkQuery(2, 1, "active", editor), "p.id"],
  ])("%s lists only accessible use cases in projects for a non-Admin", async (_l, run, col) => {
    mockQuery.mockResolvedValue([]);
    await run();
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain(`FILTER (WHERE ${col} IS NOT NULL AND EXISTS`);
    expect(sql).toContain(`pacc.id = ${col}`);
    expect(options.replacements.visibilityUserId).toBe(7);
  });

  it.each([
    ["the list", () => getAllRisksQuery(1, "active", admin)],
    ["by use case", () => getRisksByProjectQuery(3, 1, "active", admin)],
    ["by framework", () => getRisksByFrameworkQuery(2, 1, "active", SYSTEM_RISK_VIEWER)],
  ])("%s does not narrow projects for an Admin or the system", async (_l, run) => {
    mockQuery.mockResolvedValue([]);
    await run();
    expect(mockQuery.mock.calls[0][0]).not.toContain("pacc");
  });

  it("by id narrows projects and every mapping row's use case for a non-Admin", async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).startsWith("SELECT * FROM risks") ? [[{ id: 5 }], 1] : [[], 0],
    );
    await getRiskByIdQuery(5, 1, editor);
    const calls = mockQuery.mock.calls.map((c) => String(c[0]));
    const links = calls.find((s) => s.includes("SELECT project_id FROM projects_risks"))!;
    expect(links).toContain("pacc.id = projects_risks.project_id");
    const mappings = calls.filter((s) => s.includes("JOIN projects_frameworks pf"));
    expect(mappings).toHaveLength(6);
    for (const sql of mappings) expect(sql).toContain("pacc.id = pf.project_id");
  });

  it("by id does not narrow for an Admin", async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).startsWith("SELECT * FROM risks") ? [[{ id: 5 }], 1] : [[], 0],
    );
    await getRiskByIdQuery(5, 1, admin);
    for (const [sql] of mockQuery.mock.calls) expect(String(sql)).not.toContain("pacc");
  });
});
