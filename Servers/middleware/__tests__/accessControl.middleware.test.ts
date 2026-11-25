import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import authorize, { authorizeAny } from "../accessControl.middleware";
import { requestHasPermission } from "../../utils/rolePermissions.utils";

jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(),
}));

const mockRoleHasPermission = requestHasPermission as jest.MockedFunction<
  typeof requestHasPermission
>;

function createMockReq(role?: string): Partial<Request> {
  // The i18nMiddleware always runs before access-control middleware in the
  // real stack, so `req.t` is set. Simulate with an identity translator —
  // assertions in this file expect the English source string verbatim.
  return { role, t: (key: string) => key } as any;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("accessControl.middleware (authorize)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let next: any;

  beforeEach(() => {
    next = jest.fn();
    mockRoleHasPermission.mockReset();
    // Suppress expected console.error from "no role" test path
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return 401 when no role is set on request", async () => {
    const req = createMockReq(undefined);
    const res = createMockRes();

    await authorize("risks.edit")(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unauthorized",
      data: "Authentication required",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockRoleHasPermission).not.toHaveBeenCalled();
  });

  describe("permission keys (issue #4588)", () => {
    beforeEach(() => {
      mockRoleHasPermission.mockReset();
    });

    it("should call next() when the permission matrix grants access", async () => {
      mockRoleHasPermission.mockResolvedValue(true);
      const req = { ...createMockReq("AI Engineer"), organizationId: 1 } as any;
      const res = createMockRes();

      await authorize("risks.edit")(req as Request, res as Response, next);

      expect(mockRoleHasPermission).toHaveBeenCalledWith(req, "risks.edit");
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 when the permission matrix denies access", async () => {
      mockRoleHasPermission.mockResolvedValue(false);
      const req = { ...createMockReq("AI Engineer"), organizationId: 1 } as any;
      const res = createMockRes();

      await authorize("risks.edit")(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Forbidden", data: "Access denied" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should hand the whole request to the resolver (role, org, super admin)", async () => {
      mockRoleHasPermission.mockResolvedValue(true);
      const req = { ...createMockReq("SuperAdmin"), isSuperAdmin: true } as any;
      const res = createMockRes();

      await authorize("auditLedger.super")(req as Request, res as Response, next);

      expect(mockRoleHasPermission).toHaveBeenCalledWith(req, "auditLedger.super");
      expect(next).toHaveBeenCalled();
    });

    it("should propagate matrix errors to next(error)", async () => {
      const error = new Error("DB unavailable");
      mockRoleHasPermission.mockRejectedValue(error);
      const req = { ...createMockReq("AI Engineer"), organizationId: 1 } as any;
      const res = createMockRes();

      await authorize("risks.edit")(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});

describe("accessControl.middleware (authorizeAny)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let next: any;

  beforeEach(() => {
    next = jest.fn();
    mockRoleHasPermission.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const gate = authorizeAny("incident.edit", "incident.approve");

  it("returns 401 without a role and checks nothing", async () => {
    const res = createMockRes();

    await gate(createMockReq(undefined) as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockRoleHasPermission).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    [["incident.edit"], true],
    [["incident.approve"], true],
    [["incident.edit", "incident.approve"], true],
  ])("passes a role holding %j", async (held) => {
    mockRoleHasPermission.mockImplementation(async (_req, key) => held.includes(key));
    const res = createMockRes();

    await gate(createMockReq("Reviewer") as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when the role holds none of the keys", async () => {
    mockRoleHasPermission.mockResolvedValue(false);
    const res = createMockRes();

    await gate(createMockReq("Auditor") as Request, res as Response, next);

    expect(mockRoleHasPermission).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Forbidden", data: "Access denied" });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes errors from the permission lookup to next", async () => {
    const failure = new Error("db down");
    mockRoleHasPermission.mockRejectedValue(failure);
    const res = createMockRes();

    await gate(createMockReq("Editor") as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(failure);
  });
});
