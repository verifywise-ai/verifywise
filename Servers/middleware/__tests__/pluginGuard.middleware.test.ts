import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import { requirePlugin } from "../pluginGuard.middleware";

jest.mock("../../utils/pluginInstallation.utils", () => ({
  findByPlugin: jest.fn(),
}));

import { findByPlugin } from "../../utils/pluginInstallation.utils";

const mockFindByPlugin = findByPlugin as jest.MockedFunction<typeof findByPlugin>;

function createMockReq(organizationId?: number): Partial<Request> {
  return {
    organizationId,
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("pluginGuard.middleware (requirePlugin)", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should return 401 when organizationId is missing", async () => {
    const middleware = requirePlugin("slack");
    const req = createMockReq(undefined) as Request;
    const res = createMockRes();

    await middleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when plugin is installed", async () => {
    mockFindByPlugin.mockResolvedValue({ status: "installed" } as any);
    const middleware = requirePlugin("slack");
    const req = createMockReq(1) as Request;
    const res = createMockRes();

    await middleware(req, res as Response, next);

    expect(mockFindByPlugin).toHaveBeenCalledWith("slack", 1);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 404 when plugin is not installed", async () => {
    mockFindByPlugin.mockResolvedValue(null as any);
    const middleware = requirePlugin("jira");
    const req = createMockReq(1) as Request;
    const res = createMockRes();

    await middleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "The 'jira' plugin is not installed",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 404 when plugin status is not 'installed'", async () => {
    mockFindByPlugin.mockResolvedValue({ status: "pending" } as any);
    const middleware = requirePlugin("github");
    const req = createMockReq(1) as Request;
    const res = createMockRes();

    await middleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 500 on unexpected error", async () => {
    mockFindByPlugin.mockRejectedValue(new Error("DB error"));
    const middleware = requirePlugin("slack");
    const req = createMockReq(1) as Request;
    const res = createMockRes();

    await middleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
    expect(next).not.toHaveBeenCalled();
  });
});
