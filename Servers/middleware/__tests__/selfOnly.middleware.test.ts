import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import { selfOnly } from "../selfOnly.middleware";

function createMockReq(userId?: number, paramsId?: string, bodyId?: number): Partial<Request> {
  return {
    userId,
    params: paramsId ? { id: paramsId } : {},
    body: bodyId ? { id: bodyId } : {},
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("selfOnly middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
  });

  it("should return 401 when userId is missing", () => {
    const req = createMockReq(undefined, "1") as Request;
    const res = createMockRes();

    selfOnly(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when no target ID is provided", () => {
    const req = createMockReq(1) as Request;
    const res = createMockRes();

    selfOnly(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Target user ID is required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when params.id matches userId", () => {
    const req = createMockReq(42, "42") as Request;
    const res = createMockRes();

    selfOnly(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when body.id matches userId", () => {
    const req = createMockReq(42, undefined, 42) as Request;
    const res = createMockRes();

    selfOnly(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 403 when params.id does not match userId", () => {
    const req = createMockReq(42, "99") as Request;
    const res = createMockRes();

    selfOnly(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "You can only modify your own data" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when body.id does not match userId", () => {
    const req = createMockReq(42, undefined, 99) as Request;
    const res = createMockRes();

    selfOnly(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when both params.id and body.id match userId", () => {
    const req = createMockReq(42, "42", 42) as Request;
    const res = createMockRes();

    selfOnly(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
