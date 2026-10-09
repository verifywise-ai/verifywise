import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/agentDiscovery.utils", () => ({
  getAllAgentPrimitivesQuery: jest.fn(),
  getAgentPrimitiveByIdQuery: jest.fn(),
  createAgentPrimitiveQuery: jest.fn(),
  updateAgentPrimitiveQuery: jest.fn(),
  deleteAgentPrimitiveByIdQuery: jest.fn(),
  updateReviewStatusQuery: jest.fn(),
  linkModelQuery: jest.fn(),
  unlinkModelQuery: jest.fn(),
  getAgentStatsQuery: jest.fn(),
  getSyncLogsQuery: jest.fn(),
  getLatestSyncStatusQuery: jest.fn(),
  createAuditLogQuery: jest.fn(),
  getAuditLogsForAgentQuery: jest.fn(),
  setAgentOwnersQuery: jest.fn(),
  getAgentOwnersQuery: jest.fn(),
  getUserIdsInOrganizationQuery: jest.fn(),
  lockAgentPrimitiveQuery: jest.fn(),
}));

jest.mock("../../services/agentDiscovery/agentDiscoverySync.service", () => ({
  runAgentDiscoverySyncForTenant: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  logStructured: jest.fn(),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

const mockCommit = jest.fn(async () => undefined);
const mockRollback = jest.fn(async () => undefined);
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => ({ commit: mockCommit, rollback: mockRollback })),
  },
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

import { createAgentPrimitive, updateAgentPrimitive } from "../agentDiscovery.ctrl";
import {
  getAgentPrimitiveByIdQuery,
  createAgentPrimitiveQuery,
  updateAgentPrimitiveQuery,
  createAuditLogQuery,
  setAgentOwnersQuery,
  getAgentOwnersQuery,
  getUserIdsInOrganizationQuery,
  lockAgentPrimitiveQuery,
} from "../../utils/agentDiscovery.utils";

const mockGetById = getAgentPrimitiveByIdQuery as jest.MockedFunction<any>;
const mockCreate = createAgentPrimitiveQuery as jest.MockedFunction<any>;
const mockUpdate = updateAgentPrimitiveQuery as jest.MockedFunction<any>;
const mockAudit = createAuditLogQuery as jest.MockedFunction<any>;
const mockSetOwners = setAgentOwnersQuery as jest.MockedFunction<any>;
const mockGetOwners = getAgentOwnersQuery as jest.MockedFunction<any>;
const mockUsersInOrg = getUserIdsInOrganizationQuery as jest.MockedFunction<any>;
const mockLock = lockAgentPrimitiveQuery as jest.MockedFunction<any>;

const ORG_ID = 7;
const ORG_USERS = [1, 2, 3, 4];

const createReq = (overrides: Partial<Request> = {}): Request =>
  ({
    params: {},
    body: {},
    query: {},
    organizationId: ORG_ID,
    userId: 99,
    t: (s: string) => s,
    ...overrides,
  }) as unknown as Request;

const createRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { status: jest.Mock; json: jest.Mock };
};

const manualAgent = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  display_name: "Agent",
  primitive_type: "agent",
  owner_id: "1",
  metadata: {},
  is_manual: true,
  ...overrides,
});

/** Audit rows written, keyed by field_changed. */
const auditRows = () =>
  Object.fromEntries(mockAudit.mock.calls.map((c: any[]) => [c[0].field_changed, c[0]]));

beforeEach(() => {
  jest.clearAllMocks();
  mockUsersInOrg.mockImplementation(async (ids: number[]) =>
    ids.filter((id) => ORG_USERS.includes(id)),
  );
  mockUpdate.mockImplementation(async (id: number, data: any) => ({ id, ...data }));
  mockCreate.mockImplementation(async (data: any) => ({ id: 10, ...data }));
});

/** Stub the agent as stored: getById (outside) and the locked row (inside the transaction). */
const givenAgent = (overrides: Record<string, unknown> = {}) => {
  const agent = manualAgent(overrides);
  mockGetById.mockResolvedValue(agent);
  mockLock.mockResolvedValue({ owner_id: agent.owner_id });
  return agent;
};

