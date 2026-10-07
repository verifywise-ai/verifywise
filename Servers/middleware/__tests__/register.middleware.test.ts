import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/jwt.utils", () => ({
  getTokenPayload: jest.fn(),
}));
jest.mock("../../utils/invitation.utils", () => ({
  getPendingInvitationQuery: jest.fn(),
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
import { getPendingInvitationQuery } from "../../utils/invitation.utils";
import { hasRoleId } from "../../utils/roleMap";

const mockGetTokenPayload = getTokenPayload as jest.MockedFunction<typeof getTokenPayload>;
const mockGetPendingInvitation = getPendingInvitationQuery as jest.MockedFunction<
  typeof getPendingInvitationQuery
>;
/** The current pending invitation for a token signed with `expire`. */
const pendingInvitation = (expire: number, roleId = 1) => ({
  id: 41,
  role_id: roleId,
  expires_at_ms: expire,
});
const mockHasRoleId = hasRoleId as jest.MockedFunction<typeof hasRoleId>;

function createMockReq(token?: string, body?: Record<string, unknown>): Partial<Request> {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body || {},
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = { locals: {} };
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

  it.each([[undefined], ["soon"], [null]])(
    "should return 406 when the token's expiry is %p",
    async (expire) => {
      // Without a numeric expiry both the expiry and the link-match checks
      // compare against NaN and pass.
      mockGetTokenPayload.mockReturnValue({
        roleId: 1,
        organizationId: 1,
        expire,
        email: "user@test.com",
      } as any);
      mockGetPendingInvitation.mockResolvedValue(pendingInvitation(Date.now() + 3600000));
      const req = createMockReq("no-expiry", { roleId: 1, organizationId: 1 }) as Request;
      const res = createMockRes();

      await registerJWT(req, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(406);
      expect(next).not.toHaveBeenCalled();
    },
  );

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
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden",
      data: "Role or Organization mismatch",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when invitation is revoked", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() + 3600000,
      email: "user@test.com",
    } as any);
    mockGetPendingInvitation.mockResolvedValue(null);
    const req = createMockReq("revoked", {
      roleId: 1,
      organizationId: 1,
      email: "user@test.com",
    }) as Request;
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
    mockGetPendingInvitation.mockResolvedValue(pendingInvitation(Date.now() + 3600000));
    const req = createMockReq("valid", {
      roleId: 1,
      organizationId: 1,
      email: "user@test.com",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 403 when the request's email is not the invited one", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() + 3600000,
      email: "user@test.com",
    } as any);
    mockGetPendingInvitation.mockResolvedValue(pendingInvitation(Date.now() + 3600000));
    const req = createMockReq("valid", {
      roleId: 1,
      organizationId: 1,
      email: "someone-else@test.com",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden",
      data: "This invitation was sent to a different email address.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts the invited email regardless of case and surrounding spaces", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() + 3600000,
      email: "User@Test.com",
    } as any);
    mockGetPendingInvitation.mockResolvedValue(pendingInvitation(Date.now() + 3600000));
    const req = createMockReq("valid", {
      roleId: 1,
      organizationId: 1,
      email: " user@test.com ",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it("should return 401 for a token with no email claim", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() + 3600000,
    } as any);
    const req = createMockReq("no-email", {
      roleId: 1,
      organizationId: 1,
      email: "user@test.com",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This invitation link is invalid." }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("hands the controller the invitation's own email, role and organization", async () => {
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire: Date.now() + 3600000,
      email: "User@Test.com",
    } as any);
    mockGetPendingInvitation.mockResolvedValue(pendingInvitation(Date.now() + 3600000));
    const req = createMockReq("valid", {
      roleId: "1",
      organizationId: "1",
      email: " user@test.com ",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toMatchObject({ email: "User@Test.com", roleId: 1, organizationId: 1 });
    // The invitation exactly as checked, which registration accepts only if
    // it is still in that state.
    expect(res.locals!.invitation).toEqual({
      id: 41,
      roleId: 1,
      expiresAtMs: expect.any(Number),
    });
  });

  it("rejects a link that an invitation resend has replaced", async () => {
    const expire = Date.now() + 3600000;
    mockGetPendingInvitation.mockResolvedValue(
      // The resend moved the invitation's expiry; this link is the older one.
      pendingInvitation(expire + 5 * 60 * 1000),
    );
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire,
      email: "user@test.com",
    } as any);
    const req = createMockReq("old-link", {
      roleId: 1,
      organizationId: 1,
      email: "user@test.com",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an old link whose role differs from the current invitation", async () => {
    // Invited as Admin (1), revoked, re-invited as Auditor (4); the old link says Admin.
    const expire = Date.now() + 3600000;
    mockGetPendingInvitation.mockResolvedValue(pendingInvitation(expire, 4));
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire,
      email: "user@test.com",
    } as any);
    const req = createMockReq("old-role", {
      roleId: 1,
      organizationId: 1,
      email: "user@test.com",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a link a few seconds off its invitation's expiry (links sent before the change)", async () => {
    const expire = Date.now() + 3600000;
    mockGetPendingInvitation.mockResolvedValue(pendingInvitation(expire + 3000));
    mockGetTokenPayload.mockReturnValue({
      roleId: 1,
      organizationId: 1,
      expire,
      email: "user@test.com",
    } as any);
    const req = createMockReq("legacy", {
      roleId: 1,
      organizationId: 1,
      email: "user@test.com",
    }) as Request;
    const res = createMockRes();

    await registerJWT(req, res as Response, next);

    expect(next).toHaveBeenCalled();
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
