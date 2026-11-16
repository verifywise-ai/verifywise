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
  getRiskByIdQuery,
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