describe("createAgentPrimitive owners", () => {
  const body = { display_name: "Bot", primitive_type: "agent" };

  it.each([
    ["non-numeric", ["abc"]],
    ["zero", [0]],
    ["negative", [-3]],
    ["fractional", [1.5]],
    ["above INTEGER range", [2147483648]],
    ["not an array", "1,2"],
  ])("rejects %s owner ids with 400", async (_label, ownerIds) => {
    const res = createRes();
    await createAgentPrimitive(createReq({ body: { ...body, owner_ids: ownerIds } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an owner from another organization with 400", async () => {
    const res = createRes();
    await createAgentPrimitive(createReq({ body: { ...body, owner_ids: [1, 500] } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "Owners must be users in your organization" }),
    );
    expect(mockUsersInOrg).toHaveBeenCalledWith([1, 500], ORG_ID);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("writes the agent and owners in one transaction with the first owner as primary", async () => {
    const res = createRes();
    await createAgentPrimitive(createReq({ body: { ...body, owner_ids: [2, "3"] } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ owner_id: "2" }));
    const tx = mockCreate.mock.calls[0][2];
    expect(tx).toBeDefined();
    expect(mockSetOwners).toHaveBeenCalledWith(10, [2, 3], ORG_ID, tx);
    expect(mockCommit).toHaveBeenCalled();
  });

  it("rolls back when writing the owners fails", async () => {
    mockSetOwners.mockRejectedValueOnce(new Error("boom"));
    const res = createRes();
    await createAgentPrimitive(createReq({ body: { ...body, owner_ids: [2] } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockRollback).toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });
});

describe("updateAgentPrimitive owners", () => {
  const req = (body: Record<string, unknown>) => createReq({ params: { id: "10" } as any, body });

  it("rejects invalid owner ids with 400 before writing", async () => {
    givenAgent();
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [1, "x"] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a legacy owner_id from another organization with 400", async () => {
    givenAgent();
    mockGetOwners.mockResolvedValue([1]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_id: 500 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalled();
  });

  it("rejects a newly added owner who is not a user of the organization", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([1]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [1, 500] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "Owners must be users in your organization" }),
    );
    expect(mockUsersInOrg).toHaveBeenCalledWith([1, 500], ORG_ID, expect.anything());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSetOwners).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("drops an existing owner who is no longer a user instead of rejecting the save", async () => {
    // User 50 owned the agent but has since left the organization.
    givenAgent({ owner_id: "50" });
    mockGetOwners.mockResolvedValue([50, 2]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [50, 2, 3] }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ owner_id: "2" }));
    expect(mockSetOwners).toHaveBeenCalledWith(10, [2, 3], ORG_ID, expect.anything());
    expect(auditRows().owner_ids).toEqual(
      expect.objectContaining({ old_value: "50,2", new_value: "2,3" }),
    );
    expect(mockCommit).toHaveBeenCalled();
  });

  it("does not resurrect a deleted user through the legacy owner_id fallback", async () => {
    // No junction rows; the legacy owner_id still names a deleted user.
    givenAgent({ owner_id: "50" });
    mockGetOwners.mockResolvedValue([]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [50] }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ owner_id: null }));
    expect(mockSetOwners).toHaveBeenCalledWith(10, [], ORG_ID, expect.anything());
  });

  it("writes a single owner_ids audit row when the owner set changes", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([1, 2]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [3, 2] }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const tx = mockUpdate.mock.calls[0][3];
    expect(mockLock).toHaveBeenCalledWith(10, ORG_ID, tx);
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ owner_id: "3" }));
    expect(mockSetOwners).toHaveBeenCalledWith(10, [3, 2], ORG_ID, tx);
    // The row is locked first, and the agent row is updated before the owner set is replaced.
    expect(mockLock.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdate.mock.invocationCallOrder[0],
    );
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetOwners.mock.invocationCallOrder[0],
    );
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(auditRows().owner_ids).toEqual(
      expect.objectContaining({ action: "field_updated", old_value: "1,2", new_value: "3,2" }),
    );
    mockAudit.mock.calls.forEach((c: any[]) => expect(c[2]).toBe(tx));
    expect(mockCommit).toHaveBeenCalled();
  });

  it("writes an owner_id audit row when only the primary owner changes (reorder)", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([1, 2]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [2, 1] }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSetOwners).toHaveBeenCalledWith(10, [2, 1], ORG_ID, expect.anything());
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(auditRows().owner_id).toEqual(
      expect.objectContaining({ old_value: "1", new_value: "2" }),
    );
  });

  it("writes no owner audit rows when the owners are unchanged", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([1, 2]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [1, 2] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("puts owner_ids before a legacy owner_id sent alongside them", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([1]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [2], owner_id: 1 }), res);
    // owner_id is appended after owner_ids, so the primary is 2.
    expect(mockSetOwners).toHaveBeenCalledWith(10, [2, 1], ORG_ID, expect.anything());
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ owner_id: "2" }));
    expect(auditRows().owner_ids).toEqual(
      expect.objectContaining({ old_value: "1", new_value: "2,1" }),
    );
    expect(auditRows().owner_id).toBeUndefined();
  });

  it("derives the owner set from a legacy owner_id-only update", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([1, 2, 3]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_id: "3" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    // New primary first, then previous owners minus the old (1) and new (3) primary.
    expect(mockSetOwners).toHaveBeenCalledWith(10, [3, 2], ORG_ID, expect.anything());
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ owner_id: "3" }));
    expect(auditRows().owner_ids).toEqual(
      expect.objectContaining({ old_value: "1,2,3", new_value: "3,2" }),
    );
  });

  it("falls back to the legacy owner_id column when the junction table is empty", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_id: 2 }), res);
    expect(mockSetOwners).toHaveBeenCalledWith(10, [2], ORG_ID, expect.anything());
    expect(auditRows().owner_ids).toEqual(
      expect.objectContaining({ old_value: "1", new_value: "2" }),
    );
  });

  it("clears all owners when owner_id is null and owner_ids is absent", async () => {
    givenAgent({ owner_id: "1" });
    mockGetOwners.mockResolvedValue([1, 2]);
    const res = createRes();
    await updateAgentPrimitive(req({ owner_id: null }), res);
    expect(mockUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ owner_id: null }));
    expect(mockSetOwners).toHaveBeenCalledWith(10, [], ORG_ID, expect.anything());
    const rows = auditRows();
    expect(rows.owner_id).toBeUndefined();
    expect(rows.owner_ids).toEqual(expect.objectContaining({ old_value: "1,2", new_value: null }));
  });

  it("writes no owner audit rows when owners are not in the request", async () => {
    givenAgent();
    mockGetOwners.mockResolvedValue([1, 2]);
    const res = createRes();
    await updateAgentPrimitive(req({ display_name: "Renamed" }), res);
    expect(mockSetOwners).not.toHaveBeenCalled();
    expect(Object.keys(auditRows())).toEqual(["display_name"]);
  });

  it("rolls back when an audit write fails", async () => {
    givenAgent();
    mockGetOwners.mockResolvedValue([1]);
    mockAudit.mockRejectedValueOnce(new Error("boom"));
    const res = createRes();
    await updateAgentPrimitive(req({ owner_ids: [2] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockRollback).toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
