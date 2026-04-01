/**
 * @fileoverview User Management Controller
 *
 * Handles all user-related operations including authentication, CRUD operations,
 * and user lifecycle management. This controller implements secure authentication
 * flows with JWT tokens, password hashing, and comprehensive validation.
 *
 * Key Features:
 * - User authentication (login, token refresh)
 * - Password management (reset, change, validation)
 * - User CRUD operations with transaction support
 * - Multi-tenant organization isolation
 * - Role-based access control integration
 * - Progress tracking and analytics
 *
 * Security Features:
 * - Bcrypt password hashing with automatic salt generation
 * - JWT access and refresh token generation
 * - HTTP-only cookie-based refresh token storage
 * - Constant-time password comparison via bcrypt
 * - Demo user protection from deletion
 * - Selective audit logging for critical operations
 *
 * @module controllers/user
 */

import { Request, Response } from "express";
import {
  checkUserExistsQuery,
  createNewUserQuery,
  deleteUserByIdQuery,
  deleteUserProfilePhotoQuery,
  getAllUsersQuery,
  getAssessmentsForProject,
  getControlCategoriesForProject,
  getControlForControlCategory,
  getQuestionsForSubTopic,
  getSubControlForControl,
  getSubTopicsForTopic,
  getTopicsForAssessment,
  getUserByEmailQuery,
  getUserByIdQuery,
  getUserProfilePhotoQuery,
  getUserProjects,
  resetPasswordQuery,
  updateUserByIdQuery,
  uploadUserProfilePhotoQuery,
} from "../utils/user.utils";
import { sendMemberRoleChangedEditorToAdminNotification } from "../services/userNotification/projectNotifications";
import { logFailure } from "../utils/logger/logHelper";
import bcrypt from "bcrypt";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { generateToken, getRefreshTokenPayload } from "../utils/jwt.utils";
import { UserModel } from "../domain.layer/models/user/user.model";
import { sequelize } from "../database/db";
import {
  ValidationException,
  BusinessLogicException,
  ConflictException,
} from "../domain.layer/exceptions/custom.exception";
import { Transaction } from "sequelize";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";
import { generateUserTokens } from "../utils/auth.utils";
import { sendSlackNotification } from "../services/slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../domain.layer/enums/slack.enum";
import { getRoleByIdQuery } from "../utils/role.utils";
import { uploadFile } from "../utils/fileUpload.utils";
import { markInvitationAcceptedQuery } from "../utils/invitation.utils";

/**
 * Retrieves all users within the authenticated user's organization
 *
 * Returns a list of all users belonging to the organization specified in the request context.
 * Sensitive data (password hashes) are filtered out using toSafeJSON() method.
 *
 * @async
 * @param {Request} req - Express request with organizationId from auth middleware
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} JSON array of users or appropriate status code
 *
 * @security
 * - Requires authentication (JWT middleware)
 * - Organization-scoped query (multi-tenant isolation)
 * - Sensitive data filtered from response
 *
 * @example
 * GET /api/users
 * Authorization: Bearer <jwt_token>
 *
 * Response 200:
 * {
 *   "code": 200,
 *   "data": [{ "id": 1, "email": "user@example.com", "name": "John", ... }]
 * }
 */
