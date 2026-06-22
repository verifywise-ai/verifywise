import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/jwt.utils", () => ({
  getTokenPayload: jest.fn(),
}));
jest.mock("../../utils/invitation.utils", () => ({
  checkPendingInvitationQuery: jest.fn(),
}));
// register.middleware now sources its role membership check from the cached
// roles table via ../utils/roleMap. The real implementation hits the DB, so
// stub the lookups here — otherwise CI (no DB) throws inside the try/catch
// and every downstream test sees a 500 instead of the expected status.
jest.mock("../../utils/roleMap", () => ({
  hasRoleId: jest.fn(),
  getRoleNameById: jest.fn(),
  invalidateRoleMapCache: jest.fn(),
}));

import registerJWT from "../register.middleware";
import { getTokenPayload } from "../../utils/jwt.utils";
import { checkPendingInvitationQuery } from "../../utils/invitation.utils";
import { hasRoleId } from "../../utils/roleMap";

const mockGetTokenPayload = getTokenPayload as jest.MockedFunction<typeof getTokenPayload>;
const mockCheckPendingInvitation = checkPendingInvitationQuery as jest.MockedFunction<
  typeof checkPendingInvitationQuery
>;
const mockHasRoleId = hasRoleId as jest.MockedFunction<typeof hasRoleId>;

function createMockReq(token?: string, body?: Record<string, unknown>): Partial<Request> {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body || {},
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("registerJWT middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
    // Default to "role exists" so each test only exercises the branch it
    // names. Tests that need an unknown role can override per-case.
    mockHasRoleId.mockResolvedValue(true);
  });

  it("should return 400 when no token is provided", async () => {
    const req = createMockReq(undefined, { roleId: 1, organizationId: 1 }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token is invalid", async () => {
    mockGetTokenPayload.mockReturnValue(null as any);
    const req = createMockReq("invalid", { roleId: 1, organizationId: 1 }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 406 when token is expired", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() - 1000,
      email: "user@test.com",
    } as any);
    const req = createMockReq("expired", { roleId: 1, organizationId: 1 }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(406);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when role or organization mismatch", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 2,
      organizationId: 1,
      expire: Date.now() + 3600000,
      email: "user@test.com",
    } as any);
    const req = createMockReq("mismatch", { roleId: 1, organizationId: 1 }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Role or Organization mismatch" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when invitation is revoked", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() + 3600000,
      email: "user@test.com",
    } as any);
    mockCheckPendingInvitation.mockResolvedValue(false);
    const req = createMockReq("revoked", { roleId: 1, organizationId: 1 }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when token is valid and invitation is pending", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() + 3600000,
      email: "user@test.com",
    } as any);
    mockCheckPendingInvitation.mockResolvedValue(true);
    const req = createMockReq("valid", { roleId: 1, organizationId: 1 }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 500 on unexpected error", async () => {
    mockGetTokenPayload.mockImplementation(() => {
      throw new Error("Unexpected failure");
    });
    const req = createMockReq("crash", { roleId: 1, organizationId: 1 }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
