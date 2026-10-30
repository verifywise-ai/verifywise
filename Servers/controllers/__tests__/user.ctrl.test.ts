import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/user.utils", () => ({
  checkUserExistsQuery: jest.fn(),
  createNewUserQuery: jest.fn(),
  removeUserFromOrganizationQuery: jest.fn(),
  deleteUserProfilePhotoQuery: jest.fn(),
  getAllUsersQuery: jest.fn(),
  getUserByEmailQuery: jest.fn(),
  getUserByIdQuery: jest.fn(),
  getUserProfilePhotoQuery: jest.fn(),
  resetPasswordQuery: jest.fn(),
  updateUserByIdQuery: jest.fn(),
  isLastAdminQuery: jest.fn(async () => false),
}));
jest.mock("bcrypt", () => ({
  compare: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../utils/jwt.utils", () => ({
  generateToken: jest.fn().mockReturnValue("token"),
  generateOrganizationSelectionToken: jest.fn().mockReturnValue("selection-token"),
  getTokenPayload: jest.fn(),
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
  markInvitationAcceptedQuery: jest.fn().mockResolvedValue(1),
}));
jest.mock("../../utils/organizationMember.utils", () => ({
  addOrganizationMemberQuery: jest.fn(),
  getUserOrganizationsQuery: jest.fn(),
  updateOrganizationMemberRoleQuery: jest.fn(),
}));
jest.mock("../../utils/superAdmin.utils", () => ({
  isUserSuperAdmin: jest.fn().mockResolvedValue(false),
}));
jest.mock("../../utils/roleMap", () => ({
  getRoleNameById: jest.fn().mockResolvedValue("Admin"),
}));
jest.mock("../../utils/userPreference.utils", () => ({
  getPreferencesByUserQuery: jest.fn(),
  createNewUserPreferencesQuery: jest.fn(),
  updateUserPreferencesByIdQuery: jest.fn(),
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
  BusinessLogicException: class BusinessLogicException extends Error {},
  ConflictException: class ConflictException extends Error {},
}));
jest.mock("../../domain.layer/models/userPreferences/userPreferences.model", () => {
  const { ValidationException } = require("../../domain.layer/exceptions/custom.exception");
  const validDateFormats = ["DD-MM-YYYY", "MM-DD-YYYY", "DD/MM/YY", "MM/DD/YY"];
  const validLanguages = ["en", "de", "fr", "es"];

  function assertValid(dateFormat?: string, language?: string, parallelAgents?: unknown) {
    if (dateFormat !== undefined && dateFormat !== null && !validDateFormats.includes(dateFormat)) {
      throw new ValidationException(
        `Invalid date format. Must be one of: ${validDateFormats.join(", ")}`,
      );
    }
    if (language !== undefined && !validLanguages.includes(language)) {
      throw new ValidationException(
        `Invalid language. Must be one of: ${validLanguages.join(", ")}`,
      );
    }
    if (parallelAgents !== undefined && typeof parallelAgents !== "boolean") {
      throw new ValidationException("Invalid parallel_agents. Must be a boolean");
    }
  }

  class UserPreferencesModel {
    id?: number;
    user_id!: number;
    date_format!: string;
    language?: string;
    parallel_agents?: boolean;

    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }

    async updateUserPreferences(updates: {
      date_format?: string;
      language?: string;
      parallel_agents?: boolean;
    }) {
      assertValid(updates.date_format, updates.language, updates.parallel_agents);
      if (updates.date_format !== undefined) this.date_format = updates.date_format;
      if (updates.language !== undefined) this.language = updates.language;
      if (updates.parallel_agents !== undefined) this.parallel_agents = updates.parallel_agents;
    }

    toJSON() {
      return {
        id: this.id,
        user_id: this.user_id,
        date_format: this.date_format,
        language: this.language,
        parallel_agents: this.parallel_agents ?? false,
      };
    }

    static async createNewUserPreferences(
      userId: number,
      dateFormat: string,
      language?: string,
      parallelAgents?: boolean,
    ) {
      assertValid(dateFormat, language, parallelAgents);
      return new UserPreferencesModel({
        user_id: userId,
        date_format: dateFormat,
        language: language ?? "en",
        parallel_agents: parallelAgents,
      });
    }
  }

  return { UserPreferencesModel };
});

