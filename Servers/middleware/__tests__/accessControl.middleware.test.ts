import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import authorize from "../accessControl.middleware";

function createMockReq(role?: string): Partial<Request> {
  return { role } as any;
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
      message: "Authentication required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when role is not in allowed list", () => {
    const req = createMockReq("Auditor");
    const res = createMockRes();

    authorize(["Admin", "Editor"])(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Access denied" });
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
});
