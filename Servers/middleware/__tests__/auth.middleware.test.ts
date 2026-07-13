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
jest.mock("../../utils/tokens.utils", () => ({
  // Keep the real, deterministic hash so the middleware computes a genuine
  // sha256 of the incoming token; only the DB-touching functions are mocked.
  hashApiToken: jest.requireActual("../../utils/tokens.utils").hashApiToken,
  getActiveApiTokenByHashQuery: jest.fn(),
  touchApiTokenLastUsedQuery: jest.fn(),
}));
jest.mock("../../utils/context/context", () => ({
  asyncLocalStorage: {
    run: jest.fn((_ctx: any, cb: () => void) => cb()),
  },
}));
jest.mock("../../utils/roleMap", () => ({
  getRoleNameById: jest.fn(),
  hasRoleId: jest.fn(),
  invalidateRoleMapCache: jest.fn(),
}));

import authenticateJWT from "../auth.middleware";
import { getTokenPayload } from "../../utils/jwt.utils";
import { doesUserBelongsToOrganizationQuery, getUserByIdQuery } from "../../utils/user.utils";
import { getTenantHash } from "../../tools/getTenantHash";
import { isValidTenantHash } from "../../utils/security.utils";
import { getRoleNameById } from "../../utils/roleMap";
import { getActiveApiTokenByHashQuery, touchApiTokenLastUsedQuery } from "../../utils/tokens.utils";

// Cast mocks for type safety
const mockGetTokenPayload = getTokenPayload as jest.MockedFunction<typeof getTokenPayload>;
const mockBelongsToOrg = doesUserBelongsToOrganizationQuery as jest.MockedFunction<
  typeof doesUserBelongsToOrganizationQuery
>;
const mockGetUserById = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockGetTenantHash = getTenantHash as jest.MockedFunction<typeof getTenantHash>;
const mockIsValidTenantHash = isValidTenantHash as jest.MockedFunction<typeof isValidTenantHash>;
const mockGetRoleNameById = getRoleNameById as jest.MockedFunction<typeof getRoleNameById>;
const mockGetActiveApiToken = getActiveApiTokenByHashQuery as jest.MockedFunction<
  typeof getActiveApiTokenByHashQuery
>;
const mockTouchApiToken = touchApiTokenLastUsedQuery as jest.MockedFunction<
  typeof touchApiTokenLastUsedQuery
>;

function createReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    // The real i18nMiddleware runs before auth; simulate with an identity
    // translator so assertions still match the English source string.
    t: (key: string) => key,
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
  organizationId: 10,
  expire: Date.now() + 3600000,
};

function setupValidMocks() {
  mockGetTokenPayload.mockReturnValue(validPayload as any);
  mockBelongsToOrg.mockResolvedValue({ belongs: true } as any);
  mockGetUserById.mockResolvedValue({ role_id: 1 } as any);
  mockGetRoleNameById.mockResolvedValue("Admin");
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

  describe("role resolution", () => {
    it("looks up the user's expected role name via getRoleNameById (DB-backed cache)", async () => {
      setupValidMocks();
      const req = createReq("Bearer valid-token") as any;
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(mockGetRoleNameById).toHaveBeenCalledWith(1);
      expect(next).toHaveBeenCalled();
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
      mockGetUserById.mockResolvedValue({ role_id: 1 } as any);
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
      // Token says Admin, but DB now resolves role_id 3 to "Editor"
      mockGetUserById.mockResolvedValue({ role_id: 3 } as any);
      mockGetRoleNameById.mockResolvedValue("Editor");
      const req = createReq("Bearer role-changed");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not allowed to access",
      });
    });

    it("should return 403 when the role id has been deleted (lookup returns undefined)", async () => {
      mockGetTokenPayload.mockReturnValue(validPayload as any);
      mockBelongsToOrg.mockResolvedValue({ belongs: true } as any);
      mockGetUserById.mockResolvedValue({ role_id: 99 } as any);
      mockGetRoleNameById.mockResolvedValue(undefined);
      const req = createReq("Bearer stale-role");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
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
      expect(req.organizationId).toBe(10);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("API token validation", () => {
    const apiTokenPayload = {
      ...validPayload,
      type: "api_token",
    };

    it("should NOT perform a DB lookup for normal session JWTs", async () => {
      setupValidMocks(); // validPayload has no `type` claim
      const req = createReq("Bearer session-jwt");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(mockGetActiveApiToken).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it("should authenticate when the api_token hash is found and active", async () => {
      mockGetTokenPayload.mockReturnValue(apiTokenPayload as any);
      mockGetUserById.mockResolvedValue({ role_id: 1 } as any);
      mockBelongsToOrg.mockResolvedValue({ belongs: true } as any);
      mockGetTenantHash.mockReturnValue("a1b2c3d4e5");
      // Token row exists, not revoked
      mockGetActiveApiToken.mockResolvedValue({ id: 7, revoked: false } as any);
      mockTouchApiToken.mockResolvedValue(undefined as any);

      const req = createReq("Bearer api-token-value") as any;
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(mockGetActiveApiToken).toHaveBeenCalledTimes(1);
      // looked up by org + hash of the raw token, never the raw token itself
      const [orgArg, hashArg] = mockGetActiveApiToken.mock.calls[0];
      expect(orgArg).toBe(10);
      expect(hashArg).not.toBe("api-token-value");
      expect(typeof hashArg).toBe("string");
      expect((hashArg as string).length).toBe(64); // sha256 hex
      expect(next).toHaveBeenCalled();
    });

    it("should touch last_used_at on a successful api_token request", async () => {
      mockGetTokenPayload.mockReturnValue(apiTokenPayload as any);
      mockGetUserById.mockResolvedValue({ role_id: 1 } as any);
      mockBelongsToOrg.mockResolvedValue({ belongs: true } as any);
      mockGetTenantHash.mockReturnValue("a1b2c3d4e5");
      mockGetActiveApiToken.mockResolvedValue({ id: 7, revoked: false } as any);
      mockTouchApiToken.mockResolvedValue(undefined as any);

      const req = createReq("Bearer api-token-value");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(mockTouchApiToken).toHaveBeenCalledWith(7, 10);
      expect(next).toHaveBeenCalled();
    });

    it("should return 401 when the api_token hash is not found (revoked or deleted)", async () => {
      mockGetTokenPayload.mockReturnValue(apiTokenPayload as any);
      mockGetUserById.mockResolvedValue({ role_id: 1 } as any);
      // No active row for this hash
      mockGetActiveApiToken.mockResolvedValue(null as any);

      const req = createReq("Bearer revoked-token");
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(mockTouchApiToken).not.toHaveBeenCalled();
    });

    it("should return 401 for an api_token even with a valid signature when the row is gone", async () => {
      // This is the core regression: a correctly-signed, unexpired JWT must
      // still be rejected once its api_tokens row no longer exists.
      mockGetTokenPayload.mockReturnValue(apiTokenPayload as any);
      mockGetUserById.mockResolvedValue({ role_id: 1 } as any);
      mockBelongsToOrg.mockResolvedValue({ belongs: true } as any);
      mockGetActiveApiToken.mockResolvedValue(null as any);

      const req = createReq("Bearer signed-but-revoked") as any;
      const res = createRes();

      await authenticateJWT(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
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