async function getAllUsers(req: Request, res: Response): Promise<any> {
  logStructured(
    "processing",
    "starting getAllUsers",
    "getAllUsers",
    "user.ctrl.ts"
  );
  logger.debug("🔍 Fetching all users");

  try {
    const users = (await getAllUsersQuery(req.organizationId!)) as UserModel[];

    if (users && users.length > 0) {
      logStructured(
        "successful",
        `found ${users.length} users`,
        "getAllUsers",
        "user.ctrl.ts"
      );
      return res
        .status(200)
        .json(STATUS_CODE[200](users.map((user) => user.toSafeJSON())));
    }

    logStructured(
      "successful",
      "no users found",
      "getAllUsers",
      "user.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](users));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve users",
      "getAllUsers",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in getAllUsers:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function getUserByEmail(req: Request, res: Response) {
  const email = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
  logStructured(
    "processing",
    `fetching user by email: ${email}`,
    "getUserByEmail",
    "user.ctrl.ts"
  );
  logger.debug(`🔍 Looking up user with email: ${email}`);

  try {
    const user = (await getUserByEmailQuery(email)) as UserModel & {
      role_name: string;
    };

    if (user) {
      logStructured(
        "successful",
        `user found: ${email}`,
        "getUserByEmail",
        "user.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](user.toSafeJSON()));
    }

    logStructured(
      "successful",
      `no user found: ${email}`,
      "getUserByEmail",
      "user.ctrl.ts"
    );
    return res.status(404).json(STATUS_CODE[404](user));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch user: ${email}`,
      "getUserByEmail",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in getUserByEmail:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function getUserById(req: Request, res: Response) {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logStructured(
    "processing",
    `fetching user by ID: ${id}`,
    "getUserById",
    "user.ctrl.ts"
  );
  logger.debug(`🔍 Looking up user with ID: ${id}`);

  try {
    const user = (await getUserByIdQuery(id)) as UserModel;
    // Super-admin can access their own record (no org) or any user when viewing an org
    const isSelfLookup = id === req.userId;
    if (!req.isSuperAdmin && !isSelfLookup && user.organization_id !== req.organizationId) {
      logStructured(
        "error",
        `access denied to user ID ${id}`,
        "getUserById",
        "user.ctrl.ts"
      );
      return res
        .status(403)
        .json(STATUS_CODE[403]("Forbidden: Access to this user is denied"));
    }

    if (user) {
      logStructured(
        "successful",
        `user found: ID ${id}`,
        "getUserById",
        "user.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](user.toSafeJSON()));
    }

    logStructured(
      "successful",
      `no user found: ID ${id}`,
      "getUserById",
      "user.ctrl.ts"
    );
    return res.status(404).json(STATUS_CODE[404](user));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch user: ID ${id}`,
      "getUserById",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in getUserById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function createNewUserWrapper(
  body: {
    name: string;
    surname: string;
    email: string;
    password: string;
    roleId: number;
    organizationId: number;
  },
  transaction: Transaction
) {
  const { name, surname, email, password, roleId, organizationId } = body;

  // Check if user already exists
  const existingUser = await getUserByEmailQuery(email);
  if (existingUser) {
    throw new ConflictException("User with this email already exists");
  }

  // Create user using the enhanced UserModel method
  const userModel = await UserModel.createNewUser(
    name,
    surname,
    email,
    password,
    roleId,
    organizationId
  );

  // Validate user data before saving
  await userModel.validateUserData();

  // Check email uniqueness
  const isEmailUnique = await UserModel.validateEmailUniqueness(email);
  if (!isEmailUnique) {
    throw new ConflictException("Email already exists");
  }

  const user = (await createNewUserQuery(userModel, transaction)) as UserModel;
  return user;
}

/**
 * Creates a new user with validation and transaction support
 *
 * Handles secure user registration with email uniqueness validation, password hashing,
 * and comprehensive error handling. Uses database transactions to ensure data consistency.
 *
 * @async
 * @param {Request} req - Express request with user data in body
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Created user object or error status
 *
 * @security
 * - Password automatically hashed by UserModel.createNewUser()
 * - Email uniqueness validated before creation
 * - Duplicate email detection with 409 Conflict response
 * - Database transaction ensures atomic operation
 * - Sensitive data filtered from response via toSafeJSON()
 *
 * @validation
 * - Email format and uniqueness
 * - Password strength requirements
 * - Required fields validation
 * - Role ID and organization ID validation
 *
 * @example
 * POST /api/users
 * {
 *   "name": "John",
 *   "surname": "Doe",
 *   "email": "john@example.com",
 *   "password": "SecurePassword123!",
 *   "roleId": 2,
 *   "organizationId": 1
 * }
 *
 * Response 201:
 * {
 *   "code": 201,
 *   "data": {
 *     "id": 10,
 *     "email": "john@example.com",
 *     "name": "John",
 *     "surname": "Doe"
 *   }
 * }
 */
async function createNewUser(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { name, surname, email, password, roleId, organizationId } = req.body;

  logStructured(
    "processing",
    `starting user creation for ${email}`,
    "createNewUser",
    "user.ctrl.ts"
  );
  logger.debug(`🛠️ Creating user: ${email}`);

  try {
    // Check for existing user
    const existingUser = await getUserByEmailQuery(email);
    if (existingUser) {
      logStructured(
        "error",
        `user already exists: ${email}`,
        "createNewUser",
        "user.ctrl.ts"
      );
      await logEvent("Error", `Attempted to create duplicate user: ${email}`, req.userId!, req.organizationId!);
      await transaction.rollback();
      return res
        .status(409)
        .json(STATUS_CODE[409]("User with this email already exists"));
    }

    // Create user model with automatic password hashing
    const userModel = await UserModel.createNewUser(
      name,
      surname,
      email,
      password,
      roleId,
      organizationId
    );
    await userModel.validateUserData();

    // Double-check email uniqueness
    const isEmailUnique = await UserModel.validateEmailUniqueness(email);
    if (!isEmailUnique) {
      logStructured(
        "error",
        `email not unique: ${email}`,
        "createNewUser",
        "user.ctrl.ts"
      );
      await logEvent("Error", `Email not unique during creation: ${email}`, req.userId!, req.organizationId!);
      await transaction.rollback();
      return res.status(409).json(STATUS_CODE[409]("Email already exists"));
    }

    const user = (await createNewUserQuery(
      userModel,
      transaction
    )) as UserModel;

    if (user) {
      await transaction.commit();

      // Mark any pending invitation as accepted (fire-and-forget)
      try {
        await markInvitationAcceptedQuery(organizationId, email);
      } catch (_) {
        // Non-critical — don't block user creation
      }

      logStructured(
        "successful",
        `user created: ${email}`,
        "createNewUser",
        "user.ctrl.ts"
      );
      await logEvent("Create", `User created: ${email}`, req.userId!, req.organizationId!);
      return res.status(201).json(STATUS_CODE[201](user.toSafeJSON()));
    }

    logStructured(
      "error",
      `failed to create user: ${email}`,
      "createNewUser",
      "user.ctrl.ts"
    );
    await logEvent("Error", `User creation failed: ${email}`, req.userId!, req.organizationId!);
    await transaction.rollback();
    return res.status(400).json(STATUS_CODE[400]("Failed to create user"));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ConflictException) {
      return res.status(409).json(STATUS_CODE[409](error.message));
    }

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation failed: ${error.message}`,
        "createNewUser",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Validation error during user creation: ${error.message}`,
        req.userId!, req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "createNewUser",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Business logic error during user creation: ${error.message}`,
        req.userId!, req.organizationId!
      );
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured(
      "error",
      `unexpected error: ${email}`,
      "createNewUser",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during user creation: ${(error as Error).message}`,
      req.userId!, req.organizationId!
    );
    logger.error("❌ Error in createNewUser:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Authenticates a user with email and password credentials
 *
 * Implements secure login flow with bcrypt password verification and JWT token generation.
 * On successful authentication, generates both access token (returned in response) and
 * refresh token (set in HTTP-only cookie) for enhanced security.
 *
 * @async
 * @param {Request} req - Express request with email and password in body
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} JWT access token or error status
 *
 * @security
 * - Password verified using bcrypt (constant-time comparison)
 * - Fallback password comparison for backwards compatibility
 * - Refresh token stored in HTTP-only cookie (Secure flag in production only)
 * - Cookie uses SameSite attribute and path restriction (/api/users)
 * - Access token returned in JSON response
 * - Last login timestamp updated in memory (not persisted immediately)
 * - Failed attempts logged for security monitoring
 *
 * @example
 * POST /api/users/login
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!"
 * }
 *
 * Response 202:
 * {
 *   "code": 202,
 *   "data": {
 *     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * }
 * Set-Cookie: refresh_token=<token>; Path=/api/users; HttpOnly; Secure (prod); SameSite=none (prod) or lax (dev)
 */
async function loginUser(req: Request, res: Response): Promise<any> {
  const { email, password } = req.body;

  logStructured(
    "processing",
    `attempting login for ${email}`,
    "loginUser",
    "user.ctrl.ts"
  );
  logger.debug(`🔐 Login attempt for ${email}`);

  try {
    const userData = await getUserByEmailQuery(email);

    if (userData) {
      let user: UserModel;
      if (userData instanceof UserModel) {
        user = userData;
      } else {
        user = new UserModel();
        Object.assign(user, userData);
      }

      // Verify password with fallback for backwards compatibility
      let passwordIsMatched = false;
      try {
        passwordIsMatched = await user.comparePassword(password);
      } catch (modelError) {
        passwordIsMatched = await bcrypt.compare(
          password,
          userData.password_hash
        );
      }

      if (passwordIsMatched) {
        user.updateLastLogin();

        const isSuperAdmin = user.role_id === 5;

        // Generate JWT tokens (access + refresh)
        const { accessToken } = generateUserTokens(
          {
            id: user.id!,
            email: email,
            roleName: (userData as any).role_name || (isSuperAdmin ? 'SuperAdmin' : ''),
            organizationId: isSuperAdmin ? null : (userData as any).organization_id,
          },
          res
        );

        if (isSuperAdmin) {
          logStructured(
            "successful",
            `super-admin login successful for ${email}`,
            "loginUser",
            "user.ctrl.ts"
          );

          return res.status(202).json(
            STATUS_CODE[202]({
              token: accessToken,
              isSuperAdmin: true,
            })
          );
        }

        // Get organization onboarding status for setup modal
        const orgId = (userData as any).organization_id;
        let onboardingStatus = 'completed';
        let isOrgCreator = false;

        if (orgId) {
          // Get organization onboarding status
          const [orgResult] = await sequelize.query(
            `SELECT onboarding_status FROM organizations WHERE id = :orgId`,
            { replacements: { orgId }, type: 'SELECT' as any }
          );
          if (orgResult && (orgResult as any).onboarding_status) {
            onboardingStatus = (orgResult as any).onboarding_status;
          }

          // Check if user is the org creator (first admin by creation date)
          const [creatorResult] = await sequelize.query(
            `SELECT id FROM users
             WHERE organization_id = :orgId AND role_id = 1
             ORDER BY created_at ASC LIMIT 1`,
            { replacements: { orgId }, type: 'SELECT' as any }
          );
          if (creatorResult && (creatorResult as any).id === user.id) {
            isOrgCreator = true;
          }
        }

        logStructured(
          "successful",
          `login successful for ${email}`,
          "loginUser",
          "user.ctrl.ts"
        );

        return res.status(202).json(
          STATUS_CODE[202]({
            token: accessToken,
            onboarding_status: onboardingStatus,
            is_org_creator: isOrgCreator,
          })
        );
      } else {
        logStructured(
          "error",
          `invalid credentials for ${email}`,
          "loginUser",
          "user.ctrl.ts"
        );
        return res
          .status(401)
          .json(STATUS_CODE[401]("Invalid email or password"));
      }
    }

    logStructured(
      "error",
      `invalid credentials for ${email}`,
      "loginUser",
      "user.ctrl.ts"
    );
    return res.status(401).json(STATUS_CODE[401]("Invalid email or password"));
  } catch (error) {
    logStructured(
      "error",
      `unexpected error during login: ${email}`,
      "loginUser",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in loginUser:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Generates a new access token using a valid refresh token
 *
 * Implements secure token refresh flow to obtain new access tokens without
 * requiring re-authentication. Validates refresh token from HTTP-only cookie
 * and issues new access token if valid.
 *
 * @async
 * @param {Request} req - Express request with refresh_token in cookies
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} New access token or error status
 *
 * @security
 * - Refresh token retrieved from HTTP-only cookie
 * - Token signature verification using JWT secret
 * - Expiration validation before issuing new token
 * - Prevents token reuse after expiration
 * - Failed attempts logged for security monitoring
 *
 * @example
 * POST /api/users/refresh-token
 * Cookie: refresh_token=<refresh_token>
 *
 * Response 200:
 * {
 *   "code": 200,
 *   "data": {
 *     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * }
 */
async function refreshAccessToken(req: Request, res: Response): Promise<any> {
  logStructured(
    "processing",
    "attempting token refresh",
    "refreshAccessToken",
    "user.ctrl.ts"
  );
  logger.debug("🔁 Refresh token requested");

  try {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
      logStructured(
        "error",
        "missing refresh token",
        "refreshAccessToken",
        "user.ctrl.ts"
      );
      return res
        .status(400)
        .json(STATUS_CODE[400]("Refresh token is required"));
    }

    const decoded = getRefreshTokenPayload(refreshToken);

    if (!decoded) {
      logStructured(
        "error",
        "invalid refresh token",
        "refreshAccessToken",
        "user.ctrl.ts"
      );
      return res.status(401).json(STATUS_CODE[401]("Invalid refresh token"));
    }

    if (decoded.expire < Date.now()) {
      logStructured(
        "error",
        "refresh token expired",
        "refreshAccessToken",
        "user.ctrl.ts"
      );
      return res
        .status(406)
        .json(STATUS_CODE[406]({ message: "Token expired" }));
    }

    const newAccessToken = generateToken({
      id: decoded.id,
      email: decoded.email,
      roleName: decoded.roleName,
      tenantId: decoded.tenantId,
      organizationId: decoded.organizationId,
    });

    logStructured(
      "successful",
      `token refreshed for ${decoded.email}`,
      "refreshAccessToken",
      "user.ctrl.ts"
    );

    return res.status(200).json(
      STATUS_CODE[200]({
        token: newAccessToken,
      })
    );
  } catch (error) {
    logStructured(
      "error",
      "unexpected error during token refresh",
      "refreshAccessToken",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in refreshAccessToken:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function resetPassword(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { email, newPassword } = req.body;

  logStructured(
    "processing",
    `resetting password for ${email}`,
    "resetPassword",
    "user.ctrl.ts"
  );
  logger.debug(`🔁 Password reset requested for ${email}`);

  try {
    const _user = (await getUserByEmailQuery(email)) as UserModel & {
      role_name: string;
    };
    const user = await UserModel.createNewUser(
      _user.name,
      _user.surname,
      _user.email,
      _user.password_hash,
      _user.role_id,
      _user.organization_id!
    );

    if (user) {
      await user.updatePassword(newPassword);

      const updatedUser = (await resetPasswordQuery(
        email,
        user.password_hash,
        transaction
      )) as UserModel;

      await transaction.commit();
      logStructured(
        "successful",
        `password reset for ${email}`,
        "resetPassword",
        "user.ctrl.ts"
      );
      await logEvent("Update", `Password reset for user: ${email}`, req.userId!, req.organizationId!);

      return res.status(202).json(STATUS_CODE[202](updatedUser.toSafeJSON()));
    }

    logStructured(
      "error",
      `user not found: ${email}`,
      "resetPassword",
      "user.ctrl.ts"
    );
    await logEvent("Error", `Password reset failed — user not found: ${email}`, req.userId!, req.organizationId!);
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404]("User not found"));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "resetPassword",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Validation error during password reset: ${error.message}`,
        req.userId!, req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "resetPassword",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Business logic error during password reset: ${error.message}`,
        req.userId!, req.organizationId!
      );
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured(
      "error",
      `unexpected error for ${email}`,
      "resetPassword",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during password reset for ${email}: ${(error as Error).message}`,
      req.userId!, req.organizationId!
    );
    logger.error("❌ Error in resetPassword:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function updateUserById(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { name, surname, email, roleId: roleIdRaw, last_login } = req.body;

  // Convert roleId to number if it exists (frontend may send as string)
  const roleId = roleIdRaw ? parseInt(roleIdRaw) : undefined;

  logStructured(
    "processing",
    `updating user ID ${id}`,
    "updateUserById",
    "user.ctrl.ts"
  );

  try {
    // Check permissions (if user context is available)
    const currentUserId = (req as any).user?.id;
    const user = await getUserByIdQuery(id);

    if (user.organization_id !== req.organizationId) {
      logStructured(
        "error",
        `access denied to user ID ${id}`,
        "updateUserById",
        "user.ctrl.ts"
      );
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403]("Forbidden: Access to this user is denied"));
    }

    if (user) {
      // Capture the old role before updating (if roleId is being changed)
      const oldRoleId = user.role_id;

      await user.updateCurrentUser({ name, surname, email });
      await user.validateUserData();

      const updatedUser = (await updateUserByIdQuery(
        id,
        {
          name: user.name,
          surname: user.surname,
          last_login: last_login ?? user.last_login,
          role_id: roleId ?? user.role_id,
        },
        transaction
      )) as UserModel;

      await transaction.commit();

      const actor = await getUserByIdQuery(req.userId!);
      const role = await getRoleByIdQuery(updatedUser.role_id);

      await sendSlackNotification(
        {
          userId: actor.id!,
          routingType: SlackNotificationRoutingType.MEMBERSHIP_AND_ROLES,
        },
        {
          title: `Membership update`,
          message: `${updatedUser.name} ${updatedUser.surname} is now *Project ${role?.name}* (added by ${actor.name} ${actor.surname}).`,
        }
      );

      logStructured(
        "successful",
        `user updated: ID ${id}`,
        "updateUserById",
        "user.ctrl.ts"
      );
      await logEvent(
        "Update",
        `User updated: ID ${id}, email: ${updatedUser.email}`,
        req.userId!,
        req.organizationId!
      );

      // Convert to numbers explicitly for comparison
      const oldRoleIdNum = Number(oldRoleId);
      const newRoleIdNum = Number(roleId);

      if (newRoleIdNum === 1 && oldRoleIdNum === 3) {
        // Get all projects where the user is a member
        try {
          const userProjects = await getUserProjects(id, req.organizationId!);

          // Send notification for each project (fire-and-forget)
          for (const project of userProjects) {
            sendMemberRoleChangedEditorToAdminNotification({
              projectId: project.id!,
              projectName: project.project_title,
              actorId: currentUserId || id, // Use currentUserId if available, otherwise use the user's own id
              userId: id,
              organizationId: req.organizationId!,
            }).catch(async (emailError) => {
              await logFailure({
                eventType: "Update",
                description: `Failed to send role changed notification for project ${project.id} to user ${id}`,
                functionName: "updateUserById",
                fileName: "user.ctrl.ts",
                error: emailError as Error,
                userId: req.userId!,
                tenantId: req.organizationId!,
              });
            });
          }
        } catch (projectError) {
          // Log error but don't fail the user update
          await logFailure({
            eventType: "Update",
            description: `Failed to fetch user projects for role change notification: user ${id}`,
            functionName: "updateUserById",
            fileName: "user.ctrl.ts",
            error: projectError as Error,
            userId: req.userId!,
            tenantId: req.organizationId!,
          });
        }
      }

      return res.status(202).json(STATUS_CODE[202](updatedUser.toSafeJSON()));
    }

    logStructured(
      "error",
      `user not found: ID ${id}`,
      "updateUserById",
      "user.ctrl.ts"
    );
    await logEvent("Error", `Update failed — user not found: ID ${id}`, req.userId!, req.organizationId!);
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404]("User not found"));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "updateUserById",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Validation error during update: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "updateUserById",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Business logic error during update: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured(
      "error",
      `unexpected error for user ID ${id}`,
      "updateUserById",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during update for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in updateUserById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function deleteUserById(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `attempting to delete user ID ${id}`,
    "deleteUserById",
    "user.ctrl.ts"
  );
  logger.debug(`🗑️ Delete request for user ID ${id}`);

  try {
    const user = await getUserByIdQuery(id);

    // Prevent deletion of super-admin user
    if (user && user.role_id === 5) {
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403]("Super-admin user cannot be deleted"));
    }

    if (user.organization_id !== req.organizationId) {
      logStructured(
        "error",
        `access denied to user ID ${id}`,
        "deleteUserById",
        "user.ctrl.ts"
      );
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403]("Forbidden: Access to this user is denied"));
    }

    if (user) {
      if (user.isDemoUser()) {
        logStructured(
          "error",
          `attempted to delete demo user ID ${id}`,
          "deleteUserById",
          "user.ctrl.ts"
        );
        await logEvent("Error", `Blocked deletion of demo user ID ${id}`, req.userId!, req.organizationId!);
        await transaction.rollback();
        return res
          .status(403)
          .json(STATUS_CODE[403]("Demo users cannot be deleted. Remove demo data from Management > Delete demo data"));
      }

      const deletedUser = await deleteUserByIdQuery(
        id,
        req.organizationId!,
        transaction
      );
      await transaction.commit();

      logStructured(
        "successful",
        `user deleted: ID ${id}`,
        "deleteUserById",
        "user.ctrl.ts"
      );
      await logEvent("Delete", `User deleted: ID ${id}, email: ${user.email}`, req.userId!, req.organizationId!);

      return res.status(202).json(STATUS_CODE[202](deletedUser));
    }

    logStructured(
      "error",
      `user not found: ID ${id}`,
      "deleteUserById",
      "user.ctrl.ts"
    );
    await logEvent("Error", `Delete failed — user not found: ID ${id}`, req.userId!, req.organizationId!);
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404]("User not found"));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error deleting user ID ${id}`,
      "deleteUserById",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during delete for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in deleteUserById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Checks if any user exists in the database.
 *
 * @param {Request} _req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {Promise<Response>} A promise that resolves when the response is sent.
 */
async function checkUserExists(
  _req: Request,
  res: Response
): Promise<Response> {
  logStructured(
    "processing",
    "checking if any user exists",
    "checkUserExists",
    "user.ctrl.ts"
  );
  logger.debug("🔍 Checking for existing users");

  try {
    const userExists = await checkUserExistsQuery();

    logStructured(
      "successful",
      `user existence check: ${userExists}`,
      "checkUserExists",
      "user.ctrl.ts"
    );

    return res.status(200).json(userExists);
  } catch (error) {
    logStructured(
      "error",
      "failed to check user existence",
      "checkUserExists",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in checkUserExists:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function calculateProgress(
  req: Request,
  res: Response
): Promise<Response> {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logStructured(
    "processing",
    `calculating progress for user ID ${id}`,
    "calculateProgress",
    "user.ctrl.ts"
  );
  logger.debug(`📊 Starting progress calculation for user ID ${id}`);

  try {
    const userProjects = await getUserProjects(id, req.organizationId!);

    let assessmentsMetadata = [];
    let allTotalAssessments = 0;
    let allDoneAssessments = 0;

    let controlsMetadata = [];
    let allTotalSubControls = 0;
    let allDoneSubControls = 0;

    for (const userProject of userProjects) {
      let totalSubControls = 0;
      let doneSubControls = 0;
      const controlcategories = await getControlCategoriesForProject(
        userProject.id!
      );
      for (const controlcategory of controlcategories) {
        const controls = await getControlForControlCategory(
          controlcategory.id!
        );
        for (const control of controls) {
          const subControls = await getSubControlForControl(control.id!);
          for (const subControl of subControls) {
            totalSubControls++;
            if (subControl.status === "Done") {
              doneSubControls++;
            }
          }
        }
      }
      allTotalSubControls += totalSubControls;
      allDoneSubControls += doneSubControls;
      controlsMetadata.push({
        projectId: userProject.id,
        totalSubControls,
        doneSubControls,
      });

      let totalAssessments = 0;
      let doneAssessments = 0;
      const assessments = await getAssessmentsForProject(userProject.id!);
      for (const assessment of assessments) {
        const topics = await getTopicsForAssessment(assessment.id!);
        for (const topic of topics) {
          const subTopics = await getSubTopicsForTopic(topic.id!);
          for (const subTopic of subTopics) {
            const questions = await getQuestionsForSubTopic(subTopic.id!);
            for (const question of questions) {
              totalAssessments++;
              if (question.answer) {
                doneAssessments++;
              }
            }
          }
        }
      }
      allTotalAssessments += totalAssessments;
      allDoneAssessments += doneAssessments;
      assessmentsMetadata.push({
        projectId: userProject.id,
        totalAssessments,
        doneAssessments,
      });
    }

    logStructured(
      "successful",
      `progress calculated for user ID ${id}`,
      "calculateProgress",
      "user.ctrl.ts"
    );

    return res.status(200).json({
      assessmentsMetadata,
      controlsMetadata,
      allTotalAssessments,
      allDoneAssessments,
      allTotalSubControls,
      allDoneSubControls,
    });
  } catch (error) {
    logStructured(
      "error",
      `failed to calculate progress for user ID ${id}`,
      "calculateProgress",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in calculateProgress:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function ChangePassword(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { id, currentPassword, newPassword } = req.body;

  logStructured(
    "processing",
    `attempting password change for user ID ${id}`,
    "ChangePassword",
    "user.ctrl.ts"
  );
  logger.debug(`🔐 Password change requested for user ID ${id}`);

  try {
    const user = await getUserByIdQuery(id);

    if (!user) {
      logStructured(
        "error",
        `user not found: ID ${id}`,
        "ChangePassword",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Password change failed — user not found: ID ${id}`,
        req.userId!,
        req.organizationId!
      );
      await transaction.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    await user.updatePassword(newPassword, currentPassword);

    const updatedUser = (await resetPasswordQuery(
      user.email,
      user.password_hash,
      transaction
    )) as UserModel;

    await transaction.commit();
    logStructured(
      "successful",
      `password changed for user ID ${id}`,
      "ChangePassword",
      "user.ctrl.ts"
    );
    await logEvent("Update", `Password changed for user ID ${id}`, req.userId!, req.organizationId!);

    return res.status(202).json({
      message: "Password updated successfully",
      data: updatedUser.toSafeJSON(),
    });
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "ChangePassword",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Validation error during password change: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json({ message: error.message });
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "ChangePassword",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Business logic error during password change: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(403).json({ message: error.message });
    }

    logStructured(
      "error",
      `unexpected error for user ID ${id}`,
      "ChangePassword",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during password change for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in ChangePassword:", error);
    return res.status(500).json({ message: (error as Error).message });
  }
}

// New function to update user role
async function updateUserRole(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { newRoleId: newRoleIdRaw } = req.body;

  // Normalize newRoleId from the request payload (frontend may send as string)
  const newRoleId =
    typeof newRoleIdRaw === "string"
      ? parseInt(newRoleIdRaw, 10)
      : newRoleIdRaw;

  const currentUserId = (req as any).user?.id;

  logStructured(
    "processing",
    `updating role for user ID ${id}`,
    "updateUserRole",
    "user.ctrl.ts"
  );
  logger.debug(
    `🔧 Role update requested for user ID ${id} by admin ID ${currentUserId}`
  );

  try {
    // Prevent role escalation to SuperAdmin
    if (newRoleId === 5) {
      await transaction.rollback();
      return res.status(403).json({ message: "Cannot assign SuperAdmin role" });
    }

    const targetUser = await getUserByIdQuery(parseInt(id));
    if (!targetUser) {
      logStructured(
        "error",
        `target user not found: ID ${id}`,
        "updateUserRole",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Role update failed — target user not found: ID ${id}`,
        req.userId!,
        req.organizationId!
      );
      await transaction.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent changing super-admin's role
    if (targetUser.role_id === 5) {
      await transaction.rollback();
      return res.status(403).json({ message: "Cannot modify SuperAdmin role" });
    }

    const currentUser = await getUserByIdQuery(currentUserId);
    if (!currentUser) {
      logStructured(
        "error",
        `admin user not found: ID ${currentUserId}`,
        "updateUserRole",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Role update failed — admin user not found: ID ${currentUserId}`,
        req.userId!,
        req.organizationId!
      );
      await transaction.rollback();
      return res.status(404).json({ message: "Current user not found" });
    }

    // Capture the old role before updating
    const oldRoleId = targetUser.role_id;

    await targetUser.updateRole(newRoleId, currentUser);

    const updatedUser = (await updateUserByIdQuery(
      parseInt(Array.isArray(id) ? id[0] : id),
      { role_id: targetUser.role_id },
      transaction
    )) as UserModel;

    await transaction.commit();
    logStructured(
      "successful",
      `role updated for user ID ${id}`,
      "updateUserRole",
      "user.ctrl.ts"
    );
    await logEvent(
      "Update",
      `User role updated: ID ${id}, new role ID: ${newRoleId}, by admin ID: ${currentUserId}`,
      req.userId!,
      req.organizationId!
    );

    // Send email notifications for role change from Editor (3) to Admin (1)
    if (oldRoleId === 3 && newRoleId === 1) {
      // Get all projects where the user is a member
      try {
        const userProjects = await getUserProjects(parseInt(Array.isArray(id) ? id[0] : id), req.organizationId!);

        // Send notification for each project (fire-and-forget)
        for (const project of userProjects) {
          sendMemberRoleChangedEditorToAdminNotification({
            projectId: project.id!,
            projectName: project.project_title,
            actorId: currentUserId,
            userId: parseInt(id),
            organizationId: req.organizationId!
          }).catch(async (emailError) => {
            await logFailure({
              eventType: "Update",
              description: `Failed to send role changed notification for project ${project.id} to user ${id}`,
              functionName: "updateUserRole",
              fileName: "user.ctrl.ts",
              error: emailError as Error,
              userId: req.userId!,
              tenantId: req.organizationId!,
            });
          });
        }
      } catch (projectError) {
        // Log error but don't fail the role update
        await logFailure({
          eventType: "Update",
          description: `Failed to fetch user projects for role change notification: user ${id}`,
          functionName: "updateUserRole",
          fileName: "user.ctrl.ts",
          error: projectError as Error,
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
      }
    }

    return res.status(202).json({
      message: "User role updated successfully",
      data: updatedUser.toSafeJSON(),
    });
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "updateUserRole",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Validation error during role update: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json({ message: error.message });
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "updateUserRole",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Business logic error during role update: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(403).json({ message: error.message });
    }

    logStructured(
      "error",
      `unexpected error for user ID ${id}`,
      "updateUserRole",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error during role update for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in updateUserRole:", error);
    return res.status(500).json({ message: (error as Error).message });
  }
}

async function uploadUserProfilePhoto(req: any, res: Response) {
  const transaction = await sequelize.transaction();
  const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const attachment = req.file;

  logStructured(
    "processing",
    `uploading profile photo for user ID ${userId}`,
    "uploadUserProfilePhoto",
    "user.ctrl.ts"
  );
  logger.debug(`📸 Uploading profile photo for user ID ${userId}`);

  try {
    const user = await getUserByIdQuery(userId);
    if (user.organization_id !== req.organizationId) {
      logStructured(
        "error",
        `access denied to user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts"
      );
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403]("Forbidden: Access to this user is denied"));
    }

    if (!attachment) {
      await transaction.rollback();
      logStructured(
        "error",
        `no file provided for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts"
      );
      return res.status(400).json(
        STATUS_CODE[400]({
          message: "No file provided",
        })
      );
    }

    // Upload file to tenant-specific files table
    const file = await uploadFile(
      attachment,
      req.userId!,
      null,
      "AI trust center group",
      req.organizationId!,
      transaction
    );
    const fileId = file?.id || undefined;

    if (!fileId) {
      await transaction.rollback();
      logStructured(
        "error",
        `file upload failed for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts"
      );
      return res.status(400).json(
        STATUS_CODE[400]({
          message: "File upload failed",
        })
      );
    }

    // Update user's profile_photo_id
    const upload = await uploadUserProfilePhotoQuery(
      userId,
      fileId,
      req.organizationId!,
      transaction
    );

    if (upload) {
      await transaction.commit();
      logStructured(
        "successful",
        `Profile photo uploaded for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts"
      );
      await logEvent("Create", `Profile photo uploaded for user ID ${userId}`, req.userId!, req.organizationId!);
      return res.status(200).json(
        STATUS_CODE[200]({
          message: "Profile photo uploaded successfully",
          ...upload,
        })
      );
    } else {
      await transaction.rollback();
      logStructured(
        "error",
        `failed to upload profile photo for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Failed to upload profile photo for user ID ${userId}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(500).json(
        STATUS_CODE[500]({
          message: "Failed to upload profile photo",
        })
      );
    }
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error uploading profile photo for user ID ${userId}`,
      "uploadUserProfilePhoto",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error uploading profile photo for user ID ${userId}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in uploadUserProfilePhoto:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function getUserProfilePhoto(req: Request, res: Response) {
  const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logStructured(
    "processing",
    `fetching profile photo for user ID ${userId}`,
    "getUserProfilePhoto",
    "user.ctrl.ts"
  );
  logger.debug(`📸 Fetching profile photo for user ID ${userId}`);

  try {
    const user = await getUserByIdQuery(userId);
    if (user.organization_id !== req.organizationId) {
      logStructured(
        "error",
        `access denied to user ID ${userId}`,
        "getUserProfilePhoto",
        "user.ctrl.ts"
      );
      return res
        .status(403)
        .json(STATUS_CODE[403]("Forbidden: Access to this user is denied"));
    }

    const photo = await getUserProfilePhotoQuery(userId, req.organizationId!);

    if (!photo) {
      logStructured(
        "successful",
        `no profile photo for user ID ${userId}`,
        "getUserProfilePhoto",
        "user.ctrl.ts"
      );
      return res.status(200).json(
        STATUS_CODE[200]({
          message: "No profile photo",
          photo: null,
        })
      );
    }

    logStructured(
      "successful",
      `profile photo retrieved for user ID ${userId}`,
      "getUserProfilePhoto",
      "user.ctrl.ts"
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        message: "Profile photo retrieved successfully",
        photo,
      })
    );
  } catch (error) {
    logStructured(
      "error",
      `failed to retrieve profile photo for user ID ${userId}`,
      "getUserProfilePhoto",
      "user.ctrl.ts"
    );
    logger.error("❌ Error in getUserProfilePhoto:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function deleteUserProfilePhoto(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `deleting profile photo for user ID ${userId}`,
    "deleteUserProfilePhoto",
    "user.ctrl.ts"
  );
  logger.debug(`🗑️ Deleting profile photo for user ID ${userId}`);

  try {
    const user = await getUserByIdQuery(userId);
    if (user.organization_id !== req.organizationId) {
      logStructured(
        "error",
        `access denied to user ID ${userId}`,
        "deleteUserProfilePhoto",
        "user.ctrl.ts"
      );
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403]("Forbidden: Access to this user is denied"));
    }

    const isDeleted = await deleteUserProfilePhotoQuery(
      userId,
      req.organizationId!,
      transaction
    );

    if (isDeleted) {
      await transaction.commit();
      logStructured(
        "successful",
        `profile photo deleted for user ID ${userId}`,
        "deleteUserProfilePhoto",
        "user.ctrl.ts"
      );
      await logEvent("Delete", `Profile photo deleted for user ID ${userId}`, req.userId!, req.organizationId!);
      return res.status(200).json(
        STATUS_CODE[200]({
          message: "Profile photo deleted successfully",
        })
      );
    } else {
      await transaction.rollback();
      logStructured(
        "error",
        `failed to delete profile photo for user ID ${userId}`,
        "deleteUserProfilePhoto",
        "user.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Failed to delete profile photo for user ID ${userId}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(500).json(
        STATUS_CODE[500]({
          message: "Failed to delete profile photo",
        })
      );
    }
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error deleting profile photo for user ID ${userId}`,
      "deleteUserProfilePhoto",
      "user.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error deleting profile photo for user ID ${userId}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in deleteUserProfilePhoto:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export {
  getAllUsers,
  getUserByEmail,
  getUserById,
  createNewUserWrapper,
  createNewUser,
  loginUser,
  resetPassword,
  updateUserById,
  deleteUserById,
  checkUserExists,
  calculateProgress,
  ChangePassword,
  refreshAccessToken,
  updateUserRole,
  uploadUserProfilePhoto,
  getUserProfilePhoto,
  deleteUserProfilePhoto,
};
