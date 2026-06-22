import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import superAdminOnly from "../superAdminOnly.middleware";

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    403: (message: string) => ({ message }),
  },
}));

function createMockReq(isSuperAdmin?: boolean): Partial<Request> {
  return {
    isSuperAdmin,
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("superAdminOnly middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
  });

  it("should call next() when req.isSuperAdmin is true", () => {
    const req = createMockReq(true) as Request;
    const res = createMockRes();

    superAdminOnly(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 403 when req.isSuperAdmin is false", () => {
    const req = createMockReq(false) as Request;
    const res = createMockRes();

    superAdminOnly(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Access restricted to super-admin only",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when req.isSuperAdmin is undefined", () => {
    const req = createMockReq(undefined) as Request;
    const res = createMockRes();

    superAdminOnly(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
