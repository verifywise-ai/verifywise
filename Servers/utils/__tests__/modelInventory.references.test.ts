import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../history/modelInventoryHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn(async () => undefined),
}));
const mockAccess = jest.fn<(...args: any[]) => Promise<string>>();
jest.mock("../project.utils", () => ({
  getProjectAccessQuery: (...args: any[]) => mockAccess(...args),
}));

import {
  createNewModelInventoryQuery,
  splitModelLinks,
  updateModelInventoryByIdQuery,
} from "../modelInventory.utils";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const tx = { id: "tx" } as any;
const sqls = () => mockQuery.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  mockQuery.mockReset();
});

describe("createNewModelInventoryQuery checks its references first", () => {
  it("refuses an approver from another organization without writing", async () => {
    mockQuery.mockResolvedValueOnce([]); // membership
    const err = await createNewModelInventoryQuery({ approver: 99 } as any, 1, [], [], tx).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationException);
    expect(err.message).toBe("The approver must be a member of this organization.");
    expect(sqls().some((q) => /INSERT/.test(q))).toBe(false);
  });

  it("refuses another organization's use case without writing", async () => {
    mockQuery.mockResolvedValueOnce([]); // projects of the org
    await expect(createNewModelInventoryQuery({} as any, 1, [42], [], tx)).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(sqls().some((q) => /INSERT/.test(q))).toBe(false);
  });

  it("refuses a framework no use case of the organization uses (was a 500)", async () => {
    mockQuery.mockResolvedValueOnce([]); // frameworks in use
    await expect(createNewModelInventoryQuery({} as any, 1, [], [7], tx)).rejects.toBeInstanceOf(
      ValidationException,
    );
  });

  it("stores a framework link without a use case", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 7 }]) // frameworks in use
      .mockResolvedValueOnce([{ id: 10, dataValues: {} }]) // insert model
      .mockResolvedValue([[], 0]);
    await createNewModelInventoryQuery({} as any, 1, [], [7, 7], tx).catch(() => undefined);
    const frameworkInserts = mockQuery.mock.calls.filter((c) =>
      /INSERT INTO model_inventories_projects_frameworks/.test(String(c[0])),
    );
    expect(frameworkInserts).toHaveLength(1);
    expect(String(frameworkInserts[0][0])).toMatch(/NULL, :framework_id/);
    expect(sqls().some((q) => /FROM projects_frameworks WHERE .* LIMIT 1/.test(q))).toBe(false);
  });
});

describe("linking a use case needs access to it", () => {
  const viewer = { userId: 5, role: "Editor" };

  it("refuses a use case the caller cannot open, before writing", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 4 }]); // projects of the org
    mockAccess.mockResolvedValueOnce("denied");
    const err = await createNewModelInventoryQuery({} as any, 1, [4], [], tx, viewer).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(mockAccess).toHaveBeenCalledWith(4, viewer, 1, tx);
    expect(sqls().some((q) => /INSERT/.test(q))).toBe(false);
  });

  it("does not check access without a viewer (advisor, intake, seeds)", async () => {
    mockAccess.mockReset();
    mockQuery
      .mockResolvedValueOnce([{ id: 4 }])
      .mockResolvedValueOnce([{ id: 10, dataValues: {} }])
      .mockResolvedValue([[], 0]);
    await createNewModelInventoryQuery({} as any, 1, [4], [], tx).catch(() => undefined);
    expect(mockAccess).not.toHaveBeenCalled();
  });
});