import { ForeignKeyConstraintError } from "sequelize";
import { buildUser } from "../../tests/factories/user.factory";
import { getRoleByIdQuery } from "../../utils/role.utils";
import {
  getAllUsers,
  getUserByEmail,
  getUserById,
  getPreferencesForCurrentUser,
  patchPreferencesForCurrentUser,
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
  selectLoginOrganization,
  acceptInvitationAsExistingUser,
} from "../user.ctrl";
import {
  getAllUsersQuery,
  getUserByEmailQuery,
  getUserByIdQuery,
  createNewUserQuery,
  updateUserByIdQuery,
  removeUserFromOrganizationQuery,
  resetPasswordQuery,
  checkUserExistsQuery,
  getUserProfilePhotoQuery,
  deleteUserProfilePhotoQuery,
  isLastAdminQuery,
} from "../../utils/user.utils";
import { markInvitationAcceptedQuery } from "../../utils/invitation.utils";
import {
  addOrganizationMemberQuery,
  getUserOrganizationsQuery,
  updateOrganizationMemberRoleQuery,
} from "../../utils/organizationMember.utils";
import { isUserSuperAdmin } from "../../utils/superAdmin.utils";
import { getRoleNameById } from "../../utils/roleMap";
import { generateUserTokens } from "../../utils/auth.utils";
import { getTokenPayload } from "../../utils/jwt.utils";
import { revokeTokenFamily } from "../../utils/refreshToken.utils";
import bcrypt from "bcrypt";
import { sequelize } from "../../database/db";
import {
  getPreferencesByUserQuery,
  createNewUserPreferencesQuery,
  updateUserPreferencesByIdQuery,
} from "../../utils/userPreference.utils";

const mockGetAll = getAllUsersQuery as jest.MockedFunction<typeof getAllUsersQuery>;
const mockGetByEmail = getUserByEmailQuery as jest.MockedFunction<typeof getUserByEmailQuery>;
const mockGetById = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockCreate = createNewUserQuery as jest.MockedFunction<typeof createNewUserQuery>;
const mockUpdate = updateUserByIdQuery as jest.MockedFunction<typeof updateUserByIdQuery>;
const mockRemove = removeUserFromOrganizationQuery as jest.MockedFunction<
  typeof removeUserFromOrganizationQuery
>;
const mockOrganizations = getUserOrganizationsQuery as jest.MockedFunction<
  typeof getUserOrganizationsQuery
>;
const mockUpdateRole = updateOrganizationMemberRoleQuery as jest.MockedFunction<
  typeof updateOrganizationMemberRoleQuery
>;
const mockAddMember = addOrganizationMemberQuery as jest.MockedFunction<
  typeof addOrganizationMemberQuery
>;
const mockIsSuperAdmin = isUserSuperAdmin as jest.MockedFunction<typeof isUserSuperAdmin>;
const mockTokenPayload = getTokenPayload as jest.MockedFunction<typeof getTokenPayload>;

const ACME = { organization_id: 1, organization_name: "Acme", role_id: 1, role_name: "Admin" };
const GLOBEX = { organization_id: 2, organization_name: "Globex", role_id: 3, role_name: "Editor" };

/**
 * getUserByIdQuery as the organization filter in its SQL answers: the user is
 * returned only for the organization they belong to (and with no
 * organization, as identity).
 */
const memberOf =
  (organizationId: number, user: unknown) =>
  async (_id: number, _tx?: unknown, orgId?: number): Promise<any> =>
    orgId === undefined || orgId === organizationId ? user : undefined;
const mockIsLastAdmin = isLastAdminQuery as jest.MockedFunction<typeof isLastAdminQuery>;
const mockGetPreferences = getPreferencesByUserQuery as jest.MockedFunction<
  typeof getPreferencesByUserQuery
>;
const mockCreatePreferences = createNewUserPreferencesQuery as jest.MockedFunction<
  typeof createNewUserPreferencesQuery
>;
const mockUpdatePreferences = updateUserPreferencesByIdQuery as jest.MockedFunction<
  typeof updateUserPreferencesByIdQuery
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

