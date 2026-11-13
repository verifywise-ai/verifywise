import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import { validateTokenCreation, validateTokenDeletion } from "../tokens.middleware";

jest.mock("../../utils/tokens.utils", () => ({
  getNumberOfApiTokensQuery: jest.fn(),
}));
// The permission check runs for real; the role map resolves names as in
// production (built-ins are global rows, "Key keeper" is a custom role in org 1).
let mockCustomRows: Array<{ permission_key: string; allowed: boolean }> = [];
jest.mock("../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (orgId: number | null, name: string) => {
    if (name === "Key keeper" && orgId === 1) return { id: 90, name, organizationId: 1 };
    const ids: Record<string, number> = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 };
    return ids[name] ? { id: ids[name], name, organizationId: null } : undefined;
  }),
}));
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(async () => mockCustomRows) },
}));

import { getNumberOfApiTokensQuery } from "../../utils/tokens.utils";
import { invalidateRolePermissionsCache } from "../../utils/rolePermissions.utils";

const mockGetNumberOfApiTokensQuery = getNumberOfApiTokensQuery as jest.MockedFunction<
  typeof getNumberOfApiTokensQuery
>;

function createMockReq(
  role?: string,
  organizationId?: number,
  isSuperAdmin = false,
): Partial<Request> {
  return {
    role,
    organizationId,
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

describe("tokens.middleware", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe("validateTokenCreation", () => {
    it("should return 403 when user is not Admin", async () => {
      const req = createMockReq("Editor", 1) as Request;
      const res = createMockRes();

      await validateTokenCreation(req, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Forbidden",
        data: "Only Admin and super admin users can create API tokens.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should allow a super admin with no organization role", async () => {
      mockGetNumberOfApiTokensQuery.mockResolvedValue(0);
      const req = createMockReq("SuperAdmin", undefined, true) as Request;
      const res = createMockRes();

      await validateTokenCreation(req, res as Response, next);

      // null, not undefined: the query scopes such tokens by
      // organization_id IS NULL.
      expect(mockGetNumberOfApiTokensQuery).toHaveBeenCalledWith(null);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 when token limit is reached", async () => {
      mockGetNumberOfApiTokensQuery.mockResolvedValue(10);
      const req = createMockReq("Admin", 1) as Request;
      const res = createMockRes();

      await validateTokenCreation(req, res as Response, next);

      expect(mockGetNumberOfApiTokensQuery).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Forbidden",
        data: "Token limit reached. Maximum 10 tokens allowed.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next() when user is Admin and under token limit", async () => {
      mockGetNumberOfApiTokensQuery.mockResolvedValue(3);
      const req = createMockReq("Admin", 1) as Request;
      const res = createMockRes();

      await validateTokenCreation(req, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("validateTokenDeletion", () => {
    it("should allow a super admin with no organization role", async () => {
      const req = createMockReq("SuperAdmin", undefined, true) as Request;
      const res = createMockRes();

      await validateTokenDeletion(req, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 when user is not Admin", async () => {
      const req = createMockReq("Editor", 1) as Request;
      const res = createMockRes();

      await validateTokenDeletion(req, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Forbidden",
        data: "Only Admin and super admin users can delete API tokens.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next() when user is Admin", async () => {
      const req = createMockReq("Admin", 1) as Request;
      const res = createMockRes();

      await validateTokenDeletion(req, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // Issue #5314: create/revoke/delete follow apiKeys.admin (Admin by default)
  // instead of the Admin role name; any super admin is still allowed.
  describe("apiKeys.admin", () => {
    beforeEach(() => {
      mockCustomRows = [];
      invalidateRolePermissionsCache();
      mockGetNumberOfApiTokensQuery.mockResolvedValue(0);
    });

    it("lets a custom role granted apiKeys.admin create and delete tokens", async () => {
      mockCustomRows = [{ permission_key: "apiKeys.admin", allowed: true }];
      const res = createMockRes();
      await validateTokenCreation(createMockReq("Key keeper", 1) as Request, res as Response, next);
      await validateTokenDeletion(createMockReq("Key keeper", 1) as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("refuses a custom role without apiKeys.admin", async () => {
      mockCustomRows = [{ permission_key: "useCase.edit", allowed: true }];
      const res = createMockRes();
      await validateTokenCreation(createMockReq("Key keeper", 1) as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it.each(["Editor", "Reviewer", "Auditor"])("still refuses a built-in %s", async (role) => {
      const res = createMockRes();
      await validateTokenDeletion(createMockReq(role, 1) as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("still allows an elected super admin whose org role is Editor", async () => {
      const res = createMockRes();
      await validateTokenCreation(
        createMockReq("Editor", 1, true) as Request,
        res as Response,
        next,
      );
      expect(next).toHaveBeenCalled();
    });
  });
});