describe("updateModelInventoryByIdQuery links", () => {
  const viewer = { userId: 5, role: "Editor" };

  /**
   * Answers each query by its SQL: the model is linked to use cases
   * `linkedProjects` and frameworks `linkedFrameworks`; the organization owns
   * use cases `orgProjects`, and its use cases use frameworks `usedFrameworks`.
   */
  const db = (state: {
    linkedProjects?: number[];
    linkedFrameworks?: number[];
    orgProjects?: number[];
    usedFrameworks?: number[];
  }) =>
    mockQuery.mockImplementation(async (sql: string) => {
      if (/^SELECT \* FROM model_inventories/.test(sql)) return [{ id: 10, dataValues: {} }];
      if (/SELECT DISTINCT framework_id FROM model_inventories_projects_frameworks/.test(sql)) {
        return [(state.linkedFrameworks ?? []).map((framework_id) => ({ framework_id })), 0];
      }
      if (/SELECT DISTINCT project_id FROM model_inventories_projects_frameworks/.test(sql)) {
        return [(state.linkedProjects ?? []).map((project_id) => ({ project_id })), 0];
      }
      if (/SELECT id FROM projects WHERE/.test(sql)) {
        return (state.orgProjects ?? []).map((id) => ({ id }));
      }
      if (/FROM projects_frameworks/.test(sql)) {
        return (state.usedFrameworks ?? []).map((id) => ({ id }));
      }
      return [[], 0];
    });
  const calls = (re: RegExp) => mockQuery.mock.calls.filter((c) => re.test(String(c[0])));
  const update = (projects: number[], frameworks: number[], withViewer = true) =>
    updateModelInventoryByIdQuery(
      10,
      {} as any,
      projects,
      frameworks,
      false,
      false,
      1,
      tx,
      withViewer ? viewer : undefined,
    );

  beforeEach(() => {
    mockAccess.mockReset();
    // Use case 3 is hidden from the caller; every other one is theirs.
    mockAccess.mockImplementation(async (projectId: number) =>
      projectId === 3 ? "denied" : "allowed",
    );
  });

  it("saves a framework the model already links to, though no use case uses it any more", async () => {
    db({ linkedFrameworks: [7], usedFrameworks: [] });
    await expect(update([], [7])).resolves.toBeDefined();
    expect(calls(/FROM projects_frameworks/)).toHaveLength(0);
  });

  it("still refuses an added framework no use case uses", async () => {
    db({ linkedFrameworks: [7], usedFrameworks: [] });
    await expect(update([], [7, 8])).rejects.toBeInstanceOf(ValidationException);
    expect(calls(/^UPDATE model_inventories/)).toHaveLength(0);
  });

  it("keeps a link to a use case the caller cannot open when the list leaves it out", async () => {
    db({ linkedProjects: [3], orgProjects: [2] });
    await update([2], []);
    expect(calls(/DELETE FROM model_inventories_projects_frameworks .*project_id IN/)).toHaveLength(
      0,
    );
    const inserts = calls(/INSERT INTO model_inventories_projects_frameworks/);
    expect(inserts.map((c) => c[1].replacements.project_id)).toEqual([2]);
  });

  it("removes a link to a use case the caller can open", async () => {
    db({ linkedProjects: [2, 3], orgProjects: [] });
    // deleteProjects: the caller cleared the list; the hidden use case 3 stays.
    await updateModelInventoryByIdQuery(10, {} as any, [], [], true, false, 1, tx, viewer);
    const deletes = calls(/project_id IN \(:project_ids\)/);
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1].replacements.project_ids).toEqual([2]);
  });

  it("refuses adding a use case the caller cannot open, before writing", async () => {
    db({ linkedProjects: [], orgProjects: [3] });
    await expect(update([3], [])).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls(/^UPDATE model_inventories/)).toHaveLength(0);
  });

  it("reads the linked frameworks only when the request sends frameworks", async () => {
    db({ linkedProjects: [2], orgProjects: [2] });
    await update([2], []);
    expect(
      calls(/SELECT DISTINCT framework_id FROM model_inventories_projects_frameworks/),
    ).toHaveLength(0);
    mockQuery.mockClear();
    db({ linkedFrameworks: [7], usedFrameworks: [] });
    await update([], [7]);
    expect(
      calls(/SELECT DISTINCT framework_id FROM model_inventories_projects_frameworks/),
    ).toHaveLength(1);
  });

  it("reads the use case links once and reports the ones it added", async () => {
    db({ linkedProjects: [2], orgProjects: [2, 4] });
    const saved = await update([2, 4], []);
    expect(
      calls(/SELECT DISTINCT project_id FROM model_inventories_projects_frameworks/),
    ).toHaveLength(1);
    expect(saved.addedProjectIds).toEqual([4]);

    mockQuery.mockClear();
    db({ linkedProjects: [2] });
    expect((await update([], [])).addedProjectIds).toEqual([]);
    expect(calls(/SELECT DISTINCT project_id/)).toHaveLength(0);
  });

  it("without a caller, replaces the use case links as sent", async () => {
    db({ linkedProjects: [3], orgProjects: [2] });
    await update([2], [], false);
    expect(mockAccess).not.toHaveBeenCalled();
    expect(calls(/project_id IN/)[0][1].replacements.project_ids).toEqual([3]);
  });
});

describe("splitModelLinks", () => {
  it("reads a row with a framework as a framework link, never a use case link", () => {
    expect(
      splitModelLinks([
        { project_id: 3, framework_id: undefined },
        { project_id: undefined, framework_id: 2 },
        { project_id: 4, framework_id: 2 }, // pre-migration framework row
        { project_id: 3, framework_id: undefined },
      ]),
    ).toEqual({ projects: [3], frameworks: [2] });
  });
});
