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

import { createNewModelInventoryQuery, splitModelLinks } from "../modelInventory.utils";
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

describe("linking a use case on v1 needs write access to it", () => {
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

  it("does not check access without a viewer (legacy route)", async () => {
    mockAccess.mockReset();
    mockQuery
      .mockResolvedValueOnce([{ id: 4 }])
      .mockResolvedValueOnce([{ id: 10, dataValues: {} }])
      .mockResolvedValue([[], 0]);
    await createNewModelInventoryQuery({} as any, 1, [4], [], tx).catch(() => undefined);
    expect(mockAccess).not.toHaveBeenCalled();
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
