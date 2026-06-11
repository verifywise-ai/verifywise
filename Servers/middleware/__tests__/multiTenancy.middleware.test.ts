import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import { checkMultiTenancy } from "../multiTenancy.middleware";

jest.mock("../../utils/organization.utils", () => ({
  getOrganizationsExistsQuery: jest.fn(),
}));

import { getOrganizationsExistsQuery } from "../../utils/organization.utils";

const mockGetOrganizationsExistsQuery = getOrganizationsExistsQuery as jest.MockedFunction<
  typeof getOrganizationsExistsQuery
>;

function createMockReq(origin?: string, host?: string): Partial<Request> {
  return {
    headers: { origin, host },
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("checkMultiTenancy middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
    delete process.env.MULTI_TENANCY_ENABLED;
  });

  it("should call next() when MULTI_TENANCY_ENABLED is true and origin is authorized", async () => {
    process.env.MULTI_TENANCY_ENABLED = "true";
    mockGetOrganizationsExistsQuery.mockResolvedValue({ exists: true } as any);
    const req = createMockReq("https://app.ai") as Request;
    const res = createMockRes();

    await checkMultiTenancy(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when no organizations exist (initial setup)", async () => {
    mockGetOrganizationsExistsQuery.mockResolvedValue({ exists: false } as any);
    const req = createMockReq() as Request;
    const res = createMockRes();

    await checkMultiTenancy(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 403 when multi-tenancy is disabled and organizations exist", async () => {
    process.env.MULTI_TENANCY_ENABLED = "false";
    mockGetOrganizationsExistsQuery.mockResolvedValue({ exists: true } as any);
    const req = createMockReq("https://unauthorized.com") as Request;
    const res = createMockRes();

    await checkMultiTenancy(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message:
        "Multi tenancy is not enabled in this server. Please contact VerifyWise to get a license for multi tenancy option.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when MULTI_TENANCY_ENABLED is missing and organizations exist", async () => {
    mockGetOrganizationsExistsQuery.mockResolvedValue({ exists: true } as any);
    const req = createMockReq() as Request;
    const res = createMockRes();

    await checkMultiTenancy(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
