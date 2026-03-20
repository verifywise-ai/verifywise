import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

// Mock dependencies before importing the module under test
jest.mock("../../utils/jwt.utils", () => ({
  getTokenPayload: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({
  doesUserBelongsToOrganizationQuery: jest.fn(),
  getUserByIdQuery: jest.fn(),
}));
jest.mock("../../tools/getTenantHash", () => ({
  getTenantHash: jest.fn(),
}));
jest.mock("../../utils/security.utils", () => ({
  isValidTenantHash: jest.fn(),
}));
jest.mock("../../utils/context/context", () => ({
  asyncLocalStorage: {
    run: jest.fn((_ctx: any, cb: () => void) => cb()),
  },
}));

import authenticateJWT, { roleMap } from "../auth.middleware";
import { getTokenPayload } from "../../utils/jwt.utils";
import {
  doesUserBelongsToOrganizationQuery,
  getUserByIdQuery,
} from "../../utils/user.utils";
import { getTenantHash } from "../../tools/getTenantHash";
import { isValidTenantHash } from "../../utils/security.utils";

// Cast mocks for type safety
const mockGetTokenPayload = getTokenPayload as jest.MockedFunction<typeof getTokenPayload>;
const mockBelongsToOrg = doesUserBelongsToOrganizationQuery as jest.MockedFunction<typeof doesUserBelongsToOrganizationQuery>;
const mockGetUserById = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockGetTenantHash = getTenantHash as jest.MockedFunction<typeof getTenantHash>;
const mockIsValidTenantHash = isValidTenantHash as jest.MockedFunction<typeof isValidTenantHash>;

function createReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as Partial<Request>;
}

function createRes(): Partial<Response> & { _status?: number; _json?: any } {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

const validPayload = {
  id: 1,
  email: "user@test.com",
  roleName: "Admin",
  tenantId: "a1b2c3d4e5",
  organizationId: 10,
  expire: Date.now() + 3600000,
};

function setupValidMocks() {
  mockGetTokenPayload.mockReturnValue(validPayload as any);
  mockBelongsToOrg.mockResolvedValue({ belongs: true } as any);
  mockGetUserById.mockResolvedValue({ role_id: 1 } as any);
  mockIsValidTenantHash.mockReturnValue(true);
  mockGetTenantHash.mockReturnValue("a1b2c3d4e5");
}

describe("authenticateJWT middleware", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let next: any;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("roleMap", () => {
    it("should map role IDs to names correctly", () => {
      expect(roleMap.get(1)).toBe("Admin");
      expect(roleMap.get(2)).toBe("Reviewer");
      expect(roleMap.get(3)).toBe("Editor");
      expect(roleMap.get(4)).toBe("Auditor");
    });
  });

  describe("token presence", () => {
    it("should return 400 when no Authorization header", async () => {
      const req = createReq();
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 400 when Authorization header has no Bearer token", async () => {
      const req = createReq("Bearer ");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      // "Bearer ".split(" ")[1] is "" which is falsy
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("JWT verification", () => {
    it("should return 401 when JWT is invalid", async () => {
      mockGetTokenPayload.mockReturnValue(null);
      const req = createReq("Bearer invalid-token");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("token expiration", () => {
    it("should return 406 when token is expired", async () => {
      mockGetTokenPayload.mockReturnValue({
        ...validPayload,
        expire: Date.now() - 1000, // expired
      } as any);
      const req = createReq("Bearer expired-token");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(406);
    });
  });

  describe("payload validation", () => {
    it("should return 400 when id is missing", async () => {
      mockGetTokenPayload.mockReturnValue({
        ...validPayload,
        id: undefined,
      } as any);
      const req = createReq("Bearer bad-payload");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid token" });
    });

    it("should return 400 when id is not a positive number", async () => {
      mockGetTokenPayload.mockReturnValue({
        ...validPayload,
        id: -1,
      } as any);
      const req = createReq("Bearer bad-id");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when roleName is missing", async () => {
      mockGetTokenPayload.mockReturnValue({
        ...validPayload,
        roleName: undefined,
      } as any);
      const req = createReq("Bearer no-role");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("organization membership", () => {
    it("should return 403 when user does not belong to organization", async () => {
      mockGetTokenPayload.mockReturnValue(validPayload as any);
      mockBelongsToOrg.mockResolvedValue({ belongs: false } as any);
      const req = createReq("Bearer valid-token");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "User does not belong to this organization",
      });
    });
  });

  describe("role consistency", () => {
    it("should return 403 when role has changed since token was issued", async () => {
      mockGetTokenPayload.mockReturnValue(validPayload as any);
      mockBelongsToOrg.mockResolvedValue({ belongs: true } as any);
      // Token says Admin (roleId 1), but DB says role_id 3 (Editor)
      mockGetUserById.mockResolvedValue({ role_id: 3 } as any);
      const req = createReq("Bearer role-changed");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not allowed to access",
      });
    });
  });

  describe("successful authentication", () => {
    it("should attach user context to req and call next()", async () => {
      setupValidMocks();
      const req = createReq("Bearer valid-token") as any;
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(req.userId).toBe(1);
      expect(req.role).toBe("Admin");
      expect(req.tenantId).toBe(10);
      expect(req.organizationId).toBe(10);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should return 500 on unexpected errors", async () => {
      mockGetTokenPayload.mockImplementation(() => {
        throw new Error("Unexpected failure");
      });
      const req = createReq("Bearer crash-token");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
