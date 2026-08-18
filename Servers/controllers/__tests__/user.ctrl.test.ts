import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/user.utils", () => ({
  checkUserExistsQuery: jest.fn(),
  createNewUserQuery: jest.fn(),
  deleteUserByIdQuery: jest.fn(),
  deleteUserProfilePhotoQuery: jest.fn(),
  getAllUsersQuery: jest.fn(),
  getUserByEmailQuery: jest.fn(),
  getUserByIdQuery: jest.fn(),
  getUserProfilePhotoQuery: jest.fn(),
  resetPasswordQuery: jest.fn(),
  updateUserByIdQuery: jest.fn(),
}));
jest.mock("bcrypt", () => ({
  compare: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../utils/jwt.utils", () => ({
  generateToken: jest.fn().mockReturnValue("token"),
  getRefreshTokenPayload: jest.fn().mockReturnValue({
    id: 1,
    email: "a@b.com",
    roleName: "Admin",
    organizationId: 1,
    expire: Date.now() + 10000,
  }),
}));
jest.mock("../../utils/auth.utils", () => ({
  generateUserTokens: jest.fn().mockReturnValue({ accessToken: "token" }),
}));
jest.mock("../../utils/refreshToken.utils", () => ({
  findRefreshToken: jest.fn().mockResolvedValue({
    id: 1,
    user_id: 1,
    organization_id: 1,
    token_hash: "hash",
    family_id: "family-1",
    expires_at: new Date(Date.now() + 10000),
    revoked_at: null,
  }),
  revokeRefreshTokenByHash: jest.fn().mockResolvedValue(undefined),
  revokeTokenFamily: jest.fn().mockResolvedValue(undefined),
  revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    401: (d: any) => ({ message: "Unauthorized", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    406: (d: any) => ({ message: "Not Acceptable", data: d }),
    409: (d: any) => ({ message: "Conflict", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn().mockResolvedValue([{ onboarding_status: "completed" }]),
  },
}));
jest.mock("../../domain.layer/models/user/user.model", () => ({
  UserModel: Object.assign(
    jest.fn().mockImplementation(function () {
      Object.assign(this, {
        updateLastLogin: jest.fn(),
        comparePassword: jest.fn().mockResolvedValue(true),
        updatePassword: jest.fn().mockResolvedValue(undefined),
        updateCurrentUser: jest.fn().mockResolvedValue(undefined),
        validateUserData: jest.fn().mockResolvedValue(undefined),
        updateRole: jest.fn().mockResolvedValue(undefined),
        isDemoUser: jest.fn().mockReturnValue(false),
        toSafeJSON: jest.fn().mockReturnValue({ id: 1, email: "a@b.com" }),
      });
    }),
    {
      createNewUser: jest.fn().mockResolvedValue({
        validateUserData: jest.fn().mockResolvedValue(undefined),
        password_hash: "hash",
      }),
      validateEmailUniqueness: jest.fn().mockResolvedValue(true),
    },
  ),
}));
jest.mock("../../services/slack/slackNotificationService", () => ({
  sendSlackNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/userNotification/projectNotifications", () => ({
  sendMemberRoleChangedEditorToAdminNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/role.utils", () => ({
  getRoleByIdQuery: jest.fn().mockResolvedValue({ name: "Admin" }),
}));
jest.mock("../../utils/invitation.utils", () => ({
  markInvitationAcceptedQuery: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/userPreference.utils", () => ({
  getPreferencesByUserQuery: jest.fn(),
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
  BusinessLogicException: class BusinessLogicException extends Error {},
  ConflictException: class ConflictException extends Error {},
}));

import { buildUser } from "../../tests/factories/user.factory";
import {
  getAllUsers,
  getUserByEmail,
  getUserById,
  getPreferencesForCurrentUser,
  createNewUser,
  loginUser,
  resetPassword,
  updateUserById,
  deleteUserById,
  checkUserExists,
  refreshAccessToken,
  logoutUser,
  ChangePassword,
  updateUserRole,
  getUserProfilePhoto,
  deleteUserProfilePhoto,
} from "../user.ctrl";
import {
  getAllUsersQuery,
  getUserByEmailQuery,
  getUserByIdQuery,
  createNewUserQuery,
  updateUserByIdQuery,
  deleteUserByIdQuery,
  resetPasswordQuery,
  checkUserExistsQuery,
  getUserProfilePhotoQuery,
  deleteUserProfilePhotoQuery,
} from "../../utils/user.utils";
import { getRoleByIdQuery } from "../../utils/role.utils";
import { getPreferencesByUserQuery } from "../../utils/userPreference.utils";

const mockGetAll = getAllUsersQuery as jest.MockedFunction<typeof getAllUsersQuery>;
const mockGetByEmail = getUserByEmailQuery as jest.MockedFunction<typeof getUserByEmailQuery>;
const mockGetById = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockCreate = createNewUserQuery as jest.MockedFunction<typeof createNewUserQuery>;
const mockUpdate = updateUserByIdQuery as jest.MockedFunction<typeof updateUserByIdQuery>;
const mockDelete = deleteUserByIdQuery as jest.MockedFunction<typeof deleteUserByIdQuery>;
const mockGetPreferences = getPreferencesByUserQuery as jest.MockedFunction<
  typeof getPreferencesByUserQuery
>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    cookies: {},
    isSuperAdmin: false,
    ...overrides,
  };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  res.send = jest.fn<any>().mockReturnValue(res);
  res.cookie = jest.fn<any>().mockReturnValue(res);
  res.clearCookie = jest.fn<any>().mockReturnValue(res);
  return res;
}

function mockUser(data: any) {
  return {
    ...data,
    toSafeJSON: () => data,
    updateLastLogin: jest.fn(),
    comparePassword: jest.fn().mockResolvedValue(true),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    updateCurrentUser: jest.fn().mockResolvedValue(undefined),
    validateUserData: jest.fn().mockResolvedValue(undefined),
    updateRole: jest.fn().mockResolvedValue(undefined),
    isDemoUser: jest.fn().mockReturnValue(false),
  };
}

describe("user.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllUsers", () => {
    it("should return 200 with users", async () => {
      mockGetAll.mockResolvedValue([mockUser(buildUser())] as any);
      const req = createReq();
      const res = createRes();
      await getAllUsers(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 204 when no users exist", async () => {
      mockGetAll.mockResolvedValue([] as any);
      const req = createReq();
      const res = createRes();
      await getAllUsers(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllUsers(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getUserByEmail", () => {
    it("should return 200 when user is found", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ params: { email: "a@b.com" } });
      const res = createRes();
      await getUserByEmail(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when user is not found", async () => {
      mockGetByEmail.mockResolvedValue(null as any);
      const req = createReq({ params: { email: "x@y.com" } });
      const res = createRes();
      await getUserByEmail(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetByEmail.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { email: "a@b.com" } });
      const res = createRes();
      await getUserByEmail(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getUserById", () => {
    it("should return 403 when access is denied", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, organization_id: 99 })) as any);
      const req = createReq({ params: { id: "2" }, userId: 1, isSuperAdmin: false });
      const res = createRes();
      await getUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 200 when user is found", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 when user is not found (null access before check)", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createNewUser", () => {
    it("should return 201 when user is created", async () => {
      mockGetByEmail.mockResolvedValue(null as any);
      mockCreate.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({
        body: {
          name: "A",
          surname: "B",
          email: "a@b.com",
          password: "pass",
          roleId: 1,
          organizationId: 1,
        },
      });
      const res = createRes();
      await createNewUser(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return 409 when user already exists", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({
        body: {
          name: "A",
          surname: "B",
          email: "a@b.com",
          password: "pass",
          roleId: 1,
          organizationId: 1,
        },
      });
      const res = createRes();
      await createNewUser(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });
    it("should return 500 on error", async () => {
      mockGetByEmail.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: {
          name: "A",
          surname: "B",
          email: "a@b.com",
          password: "pass",
          roleId: 1,
          organizationId: 1,
        },
      });
      const res = createRes();
      await createNewUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("loginUser", () => {
    it("should return 202 on successful login", async () => {
      mockGetByEmail.mockResolvedValue(mockUser({ ...buildUser(), role_name: "Admin" }) as any);
      const req = createReq({ body: { email: "a@b.com", password: "pass" } });
      const res = createRes();
      await loginUser(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 401 when password is invalid", async () => {
      const u = mockUser(buildUser());
      u.comparePassword = jest.fn().mockResolvedValue(false);
      mockGetByEmail.mockResolvedValue(u as any);
      const req = createReq({ body: { email: "a@b.com", password: "wrong" } });
      const res = createRes();
      await loginUser(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 401 when user is not found", async () => {
      mockGetByEmail.mockResolvedValue(null as any);
      const req = createReq({ body: { email: "a@b.com", password: "pass" } });
      const res = createRes();
      await loginUser(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 500 on error", async () => {
      mockGetByEmail.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { email: "a@b.com", password: "pass" } });
      const res = createRes();
      await loginUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("resetPassword", () => {
    it("should return 202 on success", async () => {
      const userMock = mockUser(buildUser({ name: "A", surname: "B", password_hash: "old" }));
      mockGetByEmail.mockResolvedValue(userMock as any);
      const UserModel = require("../../domain.layer/models/user/user.model").UserModel;
      UserModel.createNewUser.mockResolvedValueOnce({
        ...userMock,
        updatePassword: jest.fn().mockResolvedValue(undefined),
        password_hash: "newhash",
      });
      const resetMock = resetPasswordQuery as jest.MockedFunction<typeof resetPasswordQuery>;
      resetMock.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ body: { email: "a@b.com", newPassword: "newpass" } });
      const res = createRes();
      await resetPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("updates by the stored email, not the raw request email", async () => {
      // Stored email is canonical "a@b.com"; the request types a different
      // case/whitespace variant. The case-sensitive UPDATE must target the
      // stored value, or it would match zero rows and silently no-op.
      const userMock = mockUser(buildUser({ email: "a@b.com", password_hash: "old" }));
      mockGetByEmail.mockResolvedValue(userMock as any);
      const UserModel = require("../../domain.layer/models/user/user.model").UserModel;
      UserModel.createNewUser.mockResolvedValueOnce({
        ...userMock,
        updatePassword: jest.fn().mockResolvedValue(undefined),
        password_hash: "newhash",
      });
      const resetMock = resetPasswordQuery as jest.MockedFunction<typeof resetPasswordQuery>;
      resetMock.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ body: { email: "  A@B.COM  ", newPassword: "newpass" } });
      const res = createRes();
      await resetPassword(req, res);
      expect(resetMock).toHaveBeenCalledWith("a@b.com", expect.anything(), expect.anything());
    });
    it("should return 500 when user is not found (null access before check)", async () => {
      mockGetByEmail.mockResolvedValue(null as any);
      const req = createReq({ body: { email: "a@b.com", newPassword: "newpass" } });
      const res = createRes();
      await resetPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 500 on error", async () => {
      mockGetByEmail.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { email: "a@b.com", newPassword: "newpass" } });
      const res = createRes();
      await resetPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateUserById", () => {
    it("should return 403 when org mismatch", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, organization_id: 99 })) as any);
      const req = createReq({ params: { id: "2" }, body: { name: "X" } });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 202 when user is updated", async () => {
      const u = mockUser(buildUser({ name: "A", surname: "B" }));
      mockGetById.mockResolvedValue(u as any);
      mockUpdate.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ params: { id: "1" }, body: { name: "X" } });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 500 when user is not found (null access before check)", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" }, body: { name: "X" } });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { name: "X" } });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    // SuperAdmin is no longer a role (role_id=5 removed); it's a mapping-
    // table overlay. The old "cannot assign role 5" / "cannot change role
    // 5" guards are gone. Assigning a non-existent role (e.g. 5) falls
    // through to the getRoleByIdQuery check → 400 (see "role does not
    // exist" test below). Editing a pure SuperAdmin (NULL role + NULL org)
    // through this endpoint is prevented separately.
    it("should return 400 when the requested role does not exist", async () => {
      const mockGetRole = getRoleByIdQuery as jest.MockedFunction<typeof getRoleByIdQuery>;
      mockGetRole.mockResolvedValueOnce(null as any);
      mockGetById.mockResolvedValue(
        mockUser(buildUser({ id: 2, organization_id: 1, role_id: 1 })) as any,
      );
      const req = createReq({ params: { id: "2" }, body: { name: "X", roleId: 99 } });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 403 when a non-admin updates another user", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, organization_id: 1 })) as any);
      const req = createReq({ params: { id: "2" }, body: { name: "X" }, role: "Reviewer" } as any);
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("deleteUserById", () => {
    it("should return 403 for pure super-admin (no role, no org)", async () => {
      mockGetById.mockResolvedValue(
        mockUser(buildUser({ role_id: null as any, organization_id: null as any })) as any,
      );
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 403 for demo user", async () => {
      const u = mockUser(buildUser());
      u.isDemoUser = jest.fn().mockReturnValue(true);
      mockGetById.mockResolvedValue(u as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 202 when user is deleted", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockDelete.mockResolvedValue(buildUser() as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 500 when user is not found (null access before check)", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("checkUserExists", () => {
    it("should return 200 with result", async () => {
      const mockCheck = checkUserExistsQuery as jest.MockedFunction<typeof checkUserExistsQuery>;
      mockCheck.mockResolvedValue(true as any);
      const req = createReq();
      const res = createRes();
      await checkUserExists(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      const mockCheck = checkUserExistsQuery as jest.MockedFunction<typeof checkUserExistsQuery>;
      mockCheck.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await checkUserExists(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("refreshAccessToken", () => {
    it("should return 400 when refresh token is missing", async () => {
      const req = createReq({ cookies: {} });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 200 with new token", async () => {
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      const { getRefreshTokenPayload } = require("../../utils/jwt.utils");
      (getRefreshTokenPayload as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 401 when the refresh token is unknown", async () => {
      const { findRefreshToken } = require("../../utils/refreshToken.utils");
      (findRefreshToken as jest.Mock).mockResolvedValueOnce(null);
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should revoke the family and return 401 on token reuse", async () => {
      const { findRefreshToken, revokeTokenFamily } = require("../../utils/refreshToken.utils");
      (findRefreshToken as jest.Mock).mockResolvedValueOnce({
        id: 1,
        user_id: 1,
        organization_id: 1,
        token_hash: "hash",
        family_id: "family-1",
        expires_at: new Date(Date.now() + 10000),
        revoked_at: new Date(),
      });
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(revokeTokenFamily).toHaveBeenCalledWith("family-1");
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("logoutUser", () => {
    it("should revoke the token, clear the cookie and return 200", async () => {
      const { revokeRefreshTokenByHash } = require("../../utils/refreshToken.utils");
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await logoutUser(req, res);
      expect(revokeRefreshTokenByHash).toHaveBeenCalledWith("hash");
      expect(res.clearCookie).toHaveBeenCalledWith(
        "refresh_token",
        expect.objectContaining({ path: "/api/users" }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 200 even without a refresh cookie", async () => {
      const req = createReq({ cookies: {} });
      const res = createRes();
      await logoutUser(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("ChangePassword", () => {
    it("should return 404 when user is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ body: { id: 1, currentPassword: "old", newPassword: "new" } });
      const res = createRes();
      await ChangePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 202 on success", async () => {
      const u = mockUser(buildUser({ password_hash: "old" }));
      mockGetById.mockResolvedValue(u as any);
      const resetMock = resetPasswordQuery as jest.MockedFunction<typeof resetPasswordQuery>;
      resetMock.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ body: { id: 1, currentPassword: "old", newPassword: "new" } });
      const res = createRes();
      await ChangePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { id: 1, currentPassword: "old", newPassword: "new" } });
      const res = createRes();
      await ChangePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateUserRole", () => {
    it("should return 403 when assigning SuperAdmin", async () => {
      const req = createReq({ params: { id: "1" }, body: { newRoleId: 5 } });
      const res = createRes();
      await updateUserRole(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 404 when user is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" }, body: { newRoleId: 2 } });
      const res = createRes();
      await updateUserRole(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 202 on success", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ role_id: 2 })) as any);
      mockUpdate.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ params: { id: "1" }, body: { newRoleId: 3 } });
      const res = createRes();
      await updateUserRole(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { newRoleId: 2 } });
      const res = createRes();
      await updateUserRole(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getUserProfilePhoto", () => {
    it("should return 403 when org mismatch", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, organization_id: 99 })) as any);
      const req = createReq({ params: { id: "2" } });
      const res = createRes();
      await getUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 200 when photo exists", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      const mockPhoto = getUserProfilePhotoQuery as jest.MockedFunction<
        typeof getUserProfilePhotoQuery
      >;
      mockPhoto.mockResolvedValue("photo-data" as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 200 when no photo exists", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      const mockPhoto = getUserProfilePhotoQuery as jest.MockedFunction<
        typeof getUserProfilePhotoQuery
      >;
      mockPhoto.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteUserProfilePhoto", () => {
    it("should return 403 when org mismatch", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, organization_id: 99 })) as any);
      const req = createReq({ params: { id: "2" } });
      const res = createRes();
      await deleteUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 200 when photo is deleted", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      const mockDelPhoto = deleteUserProfilePhotoQuery as jest.MockedFunction<
        typeof deleteUserProfilePhotoQuery
      >;
      mockDelPhoto.mockResolvedValue(true as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 when deletion fails", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      const mockDelPhoto = deleteUserProfilePhotoQuery as jest.MockedFunction<
        typeof deleteUserProfilePhotoQuery
      >;
      mockDelPhoto.mockResolvedValue(false as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getPreferencesForCurrentUser", () => {
    const mockPreferences = {
      toJSON: () => ({
        id: 1,
        user_id: 1,
        date_format: "MM-DD-YYYY",
        language: "de",
      }),
    };

    it("should return stored preferences for the current user", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(mockPreferences as any);
      const req = createReq();
      const res = createRes();
      await getPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            date_format: "MM-DD-YYYY",
            language: "de",
          }),
        }),
      );
    });

    it("should return defaults when no preferences row exists", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(null as any);
      const req = createReq();
      const res = createRes();
      await getPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            date_format: "DD-MM-YYYY",
            language: "en",
            theme: "light",
          }),
        }),
      );
    });

    it("should return 404 when the user is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq();
      const res = createRes();
      await getPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 403 for cross-organization access", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ organization_id: 99 })) as any);
      const req = createReq({ userId: 2 });
      const res = createRes();
      await getPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 500 on query error", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