/** The invitation as register.middleware checked it. */
const CHECKED_INVITATION = { id: 41, roleId: 1, expiresAtMs: 1793448000000 };

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
    it("should answer 404, like a missing user, for a user in another organization", async () => {
      mockGetById.mockImplementation(memberOf(99, mockUser(buildUser({ id: 2 }))));
      const req = createReq({ params: { id: "2" }, userId: 1, isSuperAdmin: false });
      const res = createRes();
      await getUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 200 when user is found", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when user is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
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
      res.locals = { invitation: CHECKED_INVITATION };
      await createNewUser(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("marks the invitation accepted inside the user's transaction, before commit", async () => {
      // A link works once: the user and the accepted invitation commit together.
      mockGetByEmail.mockResolvedValue(null as any);
      mockCreate.mockResolvedValue(mockUser(buildUser()) as any);
      const tx: any = await (sequelize.transaction as any)();
      const mockMark = markInvitationAcceptedQuery as jest.Mock;
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
      res.locals = { invitation: CHECKED_INVITATION };
      await createNewUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockMark).toHaveBeenCalledWith(1, CHECKED_INVITATION, tx);
      expect(mockMark.mock.invocationCallOrder[0]).toBeLessThan(
        tx.commit.mock.invocationCallOrder.at(-1),
      );
    });
    it("rolls back the user when the invitation cannot be marked accepted", async () => {
      mockGetByEmail.mockResolvedValue(null as any);
      mockCreate.mockResolvedValue(mockUser(buildUser()) as any);
      const tx: any = await (sequelize.transaction as any)();
      tx.commit.mockClear();
      (markInvitationAcceptedQuery as jest.Mock).mockRejectedValueOnce(
        new Error("db down") as never,
      );
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
      res.locals = { invitation: CHECKED_INVITATION };
      await createNewUser(req, res);

      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.commit).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(201);
    });
    it("refuses and rolls back when the invitation was revoked before acceptance", async () => {
      // The middleware saw a pending invitation, then an admin revoked it:
      // marking it accepted matches no row, so the link no longer counts.
      mockGetByEmail.mockResolvedValue(null as any);
      mockCreate.mockResolvedValue(mockUser(buildUser()) as any);
      const tx: any = await (sequelize.transaction as any)();
      tx.commit.mockClear();
      (markInvitationAcceptedQuery as jest.Mock).mockResolvedValueOnce(0 as never);
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
      res.locals = { invitation: CHECKED_INVITATION };
      await createNewUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.commit).not.toHaveBeenCalled();
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
      res.locals = { invitation: CHECKED_INVITATION };
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
      res.locals = { invitation: CHECKED_INVITATION };
      await createNewUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("loginUser", () => {
    it("should log a user with one organization straight in to it", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValue([ACME]);
      const req = createReq({ body: { email: "a@b.com", password: "pass" } });
      const res = createRes();
      await loginUser(req, res);
      expect(generateUserTokens).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, roleName: "Admin", organizationId: 1 }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ token: "token" }) }),
      );
    });
    it("should ask a user with several organizations to choose, without a session", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValue([ACME, GLOBEX]);
      const req = createReq({ body: { email: "a@b.com", password: "pass" } });
      const res = createRes();
      await loginUser(req, res);
      expect(generateUserTokens).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: {
          requiresOrganizationSelection: true,
          organizations: [
            { id: 1, name: "Acme", role_name: "Admin" },
            { id: 2, name: "Globex", role_name: "Editor" },
          ],
          selectionToken: "selection-token",
        },
      });
    });
    it("should log a pure super admin in without an organization", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValue([]);
      mockIsSuperAdmin.mockResolvedValueOnce(true);
      const req = createReq({ body: { email: "a@b.com", password: "pass" } });
      const res = createRes();
      await loginUser(req, res);
      expect(generateUserTokens).toHaveBeenCalledWith(
        expect.objectContaining({ roleName: "SuperAdmin", organizationId: null }),
        res,
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { token: "token", isSuperAdmin: true } }),
      );
    });
    it("should refuse a user with no organization and no super_admins row", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValue([]);
      const req = createReq({ body: { email: "a@b.com", password: "pass" } });
      const res = createRes();
      await loginUser(req, res);
      expect(generateUserTokens).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
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
    it("should answer 404, like a missing user, for a user in another organization", async () => {
      mockGetById.mockImplementation(memberOf(99, mockUser(buildUser({ id: 2 }))));
      const req = createReq({ params: { id: "2" }, body: { name: "X" } });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockUpdate).not.toHaveBeenCalled();
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
    // through to the role lookup → 400 (see "role does not exist" test
    // below). Editing a pure SuperAdmin (NULL role + NULL org) through this
    // endpoint is prevented separately.
    describe("role assignment scope", () => {
      // Read from the database (not the role cache), so a role created or
      // deleted a moment ago is judged correctly.
      const mockRoleById = getRoleByIdQuery as jest.MockedFunction<typeof getRoleByIdQuery>;

      // Caller is an Admin of org 1 (createReq defaults); target user 2 is in
      // org 1 with the built-in Admin role (id 1).
      async function assignRole(roleId: number) {
        mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, role_id: 1 })) as any);
        mockUpdate.mockResolvedValue(mockUser(buildUser({ id: 2 })) as any);
        const req = createReq({ params: { id: "2" }, body: { roleId } });
        const res = createRes();
        await updateUserById(req, res);
        return res;
      }

      it("should refuse to demote the organization's last Admin", async () => {
        mockRoleById.mockResolvedValueOnce({ id: 3, name: "Editor", organization_id: null } as any);
        mockIsLastAdmin.mockResolvedValueOnce(true);
        const res = await assignRole(3);
        expect(mockIsLastAdmin).toHaveBeenCalledWith(1, 2, expect.anything());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockUpdateRole).not.toHaveBeenCalled();
      });

      it("should answer 400 when the role is deleted before the update lands", async () => {
        mockRoleById.mockResolvedValueOnce({ id: 3, name: "Editor", organization_id: null } as any);
        mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, role_id: 1 })) as any);
        mockUpdate.mockResolvedValue(mockUser(buildUser({ id: 2 })) as any);
        mockUpdateRole.mockRejectedValueOnce(
          new ForeignKeyConstraintError({ message: "violates foreign key constraint" } as any),
        );
        const req = createReq({ params: { id: "2" }, body: { roleId: 3 } });
        const res = createRes();
        await updateUserById(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Unknown role" }));
      });

      it("should return 400 when the requested role does not exist", async () => {
        mockRoleById.mockResolvedValueOnce(null);
        const res = await assignRole(99);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Unknown role" }));
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("should return 400 and not update when assigning another organization's custom role", async () => {
        mockRoleById.mockResolvedValueOnce({
          id: 40,
          name: "Auditor Plus",
          organization_id: 2,
        } as any);
        const res = await assignRole(40);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Unknown role" }));
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("should return 400 and not update when assigning a role named SuperAdmin", async () => {
        mockRoleById.mockResolvedValueOnce({
          id: 5,
          name: "SuperAdmin",
          organization_id: null,
        } as any);
        const res = await assignRole(5);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Unknown role" }));
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("should return 400 for a role id that is not a positive integer", async () => {
        // true would become 1 (Admin) with Number(); only digits count.
        for (const roleId of ["abc", "5abc", -1, 1.5, true, [3], "0x2", " 2 ", "2e0"] as any[]) {
          mockRoleById.mockClear();
          mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, role_id: 1 })) as any);
          const req = createReq({ params: { id: "2" }, body: { roleId } });
          const res = createRes();
          await updateUserById(req, res);
          expect(res.status).toHaveBeenCalledWith(400);
          expect(mockRoleById).not.toHaveBeenCalled();
        }
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("should refuse a role row without an organization field instead of reading it as built-in", async () => {
        mockRoleById.mockResolvedValueOnce({ id: 40, name: "Partial" } as any);
        const res = await assignRole(40);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it("should allow assigning the caller's own organization's custom role", async () => {
        mockRoleById.mockResolvedValueOnce({
          id: 41,
          name: "Risk Lead",
          organization_id: 1,
        } as any);
        const res = await assignRole(41);
        expect(res.status).toHaveBeenCalledWith(202);
        // The role is the membership's, in the caller's organization.
        expect(mockUpdateRole).toHaveBeenCalledWith(1, 2, 41, expect.anything());
      });

      it("should allow assigning a built-in role", async () => {
        mockRoleById.mockResolvedValueOnce({
          id: 2,
          name: "Reviewer",
          organization_id: null,
        } as any);
        const res = await assignRole(2);
        expect(res.status).toHaveBeenCalledWith(202);
        // The role is the membership's, in the caller's organization.
        expect(mockUpdateRole).toHaveBeenCalledWith(1, 2, 2, expect.anything());
      });
    });
    it("should return 404 for a user that does not exist", async () => {
      mockGetById.mockResolvedValue(undefined as any);
      const req = createReq({ params: { id: "999999" }, body: { name: "X" } });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
    it("should return 403 when a non-admin updates another user", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2 })) as any);
      const req = createReq({ params: { id: "2" }, body: { name: "X" }, role: "Reviewer" } as any);
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 403 when an Admin changes another user's name or email", async () => {
      for (const body of [{ name: "X" }, { surname: "Y" }, { email: "new@b.com" }]) {
        jest.clearAllMocks();
        mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2 })) as any);
        const req = createReq({ params: { id: "2" }, body });
        const res = createRes();
        await updateUserById(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockUpdate).not.toHaveBeenCalled();
      }
    });
    it("should let an Admin send another user's unchanged name and email with a role", async () => {
      (getRoleByIdQuery as jest.Mock).mockResolvedValueOnce({
        id: 3,
        name: "Editor",
        organization_id: null,
      } as never);
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2, role_id: 1 })) as any);
      mockUpdate.mockResolvedValue(mockUser(buildUser({ id: 2 })) as any);
      const req = createReq({
        params: { id: "2" },
        body: { name: "Test", surname: "User", email: "a@b.com", roleId: 3 },
      });
      const res = createRes();
      await updateUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(mockUpdateRole).toHaveBeenCalledWith(1, 2, 3, expect.anything());
    });
  });

  describe("deleteUserById", () => {
    it("should answer 404 for a pure super-admin (no membership)", async () => {
      mockGetById.mockImplementation(memberOf(-1, mockUser(buildUser())));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(mockGetById).toHaveBeenCalledWith(1, expect.anything(), 1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockRemove).not.toHaveBeenCalled();
    });
    it("should answer 404, like a missing user, for a user in another organization", async () => {
      mockGetById.mockImplementation(memberOf(99, mockUser(buildUser({ id: 2 }))));
      const req = createReq({ params: { id: "2" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockRemove).not.toHaveBeenCalled();
    });
    it("should refuse to delete the organization's last Admin", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockIsLastAdmin.mockResolvedValueOnce(true);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(mockRemove).not.toHaveBeenCalled();
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
    it("should remove the user from the caller's organization only", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ id: 2 })) as any);
      mockRemove.mockResolvedValue({ removed: true, accountDeleted: false });
      const req = createReq({ params: { id: "2" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(mockRemove).toHaveBeenCalledWith(2, 1, expect.anything());
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should return 404 when user is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteUserById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
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

  describe("selectLoginOrganization", () => {
    const selection = {
      id: 1,
      email: "a@b.com",
      type: "organization_selection",
      expire: Date.now() + 60000,
    };

    it("should log in to the chosen organization", async () => {
      mockTokenPayload.mockReturnValue(selection);
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValue([ACME, GLOBEX]);
      const req = createReq({ body: { selectionToken: "selection-token", organizationId: 2 } });
      const res = createRes();
      await selectLoginOrganization(req, res);
      expect(generateUserTokens).toHaveBeenCalledWith(
        expect.objectContaining({ roleName: "Editor", organizationId: 2 }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should refuse an organization the user does not belong to", async () => {
      mockTokenPayload.mockReturnValue(selection);
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValue([ACME, GLOBEX]);
      const req = createReq({ body: { selectionToken: "selection-token", organizationId: 9 } });
      const res = createRes();
      await selectLoginOrganization(req, res);
      expect(generateUserTokens).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should refuse any token that is not a selection token", async () => {
      mockTokenPayload.mockReturnValue({ ...selection, type: undefined });
      const req = createReq({ body: { selectionToken: "access-token", organizationId: 1 } });
      const res = createRes();
      await selectLoginOrganization(req, res);
      expect(mockGetById).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should refuse an expired selection token", async () => {
      mockTokenPayload.mockReturnValue({ ...selection, expire: Date.now() - 1 });
      const req = createReq({ body: { selectionToken: "selection-token", organizationId: 1 } });
      const res = createRes();
      await selectLoginOrganization(req, res);
      expect(generateUserTokens).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(406);
    });
  });

  describe("acceptInvitationAsExistingUser", () => {
    const acceptReq = (password = "pass") =>
      createReq({
        body: { email: "a@b.com", password, roleId: 3, organizationId: 2 },
      });
    const acceptRes = () => {
      const res = createRes();
      res.locals = { invitation: CHECKED_INVITATION };
      return res;
    };

    it("should add the membership, accept the invitation and log in to the organization", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValueOnce([ACME]).mockResolvedValueOnce([ACME, GLOBEX]);
      const res = acceptRes();
      await acceptInvitationAsExistingUser(acceptReq(), res);
      expect(mockAddMember).toHaveBeenCalledWith(2, 1, 3, expect.anything());
      expect(markInvitationAcceptedQuery).toHaveBeenCalledWith(
        2,
        CHECKED_INVITATION,
        expect.anything(),
      );
      expect(generateUserTokens).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 2, roleName: "Editor" }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(202);
    });
    it("should refuse a wrong password without joining", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false as never);
      const res = acceptRes();
      await acceptInvitationAsExistingUser(acceptReq("wrong"), res);
      expect(mockAddMember).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should refuse a pure super admin", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValueOnce([]);
      const res = acceptRes();
      await acceptInvitationAsExistingUser(acceptReq(), res);
      expect(mockAddMember).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    });
    it("should refuse a user who is already a member", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValueOnce([ACME, GLOBEX]);
      const res = acceptRes();
      await acceptInvitationAsExistingUser(acceptReq(), res);
      expect(mockAddMember).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
    });
    it("should roll back the membership when the invitation cannot be marked accepted", async () => {
      mockGetByEmail.mockResolvedValue(mockUser(buildUser()) as any);
      mockOrganizations.mockResolvedValueOnce([ACME]);
      (markInvitationAcceptedQuery as jest.Mock).mockResolvedValueOnce(0 as never);
      const transaction = { commit: jest.fn(), rollback: jest.fn() };
      (sequelize.transaction as jest.Mock).mockResolvedValueOnce(transaction as never);
      const res = acceptRes();
      await acceptInvitationAsExistingUser(acceptReq(), res);
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
      expect(generateUserTokens).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("refreshAccessToken", () => {
    it("should return 400 when refresh token is missing", async () => {
      const req = createReq({ cookies: {} });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 200 with new token and the session's organization", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ role_id: 1 })) as any);
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(mockGetById).toHaveBeenCalledWith(1, null, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { token: "token", organizationId: 1 } }),
      );
    });
    it("should mint the current role, not the one in the old token", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser({ role_id: 3 })) as any);
      (getRoleNameById as jest.Mock).mockResolvedValueOnce("Editor" as never);
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(generateUserTokens).toHaveBeenCalledWith(
        expect.objectContaining({ roleName: "Editor", organizationId: 1 }),
        res,
        "family-1",
      );
    });
    it("should revoke the family and return 401 once the user is removed from the organization", async () => {
      mockGetById.mockResolvedValue(undefined as any);
      const req = createReq({ cookies: { refresh_token: "valid" } });
      const res = createRes();
      await refreshAccessToken(req, res);
      expect(revokeTokenFamily).toHaveBeenCalledWith("family-1");
      expect(generateUserTokens).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
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
    // Another organization's user and a missing one answer alike (no id oracle).
    it.each([
      ["another organization's user", mockUser(buildUser({ id: 2 }))],
      ["a missing user", null],
    ])("should return 404 for %s", async (_label, user) => {
      mockGetById.mockImplementation(memberOf(99, user));
      const req = createReq({ params: { id: "2" } });
      const res = createRes();
      await getUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
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
    // Another organization's user and a missing one answer alike (no id oracle).
    it.each([
      ["another organization's user", mockUser(buildUser({ id: 2 }))],
      ["a missing user", null],
    ])("should return 404 for %s", async (_label, user) => {
      mockGetById.mockImplementation(memberOf(99, user));
      const req = createReq({ params: { id: "2" } });
      const res = createRes();
      await deleteUserProfilePhoto(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
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
        parallel_agents: true,
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
            parallel_agents: true,
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
            parallel_agents: false,
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

    it("should return 500 on query error", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("patchPreferencesForCurrentUser", () => {
    const savedPreferences = {
      toJSON: () => ({
        id: 1,
        user_id: 1,
        date_format: "MM-DD-YYYY",
        language: "de",
      }),
    };

    it("should persist valid date_format and language on an existing row", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue({
        user_id: 1,
        date_format: "DD-MM-YYYY",
        language: "en",
      } as any);
      mockUpdatePreferences.mockResolvedValue(savedPreferences as any);

      const req = createReq({ body: { date_format: "MM-DD-YYYY", language: "de" } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
      expect(mockCreatePreferences).not.toHaveBeenCalled();
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

    it("should upsert when no preferences row exists", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(null as any);
      mockCreatePreferences.mockResolvedValue(savedPreferences as any);

      const req = createReq({ body: { date_format: "MM-DD-YYYY", language: "de" } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(mockCreatePreferences).toHaveBeenCalledTimes(1);
      expect(mockUpdatePreferences).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            date_format: "MM-DD-YYYY",
            language: "de",
            user_id: 1,
          }),
        }),
      );
    });

    it("should ignore body user_id and write the authenticated user", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(null as any);
      mockCreatePreferences.mockResolvedValue(savedPreferences as any);

      const req = createReq({
        userId: 1,
        body: { user_id: 999, date_format: "DD-MM-YYYY", language: "en" },
      });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(mockCreatePreferences).toHaveBeenCalledTimes(1);
      const createdArg = mockCreatePreferences.mock.calls[0][0] as { user_id: number };
      expect(createdArg.user_id).toBe(1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 for an unknown date_format", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(null as any);

      const req = createReq({ body: { date_format: "YYYY-MM-DD" } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreatePreferences).not.toHaveBeenCalled();
    });

    it("should return 400 for an unknown language", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(null as any);

      const req = createReq({ body: { language: "en-US" } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreatePreferences).not.toHaveBeenCalled();
    });

    it("should return 400 when the body has neither date_format, language, nor parallel_agents", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockGetById).not.toHaveBeenCalled();
    });

    it("should persist parallel_agents on an existing row when it is the only field", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue({
        user_id: 1,
        date_format: "DD-MM-YYYY",
        language: "en",
        parallel_agents: false,
      } as any);
      mockUpdatePreferences.mockResolvedValue({} as any);

      const req = createReq({ body: { parallel_agents: true } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
      const updated = mockUpdatePreferences.mock.calls[0][1] as { parallel_agents?: boolean };
      expect(updated.parallel_agents).toBe(true);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parallel_agents: true }),
        }),
      );
    });

    it("should persist parallel_agents when creating a preferences row", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(null as any);
      mockCreatePreferences.mockResolvedValue({} as any);

      const req = createReq({ body: { parallel_agents: false } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(mockCreatePreferences).toHaveBeenCalledTimes(1);
      const created = mockCreatePreferences.mock.calls[0][0] as { parallel_agents?: boolean };
      expect(created.parallel_agents).toBe(false);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parallel_agents: false }),
        }),
      );
    });

    it("should return 400 when parallel_agents is not a boolean", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockResolvedValue(null as any);

      const req = createReq({ body: { parallel_agents: "yes" } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreatePreferences).not.toHaveBeenCalled();
    });

    it("should return 404 when the user is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ body: { date_format: "DD-MM-YYYY" } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 500 on query error", async () => {
      mockGetById.mockResolvedValue(mockUser(buildUser()) as any);
      mockGetPreferences.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { date_format: "DD-MM-YYYY" } });
      const res = createRes();
      await patchPreferencesForCurrentUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
