import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import authorize from "../accessControl.middleware";
import { roleHasPermission } from "../../utils/rolePermissions.utils";

jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(),
}));

const mockRoleHasPermission = roleHasPermission as jest.MockedFunction<typeof roleHasPermission>;

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
    // Suppress expected console.error from "no role" test path
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should call next() when role is in allowedRoles", () => {
    const req = createMockReq("Admin");
    const res = createMockRes();

    authorize(["Admin"])(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should allow when role is one of multiple allowed roles", () => {
    const req = createMockReq("Editor");
    const res = createMockRes();

    authorize(["Admin", "Editor"])(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it("should return 401 when no role is set on request", () => {
    const req = createMockReq(undefined);
    const res = createMockRes();

    authorize(["Admin"])(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unauthorized",
      data: "Authentication required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when role is not in allowed list", () => {
    const req = createMockReq("Auditor");
    const res = createMockRes();

    authorize(["Admin", "Editor"])(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden",
      data: "Access denied",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["Admin", "Reviewer", "Editor", "Auditor"])(
    "should allow %s when all roles are permitted",
    (role) => {
      const req = createMockReq(role);
      const res = createMockRes();

      authorize(["Admin", "Reviewer", "Editor", "Auditor"])(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    },
  );

  describe("permission keys (issue #4588)", () => {
    beforeEach(() => {
      mockRoleHasPermission.mockReset();
    });

    it("should call next() when the permission matrix grants access", async () => {
      mockRoleHasPermission.mockResolvedValue(true);
      const req = { ...createMockReq("AI Engineer"), organizationId: 1 } as any;
      const res = createMockRes();

      await authorize("risks.edit")(req as Request, res as Response, next);

      expect(mockRoleHasPermission).toHaveBeenCalledWith(1, "AI Engineer", "risks.edit");
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

    it("should pass null organizationId when the request has none", async () => {
      mockRoleHasPermission.mockResolvedValue(true);
      const req = createMockReq("SuperAdmin") as any;
      const res = createMockRes();

      await authorize("auditLedger.super")(req as Request, res as Response, next);

      expect(mockRoleHasPermission).toHaveBeenCalledWith(null, "SuperAdmin", "auditLedger.super");
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
