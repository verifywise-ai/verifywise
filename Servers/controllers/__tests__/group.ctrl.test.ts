import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/group.utils", () => ({
  addGroupMembersQuery: jest.fn(),
  createGroupQuery: jest.fn(),
  deleteGroupByIdQuery: jest.fn(),
  getGroupByIdOrThrowQuery: jest.fn(),
  getGroupByIdQuery: jest.fn(),
  listGroupMembersQuery: jest.fn(),
  listGroupsQuery: jest.fn(),
  listProjectGroupsQuery: jest.fn(),
  removeGroupMemberQuery: jest.fn(),
  setGroupMembersQuery: jest.fn(),
  setProjectGroupsQuery: jest.fn(),
  updateGroupByIdQuery: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({
  getProjectAccessQuery: jest.fn(),
  getProjectReadAccessQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import { listProjectGroups, setProjectGroups } from "../group.ctrl";
import * as groupUtils from "../../utils/group.utils";
import * as projectUtils from "../../utils/project.utils";

const mockSet = groupUtils.setProjectGroupsQuery as jest.Mock<any>;
const mockList = groupUtils.listProjectGroupsQuery as jest.Mock<any>;
const mockWriteAccess = projectUtils.getProjectAccessQuery as jest.Mock<any>;
const mockReadAccess = projectUtils.getProjectReadAccessQuery as jest.Mock<any>;

const makeReq = (overrides: Partial<Request> = {}) =>
  ({
    params: { projectId: "33" },
    body: { groupIds: [4] },
    userId: 9,
    role: "Editor",
    organizationId: 7,
    ...overrides,
  }) as unknown as Request;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res as Response & { status: jest.Mock; json: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("setProjectGroups (#5253 use case access)", () => {
  it("refuses an Editor who cannot see the use case and changes nothing", async () => {
    mockWriteAccess.mockResolvedValueOnce("denied");
    const res = makeRes();
    await setProjectGroups(makeReq(), res);
    expect(mockWriteAccess).toHaveBeenCalledWith(33, { userId: 9, role: "Editor" }, 7);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("answers 404 for a use case outside the organization", async () => {
    mockWriteAccess.mockResolvedValueOnce("not_found");
    const res = makeRes();
    await setProjectGroups(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("replaces the groups when the user can see the use case", async () => {
    mockWriteAccess.mockResolvedValueOnce("allowed");
    mockSet.mockResolvedValueOnce(undefined);
    const res = makeRes();
    await setProjectGroups(makeReq(), res);
    expect(mockSet).toHaveBeenCalledWith(33, 7, [4]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a malformed project id with 400", async () => {
    const res = makeRes();
    await setProjectGroups(makeReq({ params: { projectId: "abc" } as any }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWriteAccess).not.toHaveBeenCalled();
  });
});

describe("listProjectGroups", () => {
  it("refuses a user who cannot read the use case", async () => {
    mockReadAccess.mockResolvedValueOnce("denied");
    const res = makeRes();
    await listProjectGroups(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("lists the groups for a user who can read the use case", async () => {
    mockReadAccess.mockResolvedValueOnce("allowed");
    mockList.mockResolvedValueOnce([{ id: 4, name: "Model risk" }]);
    const res = makeRes();
    await listProjectGroups(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
