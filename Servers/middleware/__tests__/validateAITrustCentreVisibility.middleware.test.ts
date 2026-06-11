import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import { validateVisibility } from "../validateAITrustCentreVisibility.middleware";

jest.mock("../../utils/aiTrustCentre.utils", () => ({
  getIsVisibleQuery: jest.fn(),
}));
jest.mock("../../tools/getTenantHash", () => ({
  getOrganizationIdFromTenantHash: jest.fn(),
}));

import { getIsVisibleQuery } from "../../utils/aiTrustCentre.utils";
import { getOrganizationIdFromTenantHash } from "../../tools/getTenantHash";

const mockGetIsVisibleQuery = getIsVisibleQuery as jest.MockedFunction<typeof getIsVisibleQuery>;
const mockGetOrganizationIdFromTenantHash = getOrganizationIdFromTenantHash as jest.MockedFunction<
  typeof getOrganizationIdFromTenantHash
>;

function createMockReq(hash?: string | string[]): Partial<Request> {
  return {
    params: { hash },
    t: (key: string) => key,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("validateAITrustCentreVisibility middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should return 400 when hash is missing", async () => {
    const req = createMockReq(undefined) as Request;
    const res = createMockRes();

    await validateVisibility(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid hash" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when hash is empty string", async () => {
    const req = createMockReq("") as Request;
    const res = createMockRes();

    await validateVisibility(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when hash length is not 10", async () => {
    const req = createMockReq("short") as Request;
    const res = createMockRes();

    await validateVisibility(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 404 when organization is not found for hash", async () => {
    mockGetOrganizationIdFromTenantHash.mockResolvedValue(null);
    const req = createMockReq("abc123def4") as Request;
    const res = createMockRes();

    await validateVisibility(req, res as Response, next);

    expect(mockGetOrganizationIdFromTenantHash).toHaveBeenCalledWith("abc123def4");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Organization not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when organization is found and visibility is false", async () => {
    mockGetOrganizationIdFromTenantHash.mockResolvedValue(1);
    mockGetIsVisibleQuery.mockResolvedValue(false);
    const req = createMockReq("abc123def4") as Request;
    const res = createMockRes();

    await validateVisibility(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when organization is found and visibility is true", async () => {
    mockGetOrganizationIdFromTenantHash.mockResolvedValue(1);
    mockGetIsVisibleQuery.mockResolvedValue(true);
    const req = createMockReq("abc123def4") as Request;
    const res = createMockRes();

    await validateVisibility(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
