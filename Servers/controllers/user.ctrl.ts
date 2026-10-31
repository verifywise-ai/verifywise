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
  isLastAdminQuery,
  removeUserFromOrganizationQuery,
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
import {
  generateOrganizationSelectionToken,
  getRefreshTokenPayload,
  getTokenPayload,
} from "../utils/jwt.utils";
import { UserModel } from "../domain.layer/models/user/user.model";
import { numberValidation } from "../domain.layer/validations/number.valid";
import { sequelize } from "../database/db";
import {
  ValidationException,
  BusinessLogicException,
  ConflictException,
} from "../domain.layer/exceptions/custom.exception";
import { ForeignKeyConstraintError, Transaction, UniqueConstraintError } from "sequelize";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";
import { generateUserTokens } from "../utils/auth.utils";
import { CSRF_COOKIE_NAME } from "../middleware/csrf.middleware";
import {
  findRefreshToken,
  revokeAllUserTokens,
  revokeRefreshTokenByHash,
  revokeTokenFamily,
} from "../utils/refreshToken.utils";
import { sendSlackNotification } from "../services/slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../domain.layer/enums/slack.enum";
import { getRoleByIdQuery } from "../utils/role.utils";
import { getRoleNameById } from "../utils/roleMap";
import { uploadFile } from "../utils/fileUpload.utils";
import { getPendingInvitationQuery, markInvitationAcceptedQuery } from "../utils/invitation.utils";
import { ConfidentialClientApplication } from "@azure/msal-node";
import {
  getAzureADConfigForLoginQuery,
  isAzureADLoginEnabledQuery,
  isSSOFeatureEnabled,
} from "../utils/ssoConfig.utils";

import { translateError } from "../utils/i18n.utils";
import {
  createNewUserPreferencesQuery,
  getPreferencesByUserQuery,
  updateUserPreferencesByIdQuery,
} from "../utils/userPreference.utils";
import { isUserSuperAdmin as isUserSuperAdminUtil } from "../utils/superAdmin.utils";
import {
  addOrganizationMemberQuery,
  getUserOrganizationsQuery,
  updateOrganizationMemberRoleQuery,
  UserOrganization,
} from "../utils/organizationMember.utils";
import { UserDateFormat } from "../domain.layer/enums/user-preferences.enum";
import { UserPreferencesModel } from "../domain.layer/models/userPreferences/userPreferences.model";
import { UserLanguage } from "../domain.layer/interfaces/i.userPreferences";
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
/**
 * Retrieves the currently authenticated user's preferences.
 *
 * Returns persisted date_format, language, and parallel_agents from
 * `user_preferences`. If no preferences row exists yet, returns safe defaults
 * so the client can hydrate without an error.
 *
 * @async
 * @param {Request} req - Express request with userId from JWT middleware
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} User preferences or defaults
 */
async function getPreferencesForCurrentUser(req: Request, res: Response): Promise<any> {
  logStructured(
    "processing",
    "starting getPreferencesForCurrentUser",
    "getPreferencesForCurrentUser",
    "user.ctrl.ts",
  );

  try {
    const user = (await getUserByIdQuery(req.userId!)) as UserModel;
    if (!user) {
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    const userPreference = await getPreferencesByUserQuery(req.userId!);
    if (userPreference) {
      logStructured(
        "successful",
        `Preferences found for user ${req.userId}`,
        "getPreferencesForCurrentUser",
        "user.ctrl.ts",
      );
      const preferences = userPreference.toJSON();
      return res.status(200).json(
        STATUS_CODE[200]({
          ...preferences,
          parallel_agents: preferences.parallel_agents ?? false,
        }),
      );
    }

    logStructured(
      "successful",
      `No preferences found for user ${req.userId}, returning defaults`,
      "getPreferencesForCurrentUser",
      "user.ctrl.ts",
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        date_format: UserDateFormat.DD_MM_YYYY_DASH,
        language: "en",
        theme: "light",
        parallel_agents: false,
      }),
    );
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve current user preferences",
      "getPreferencesForCurrentUser",
      "user.ctrl.ts",
    );
    logger.error("❌ Error in getPreferencesForCurrentUser:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Upserts the currently authenticated user's preferences.
 *
 * Persists `date_format`, `language`, and/or `parallel_agents` for
 * `req.userId`. Any `user_id` in the body is ignored so callers cannot write
 * another user's preferences. Creates a row when none exists; updates the
 * existing row otherwise.
 *
 * @async
 * @param {Request} req - Express request with userId from JWT middleware
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Saved preferences or a validation error
 */
async function patchPreferencesForCurrentUser(req: Request, res: Response): Promise<any> {
  const functionName = "patchPreferencesForCurrentUser";
  logStructured(
    "processing",
    "starting patchPreferencesForCurrentUser",
    functionName,
    "user.ctrl.ts",
  );

  const dateFormat = req.body?.date_format as UserDateFormat | undefined;
  const language = req.body?.language as UserLanguage | undefined;
  const hasParallelAgents = Object.prototype.hasOwnProperty.call(req.body ?? {}, "parallel_agents");
  const parallelAgents = hasParallelAgents
    ? (req.body.parallel_agents as boolean | undefined)
    : undefined;

  if (dateFormat === undefined && language === undefined && !hasParallelAgents) {
    logStructured(
      "error",
      "missing date_format, language, and parallel_agents in request body",
      functionName,
      "user.ctrl.ts",
    );
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          req.t!("At least one of date_format, language, or parallel_agents is required"),
        ),
      );
  }

  const transaction = await sequelize.transaction();

  try {
    const user = (await getUserByIdQuery(req.userId!)) as UserModel;
    if (!user) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    const userId = req.userId!;
    const existing = await getPreferencesByUserQuery(userId);
    let saved: UserPreferencesModel;

    if (!existing) {
      saved = await UserPreferencesModel.createNewUserPreferences(
        userId,
        dateFormat ?? UserDateFormat.DD_MM_YYYY_DASH,
        language,
        parallelAgents,
      );
      await createNewUserPreferencesQuery(saved, transaction);
    } else {
      saved = new UserPreferencesModel(existing);
      await saved.updateUserPreferences({
        date_format: dateFormat,
        language,
        parallel_agents: parallelAgents,
      });
      await updateUserPreferencesByIdQuery(userId, saved, transaction);
    }

    await transaction.commit();

    logStructured(
      "successful",
      `Preferences upserted for user ${userId}`,
      functionName,
      "user.ctrl.ts",
    );
    await logEvent(
      existing ? "Update" : "Create",
      `User preferences ${existing ? "updated" : "created"} for user ${userId}`,
      userId,
      req.organizationId!,
    );

    return res.status(200).json(
      STATUS_CODE[200]({
        ...saved.toJSON(),
        date_format: saved.date_format,
        language: saved.language,
        parallel_agents: saved.parallel_agents ?? false,
      }),
    );
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured("error", `validation failed: ${error.message}`, functionName, "user.ctrl.ts");
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    logStructured(
      "error",
      "failed to upsert current user preferences",
      functionName,
      "user.ctrl.ts",
    );
    logger.error("❌ Error in patchPreferencesForCurrentUser:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function getAllUsers(req: Request, res: Response): Promise<any> {
  logStructured("processing", "starting getAllUsers", "getAllUsers", "user.ctrl.ts");
  logger.debug("🔍 Fetching all users");

  try {
    const users = (await getAllUsersQuery(req.organizationId!)) as UserModel[];

    if (users && users.length > 0) {
      logStructured("successful", `found ${users.length} users`, "getAllUsers", "user.ctrl.ts");
      return res.status(200).json(STATUS_CODE[200](users.map((user) => user.toSafeJSON())));
    }

    logStructured("successful", "no users found", "getAllUsers", "user.ctrl.ts");
    return res.status(204).json(STATUS_CODE[204](users));
  } catch (error) {
    logStructured("error", "failed to retrieve users", "getAllUsers", "user.ctrl.ts");
    logger.error("❌ Error in getAllUsers:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function getUserByEmail(req: Request, res: Response) {
  const email = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
  logStructured("processing", `fetching user by email: ${email}`, "getUserByEmail", "user.ctrl.ts");
  logger.debug(`🔍 Looking up user with email: ${email}`);

  try {
    const user = (await getUserByEmailQuery(email)) as UserModel & {
      role_name: string;
    };

    if (user) {
      logStructured("successful", `user found: ${email}`, "getUserByEmail", "user.ctrl.ts");
      return res.status(200).json(STATUS_CODE[200](user.toSafeJSON()));
    }

    logStructured("successful", `no user found: ${email}`, "getUserByEmail", "user.ctrl.ts");
    return res.status(404).json(STATUS_CODE[404](user));
  } catch (error) {
    logStructured("error", `failed to fetch user: ${email}`, "getUserByEmail", "user.ctrl.ts");
    logger.error("❌ Error in getUserByEmail:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function getUserById(req: Request, res: Response) {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logStructured("processing", `fetching user by ID: ${id}`, "getUserById", "user.ctrl.ts");
  logger.debug(`🔍 Looking up user with ID: ${id}`);

  try {
    // A user in another organization answers like a missing one, so the
    // endpoint does not reveal which user ids exist. A pure SuperAdmin (no
    // organization) can only look themselves up.
    const user =
      req.organizationId !== undefined
        ? await getUserByIdQuery(id, null, req.organizationId)
        : id === req.userId
          ? await getUserByIdQuery(id)
          : null;
    if (!user) {
      logStructured("successful", `no user found: ID ${id}`, "getUserById", "user.ctrl.ts");
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    logStructured("successful", `user found: ID ${id}`, "getUserById", "user.ctrl.ts");
    return res.status(200).json(STATUS_CODE[200](user.toSafeJSON()));
  } catch (error) {
    logStructured("error", `failed to fetch user: ID ${id}`, "getUserById", "user.ctrl.ts");
    logger.error("❌ Error in getUserById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
  transaction: Transaction,
) {
  const { name, surname, email, password, roleId, organizationId } = body;

  // Check if user already exists
  const existingUser = await getUserByEmailQuery(email);
  if (existingUser) {
    throw new ConflictException("User with this email already exists");
  }

  if (!numberValidation(roleId, 1)) {
    throw new ValidationException("Invalid role_id", "role_id", roleId);
  }
  if (!numberValidation(organizationId, 1)) {
    throw new ValidationException("Invalid organization_id", "organization_id", organizationId);
  }

  // Create user using the enhanced UserModel method
  const userModel = await UserModel.createNewUser(name, surname, email, password);

  // Validate user data before saving
  await userModel.validateUserData();

  // Check email uniqueness
  const isEmailUnique = await UserModel.validateEmailUniqueness(email);
  if (!isEmailUnique) {
    throw new ConflictException("Email already exists");
  }

  const user = (await createNewUserQuery(
    userModel,
    { organizationId, roleId },
    transaction,
  )) as UserModel;
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
    "user.ctrl.ts",
  );
  logger.debug(`🛠️ Creating user: ${email}`);

  try {
    // Check for existing user
    const existingUser = await getUserByEmailQuery(email);
    if (existingUser) {
      logStructured("error", `user already exists: ${email}`, "createNewUser", "user.ctrl.ts");
      await logEvent(
        "Error",
        `Attempted to create duplicate user: ${email}`,
        req.userId!,
        req.organizationId!,
      );
      await transaction.rollback();
      return res.status(409).json(STATUS_CODE[409](req.t!("User with this email already exists")));
    }

    if (!numberValidation(roleId, 1)) {
      throw new ValidationException("Invalid role_id", "role_id", roleId);
    }
    if (!numberValidation(organizationId, 1)) {
      throw new ValidationException("Invalid organization_id", "organization_id", organizationId);
    }

    // Create user model with automatic password hashing
    const userModel = await UserModel.createNewUser(name, surname, email, password);
    await userModel.validateUserData();

    // Double-check email uniqueness
    const isEmailUnique = await UserModel.validateEmailUniqueness(email);
    if (!isEmailUnique) {
      logStructured("error", `email not unique: ${email}`, "createNewUser", "user.ctrl.ts");
      await logEvent(
        "Error",
        `Email not unique during creation: ${email}`,
        req.userId!,
        req.organizationId!,
      );
      await transaction.rollback();
      return res.status(409).json(STATUS_CODE[409](req.t!("Email already exists")));
    }

    const user = (await createNewUserQuery(
      userModel,
      { organizationId, roleId },
      transaction,
    )) as UserModel;

    if (user) {
      // In the same transaction: a link works once, so if the invitation
      // cannot be marked accepted the user is not created either. No pending
      // row means it was revoked (or used) after the link was checked.
      const accepted = await markInvitationAcceptedQuery(
        organizationId,
        res.locals.invitation,
        transaction,
      );
      if (accepted === 0) {
        await transaction.rollback();
        return res
          .status(403)
          .json(
            STATUS_CODE[403](
              req.t!(
                "This invitation link is no longer valid. Use the most recent invitation email, or ask your administrator to resend it.",
              ),
            ),
          );
      }
      await transaction.commit();

      logStructured("successful", `user created: ${email}`, "createNewUser", "user.ctrl.ts");
      await logEvent("Create", `User created: ${email}`, req.userId!, req.organizationId!);
      return res.status(201).json(STATUS_CODE[201](user.toSafeJSON()));
    }

    logStructured("error", `failed to create user: ${email}`, "createNewUser", "user.ctrl.ts");
    await logEvent("Error", `User creation failed: ${email}`, req.userId!, req.organizationId!);
    await transaction.rollback();
    return res.status(400).json(STATUS_CODE[400](req.t!("Failed to create user")));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ConflictException) {
      return res.status(409).json(STATUS_CODE[409](translateError(req, error)));
    }

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation failed: ${error.message}`,
        "createNewUser",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Validation error during user creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "createNewUser",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Business logic error during user creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logStructured("error", `unexpected error: ${email}`, "createNewUser", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Unexpected error during user creation: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in createNewUser:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Accepts an invitation as a user who already has an account: they confirm
 * it is theirs with their own password, join the inviting organization with
 * the invited role, and are logged in to it. The account itself is not
 * changed. registerJWT has checked the link and set the invited email, role
 * and organization on the body.
 *
 * @example
 * POST /api/users/invitations/accept
 * Authorization: Bearer <invite token>
 * { "email": "priya@x.io", "password": "...", "roleId": 3, "organizationId": 4 }
 *
 * Response 202: the same body as a single-organization login.
 */
async function acceptInvitationAsExistingUser(req: Request, res: Response): Promise<any> {
  const { email, password, roleId, organizationId } = req.body;
  const orgId = Number(organizationId);

  try {
    const user = await getUserByEmailQuery(email);
    const organizations = user ? await getUserOrganizationsQuery(user.id!) : [];
    // An account without a password signs in only through SSO, and accepts
    // the invitation there (loginUserWithMicrosoft). The link has already
    // proven the address, so saying so reveals nothing to its holder. A pure
    // super admin is refused below either way.
    if (user && !user.password_hash && organizations.length > 0) {
      const message = (await isAzureADLoginEnabledQuery(orgId))
        ? req.t!(
            "This account signs in with Microsoft. Sign in with Microsoft on this organization's login page to join it.",
          )
        : req.t!(
            "This account signs in with Microsoft, and this organization has no Microsoft sign-in. Ask its administrator to add you.",
          );
      return res.status(409).json(STATUS_CODE[409](message));
    }
    // The same answer for an unknown address and a wrong password.
    const passwordIsMatched =
      !!user?.password_hash && (await bcrypt.compare(String(password ?? ""), user.password_hash));
    if (!user || !passwordIsMatched) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid email or password")));
    }

    // A pure SuperAdmin never joins an organization: that, and their account
    // never being deletable, keeps at least one SuperAdmin on the deployment.
    if (organizations.length === 0) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("A super admin cannot join an organization")));
    }
    if (organizations.some((o) => o.organization_id === orgId)) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("User is already a member of this organization")));
    }

    const transaction = await sequelize.transaction();
    try {
      await addOrganizationMemberQuery(orgId, user.id!, Number(roleId), transaction);
      // A link works once: if the invitation cannot be marked accepted, the
      // membership is not added either.
      const accepted = await markInvitationAcceptedQuery(orgId, res.locals.invitation, transaction);
      if (accepted === 0) {
        await transaction.rollback();
        return res
          .status(403)
          .json(
            STATUS_CODE[403](
              req.t!(
                "This invitation link is no longer valid. Use the most recent invitation email, or ask your administrator to resend it.",
              ),
            ),
          );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      // Two submits at once (a double click): both pass the membership check
      // above, and the second insert hits the primary key once the first
      // commits.
      if (error instanceof UniqueConstraintError) {
        return res
          .status(409)
          .json(STATUS_CODE[409](req.t!("User is already a member of this organization")));
      }
      throw error;
    }

    const joined = (await getUserOrganizationsQuery(user.id!)).find(
      (o) => o.organization_id === orgId,
    )!;
    await logEvent(
      "Create",
      `Existing user ${user.email} joined organization ${orgId}`,
      user.id!,
      orgId,
    );
    return await completeOrganizationLogin(res, user, joined);
  } catch (error) {
    logger.error("❌ Error in acceptInvitationAsExistingUser:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Issues the session for one of the user's organizations: tokens scoped to
 * that organization and role, plus the setup-modal and SuperAdmin flags.
 */
async function completeOrganizationLogin(
  res: Response,
  user: UserModel,
  organization: UserOrganization,
): Promise<Response> {
  const orgId = organization.organization_id;
  const { accessToken } = await generateUserTokens(
    {
      id: user.id!,
      email: user.email,
      roleName: organization.role_name,
      organizationId: orgId,
    },
    res,
  );

  // Get organization onboarding status for setup modal
  let onboardingStatus = "completed";
  const [orgResult] = await sequelize.query(
    `SELECT onboarding_status FROM organizations WHERE id = :orgId`,
    { replacements: { orgId }, type: "SELECT" as any },
  );
  if (orgResult && (orgResult as any).onboarding_status) {
    onboardingStatus = (orgResult as any).onboarding_status;
  }

  // Check if user is the org creator (first Admin to join)
  const [creatorResult] = await sequelize.query(
    `SELECT user_id FROM organization_members
     WHERE organization_id = :orgId AND role_id = 1
     ORDER BY joined_at ASC, user_id ASC LIMIT 1`,
    { replacements: { orgId }, type: "SELECT" as any },
  );
  const isOrgCreator = !!creatorResult && (creatorResult as any).user_id === user.id;

  // Elected SuperAdmin overlay: normal user + row in super_admins.
  const electedSuperAdmin = await isUserSuperAdminUtil(user.id!);

  logStructured(
    "successful",
    `login successful for ${user.email}`,
    "completeOrganizationLogin",
    "user.ctrl.ts",
  );

  return res.status(202).json(
    STATUS_CODE[202]({
      token: accessToken,
      onboarding_status: onboardingStatus,
      is_org_creator: isOrgCreator,
      isSuperAdmin: electedSuperAdmin,
    }),
  );
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
 * Response 202, one organization (or a pure SuperAdmin):
 * {
 *   "code": 202,
 *   "data": {
 *     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * }
 *
 * Response 202, several organizations: no session yet; the client posts the
 * chosen organization to POST /api/users/login/select-organization.
 * {
 *   "code": 202,
 *   "data": {
 *     "requiresOrganizationSelection": true,
 *     "organizations": [{ "id": 4, "name": "Acme", "role_name": "Admin" }],
 *     "selectionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * }
 * Set-Cookie: refresh_token=<token>; Path=/api/users; HttpOnly; Secure (prod); SameSite=none (prod) or lax (dev)
 */
async function loginUser(req: Request, res: Response): Promise<any> {
  const { email, password } = req.body;

  logStructured("processing", `attempting login for ${email}`, "loginUser", "user.ctrl.ts");
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
        passwordIsMatched = await bcrypt.compare(password, userData.password_hash);
      }

      if (passwordIsMatched) {
        user.updateLastLogin();

        const organizations = await getUserOrganizationsQuery(user.id!);

        if (organizations.length === 0) {
          // Pure SuperAdmin: a super_admins row and no membership. Zero
          // memberships alone never means superadmin.
          if (!(await isUserSuperAdminUtil(user.id!))) {
            logStructured(
              "error",
              `login refused, no organization: ${email}`,
              "loginUser",
              "user.ctrl.ts",
            );
            return res
              .status(403)
              .json(STATUS_CODE[403](req.t!("You are not a member of any organization")));
          }

          const { accessToken } = await generateUserTokens(
            { id: user.id!, email, roleName: "SuperAdmin", organizationId: null },
            res,
          );
          logStructured(
            "successful",
            `super-admin login successful for ${email}`,
            "loginUser",
            "user.ctrl.ts",
          );
          return res.status(202).json(
            STATUS_CODE[202]({
              token: accessToken,
              isSuperAdmin: true,
            }),
          );
        }

        if (organizations.length > 1) {
          // The organization is chosen once, here, and fixed for the session.
          logStructured(
            "processing",
            `organization selection required for ${email}`,
            "loginUser",
            "user.ctrl.ts",
          );
          return res.status(202).json(
            STATUS_CODE[202]({
              requiresOrganizationSelection: true,
              organizations: organizations.map((o) => ({
                id: o.organization_id,
                name: o.organization_name,
                role_name: o.role_name,
              })),
              selectionToken: generateOrganizationSelectionToken({ id: user.id!, email }),
            }),
          );
        }

        return await completeOrganizationLogin(res, user, organizations[0]);
      } else {
        logStructured("error", `invalid credentials for ${email}`, "loginUser", "user.ctrl.ts");
        return res.status(401).json(STATUS_CODE[401](req.t!("Invalid email or password")));
      }
    }

    logStructured("error", `invalid credentials for ${email}`, "loginUser", "user.ctrl.ts");
    return res.status(401).json(STATUS_CODE[401](req.t!("Invalid email or password")));
  } catch (error) {
    logStructured("error", `unexpected error during login: ${email}`, "loginUser", "user.ctrl.ts");
    logger.error("❌ Error in loginUser:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Completes a login that needed an organization choice.
 *
 * @example
 * POST /api/users/login/select-organization
 * { "selectionToken": "<from POST /api/users/login>", "organizationId": 4 }
 *
 * Response 202: the same body as a single-organization login.
 */
async function selectLoginOrganization(req: Request, res: Response): Promise<any> {
  const { selectionToken, organizationId } = req.body ?? {};

  try {
    const decoded = getTokenPayload(selectionToken);
    if (!decoded || decoded.type !== "organization_selection" || typeof decoded.id !== "number") {
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid token")));
    }
    if (decoded.expire < Date.now()) {
      return res.status(406).json(STATUS_CODE[406]({ message: req.t!("Token expired") }));
    }

    const user = await getUserByIdQuery(decoded.id);
    if (!user) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid token")));
    }

    const organization = (await getUserOrganizationsQuery(user.id!)).find(
      (o) => o.organization_id === Number(organizationId),
    );
    if (!organization) {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("User does not belong to this organization")));
    }

    return await completeOrganizationLogin(res, user, organization);
  } catch (error) {
    logger.error("❌ Error in selectLoginOrganization:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

const SSO_ROLE_MAP = new Map<string, number>([
  ["Admin", 1],
  ["Reviewer", 2],
  ["Editor", 3],
  ["Auditor", 4],
]);

async function loginUserWithMicrosoft(req: Request, res: Response): Promise<any> {
  if (!isSSOFeatureEnabled()) {
    return res.status(404).json(STATUS_CODE[404]("SSO feature is not enabled"));
  }
  const transaction = await sequelize.transaction();
  const { code, organizationId, redirectUri } = req.body as {
    code?: string;
    organizationId?: number;
    redirectUri?: string;
  };

  logStructured(
    "processing",
    "attempting Microsoft SSO login",
    "loginUserWithMicrosoft",
    "user.ctrl.ts",
  );

  try {
    if (!code) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Authorization code is required"));
    }
    if (!organizationId || isNaN(Number(organizationId))) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("organizationId is required"));
    }
    if (!redirectUri) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("redirectUri is required"));
    }

    const azureADConfig = await getAzureADConfigForLoginQuery(Number(organizationId), transaction);

    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: azureADConfig.client_id,
        authority: `https://login.microsoftonline.com/${azureADConfig.tenant_id}`,
        clientSecret: azureADConfig.client_secret,
      },
    });

    const tokenResponse = await cca.acquireTokenByCode({
      code,
      scopes: ["openid", "profile", "email", "User.Read"],
      redirectUri,
    });
    if (!tokenResponse) {
      await transaction.rollback();
      logStructured(
        "error",
        "failed to acquire token from Microsoft",
        "loginUserWithMicrosoft",
        "user.ctrl.ts",
      );
      return res.status(401).json(STATUS_CODE[401]("Failed to acquire token from Microsoft"));
    }

    const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    });
    if (!userInfoResponse.ok) {
      await transaction.rollback();
      return res
        .status(401)
        .json(STATUS_CODE[401]("Failed to fetch user profile from Microsoft Graph"));
    }
    const userInfo = (await userInfoResponse.json()) as {
      id: string;
      mail?: string;
      userPrincipalName?: string;
      givenName?: string;
      surname?: string;
      displayName?: string;
    };

    const email = userInfo.mail || userInfo.userPrincipalName;
    if (!email) {
      await transaction.rollback();
      return res
        .status(401)
        .json(STATUS_CODE[401]("Microsoft account did not return an email address"));
    }

    const roleClaim = ((tokenResponse.idTokenClaims as Record<string, any>)?.roles ?? [])[0] as
      string | undefined;
    const roleName = roleClaim && SSO_ROLE_MAP.has(roleClaim) ? roleClaim : "Editor";
    const roleId = SSO_ROLE_MAP.get(roleName)!;

    let joinedThroughInvitation = false;
    // The role the session carries: the SSO role, except on a join.
    let sessionRoleName = roleName;
    let user = await getUserByEmailQuery(email);
    if (!user) {
      const userModel = await UserModel.createNewUser(
        userInfo.givenName || userInfo.displayName || "User",
        userInfo.surname || userInfo.givenName || userInfo.displayName || "User",
        email,
        null,
        "AzureAD",
        userInfo.id,
      );
      await userModel.validateUserData?.();
      user = await createNewUserQuery(
        userModel,
        { organizationId: Number(organizationId), roleId },
        transaction,
      );
    } else {
      // An existing account signs in through this organization's SSO only if
      // it is already a member, or joins it with a pending invitation. The
      // address alone does not prove the account: this organization's admins
      // configure its Microsoft tenant and can give any user any address. So
      // only the Microsoft identity the account was created with (SSO only,
      // which has no password to accept with) joins here, never a pure super
      // admin, and with the invited role.
      const organizations = await getUserOrganizationsQuery(user.id!, transaction);
      const membership = organizations.find((o) => o.organization_id === Number(organizationId));
      if (!membership) {
        const refuse = async () => {
          await transaction.rollback();
          return res
            .status(403)
            .json(STATUS_CODE[403]("User does not belong to the selected organization"));
        };
        const sameIdentity =
          user.sso_provider === "AzureAD" && !!user.sso_user_id && user.sso_user_id === userInfo.id;
        if (organizations.length === 0 || !sameIdentity) {
          return await refuse();
        }
        const invitation = await getPendingInvitationQuery(
          Number(organizationId),
          user.email,
          transaction,
        );
        const accepted =
          invitation && invitation.expires_at_ms > Date.now()
            ? await markInvitationAcceptedQuery(
                Number(organizationId),
                {
                  id: invitation.id,
                  roleId: invitation.role_id,
                  expiresAtMs: invitation.expires_at_ms,
                },
                transaction,
              )
            : 0;
        if (accepted > 0) {
          await addOrganizationMemberQuery(
            Number(organizationId),
            user.id!,
            invitation!.role_id,
            transaction,
          );
          joinedThroughInvitation = true;
        }
        // Read back, which also covers a second callback for the same sign-in:
        // it waits on the first one's accept, finds the invitation taken, and
        // then sees the membership the first one added.
        const joined = (await getUserOrganizationsQuery(user.id!, transaction)).find(
          (o) => o.organization_id === Number(organizationId),
        );
        if (!joined) {
          return await refuse();
        }
        sessionRoleName = joined.role_name;
      } else if (membership.role_id !== roleId) {
        await updateOrganizationMemberRoleQuery(
          Number(organizationId),
          user.id!,
          roleId,
          transaction,
        );
      }
    }

    const { accessToken } = await generateUserTokens(
      {
        id: user.id!,
        email: user.email,
        roleName: sessionRoleName,
        organizationId: Number(organizationId),
      },
      res,
    );

    await transaction.commit();

    if (joinedThroughInvitation) {
      await logEvent(
        "Create",
        `Existing user ${user.email} joined organization ${organizationId} through SSO`,
        user.id!,
        Number(organizationId),
      );
    }

    const electedSuperAdmin = await isUserSuperAdminUtil(user.id!);

    logStructured(
      "successful",
      `Microsoft SSO login successful for ${user.email}`,
      "loginUserWithMicrosoft",
      "user.ctrl.ts",
    );
    return res
      .status(202)
      .json(STATUS_CODE[202]({ token: accessToken, isSuperAdmin: electedSuperAdmin }));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      "unexpected error during Microsoft SSO login",
      "loginUserWithMicrosoft",
      "user.ctrl.ts",
    );
    logger.error("❌ Error in loginUserWithMicrosoft:", error);
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
  logStructured("processing", "attempting token refresh", "refreshAccessToken", "user.ctrl.ts");
  logger.debug("🔁 Refresh token requested");

  try {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
      logStructured("error", "missing refresh token", "refreshAccessToken", "user.ctrl.ts");
      return res.status(400).json(STATUS_CODE[400](req.t!("Refresh token is required")));
    }

    const decoded = getRefreshTokenPayload(refreshToken);

    if (!decoded) {
      logStructured("error", "invalid refresh token", "refreshAccessToken", "user.ctrl.ts");
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid refresh token")));
    }

    if (decoded.expire < Date.now()) {
      logStructured("error", "refresh token expired", "refreshAccessToken", "user.ctrl.ts");
      return res.status(406).json(STATUS_CODE[406]({ message: req.t!("Token expired") }));
    }

    // Server-side validation: the token must exist and be unrevoked.
    const stored = await findRefreshToken(refreshToken);

    if (!stored) {
      logStructured("error", "unknown refresh token", "refreshAccessToken", "user.ctrl.ts");
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid refresh token")));
    }

    if (stored.revoked_at) {
      // Reuse of an already-rotated token = theft signal. Kill the family.
      logStructured(
        "error",
        `refresh token reuse detected for user ${stored.user_id}, revoking family`,
        "refreshAccessToken",
        "user.ctrl.ts",
      );
      await revokeTokenFamily(stored.family_id);
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid refresh token")));
    }

    if (new Date(stored.expires_at).getTime() < Date.now()) {
      logStructured("error", "stored refresh token expired", "refreshAccessToken", "user.ctrl.ts");
      return res.status(406).json(STATUS_CODE[406]({ message: req.t!("Token expired") }));
    }

    // Re-mint from the current membership, not the old token's claims: a
    // user removed from the organization gets no new token, and a role
    // changed since login takes effect. A token without an organization is a
    // pure SuperAdmin's, valid only while the super_admins row exists.
    let roleName: string;
    if (decoded.organizationId === null || decoded.organizationId === undefined) {
      if (!(await isUserSuperAdminUtil(decoded.id))) {
        await revokeTokenFamily(stored.family_id);
        return res.status(401).json(STATUS_CODE[401](req.t!("Invalid refresh token")));
      }
      roleName = "SuperAdmin";
    } else {
      const member = await getUserByIdQuery(decoded.id, null, decoded.organizationId);
      const memberRoleName = member ? await getRoleNameById(member.role_id!) : undefined;
      if (!memberRoleName) {
        await revokeTokenFamily(stored.family_id);
        return res.status(401).json(STATUS_CODE[401](req.t!("Invalid refresh token")));
      }
      roleName = memberRoleName;
    }

    // Rotate: revoke the presented token, issue a new one in the same family.
    await revokeRefreshTokenByHash(stored.token_hash);

    const { accessToken: newAccessToken } = await generateUserTokens(
      {
        id: decoded.id,
        email: decoded.email,
        roleName,
        organizationId: decoded.organizationId,
      },
      res,
      stored.family_id,
    );

    logStructured(
      "successful",
      `token refreshed for ${decoded.email}`,
      "refreshAccessToken",
      "user.ctrl.ts",
    );

    // The refresh cookie is shared by every tab. The organization tells a tab
    // that logged in elsewhere that this session now belongs to another org.
    return res.status(200).json(
      STATUS_CODE[200]({
        token: newAccessToken,
        organizationId: decoded.organizationId ?? null,
      }),
    );
  } catch (error) {
    logStructured(
      "error",
      "unexpected error during token refresh",
      "refreshAccessToken",
      "user.ctrl.ts",
    );
    logger.error("❌ Error in refreshAccessToken:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function resetPassword(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { email, newPassword } = req.body;

  logStructured("processing", `resetting password for ${email}`, "resetPassword", "user.ctrl.ts");
  logger.debug(`🔁 Password reset requested for ${email}`);

  try {
    const _user = (await getUserByEmailQuery(email)) as UserModel;
    const user = await UserModel.createNewUser(
      _user.name,
      _user.surname,
      _user.email,
      _user.password_hash,
    );

    if (user) {
      await user.updatePassword(newPassword);

      // Update by the canonical stored email, not the raw request email. The
      // lookup above (getUserByEmailQuery) is case-insensitive, but
      // resetPasswordQuery's UPDATE matches `email` exactly. If the stored value
      // differs in case or whitespace from what the user typed, passing the
      // request email would match zero rows and silently leave the password
      // unchanged. _user.email is the value actually in the database.
      const updatedUser = (await resetPasswordQuery(
        _user.email,
        user.password_hash,
        transaction,
      )) as UserModel;

      // Invalidate every existing session: a password reset must log the
      // user out everywhere (revokes all unexpired refresh tokens).
      await revokeAllUserTokens(_user.id!);

      await transaction.commit();
      logStructured("successful", `password reset for ${email}`, "resetPassword", "user.ctrl.ts");
      await logEvent(
        "Update",
        `Password reset for user: ${email}`,
        req.userId!,
        req.organizationId!,
      );

      return res.status(202).json(STATUS_CODE[202](updatedUser.toSafeJSON()));
    }

    logStructured("error", `user not found: ${email}`, "resetPassword", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Password reset failed — user not found: ${email}`,
      req.userId!,
      req.organizationId!,
    );
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured("error", `validation error: ${error.message}`, "resetPassword", "user.ctrl.ts");
      await logEvent(
        "Error",
        `Validation error during password reset: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "resetPassword",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Business logic error during password reset: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logStructured("error", `unexpected error for ${email}`, "resetPassword", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Unexpected error during password reset for ${email}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in resetPassword:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function updateUserById(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { name, surname, email, roleId: roleIdRaw, last_login } = req.body;

  // The frontend may send the id as a string of digits. Anything else
  // (true, arrays, "0x2", " 2 ", "2e0", ...) becomes NaN and is refused as an
  // unknown role below; Number() alone would turn true into 1 (Admin).
  const roleId =
    roleIdRaw === undefined || roleIdRaw === null || roleIdRaw === ""
      ? undefined
      : typeof roleIdRaw === "number" || (typeof roleIdRaw === "string" && /^\d+$/.test(roleIdRaw))
        ? Number(roleIdRaw)
        : NaN;

  logStructured("processing", `updating user ID ${id}`, "updateUserById", "user.ctrl.ts");

  try {
    // Check permissions (if user context is available)
    const currentUserId = (req as any).user?.id;
    // A user in another organization answers like a missing one, so the
    // endpoint does not reveal which user ids exist.
    const user = await getUserByIdQuery(id, transaction, req.organizationId);
    const isSelf = req.userId === id;
    if (!user) {
      logStructured("error", `user not found: ID ${id}`, "updateUserById", "user.ctrl.ts");
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    // Authorization: only Admins may edit other users.
    // Non-privileged users may only edit their own profile and may never
    // change a role (prevents privilege escalation via roleId in the body).
    const isPrivileged = req.role === "Admin";

    if (!isPrivileged && !isSelf) {
      logStructured(
        "error",
        `non-admin user ${req.userId} attempted to update user ID ${id}`,
        "updateUserById",
        "user.ctrl.ts",
      );
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Forbidden: Only admins can update other users")));
    }

    // Name and email belong to the person, who may be a member of other
    // organizations too: only they change them. An Admin changes the role.
    const changesIdentity =
      (name !== undefined && name !== user.name) ||
      (surname !== undefined && surname !== user.surname) ||
      (email !== undefined && email !== user.email);
    if (!isSelf && changesIdentity) {
      logStructured(
        "error",
        `user ${req.userId} attempted to change the name or email of user ID ${id}`,
        "updateUserById",
        "user.ctrl.ts",
      );
      await transaction.rollback();
      return res
        .status(403)
        .json(
          STATUS_CODE[403](req.t!("Forbidden: Only the user can change their own name or email")),
        );
    }

    if (!isPrivileged && roleId !== undefined && roleId !== user.role_id) {
      logStructured(
        "error",
        `user ${req.userId} attempted to change role of user ID ${id}`,
        "updateUserById",
        "user.ctrl.ts",
      );
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Forbidden: Only admins can change user roles")));
    }

    // The requested role must exist and be assignable in the caller's
    // organization: a built-in role (organization_id NULL) or one of this
    // organization's own custom roles. Another organization's custom role
    // and SuperAdmin (granted only through the super_admins mapping) are
    // refused. All three cases get the same response so the endpoint does
    // not reveal which role ids exist in other organizations.
    if (roleId !== undefined && roleId !== user.role_id) {
      // Read from the database, not the role cache, so a role created or
      // deleted a moment ago is judged correctly. A built-in role has an
      // organization_id of exactly null; a row without the field is refused.
      const targetRole =
        Number.isInteger(roleId) && roleId > 0 ? await getRoleByIdQuery(roleId) : null;
      const isAssignable =
        !!targetRole &&
        targetRole.name !== "SuperAdmin" &&
        (targetRole.organization_id === null || targetRole.organization_id === req.organizationId);
      if (!isAssignable) {
        logStructured(
          "error",
          `unassignable role ID ${roleId} requested for user ID ${id}`,
          "updateUserById",
          "user.ctrl.ts",
        );
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](req.t!("Unknown role")));
      }

      if (await isLastAdminQuery(req.organizationId!, id, transaction)) {
        logStructured(
          "error",
          `refused to change the role of the last Admin, user ID ${id}`,
          "updateUserById",
          "user.ctrl.ts",
        );
        await transaction.rollback();
        return res
          .status(409)
          .json(STATUS_CODE[409](req.t!("The organization must keep at least one Admin")));
      }
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
        },
        transaction,
      )) as UserModel;
      if (roleId !== undefined && roleId !== oldRoleId) {
        await updateOrganizationMemberRoleQuery(req.organizationId!, id, roleId, transaction);
      }
      updatedUser.role_id = roleId ?? oldRoleId;

      await transaction.commit();

      const actor = await getUserByIdQuery(req.userId!);
      const role = await getRoleByIdQuery(updatedUser.role_id!);

      await sendSlackNotification(
        {
          userId: actor.id!,
          routingType: SlackNotificationRoutingType.MEMBERSHIP_AND_ROLES,
        },
        {
          title: `Membership update`,
          message: `${updatedUser.name} ${updatedUser.surname} is now *Project ${role?.name}* (added by ${actor.name} ${actor.surname}).`,
        },
      );

      logStructured("successful", `user updated: ID ${id}`, "updateUserById", "user.ctrl.ts");
      await logEvent(
        "Update",
        `User updated: ID ${id}, email: ${updatedUser.email}`,
        req.userId!,
        req.organizationId!,
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
                organizationId: req.organizationId!,
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
            organizationId: req.organizationId!,
          });
        }
      }

      return res.status(202).json(STATUS_CODE[202](updatedUser.toSafeJSON()));
    }

    logStructured("error", `user not found: ID ${id}`, "updateUserById", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Update failed — user not found: ID ${id}`,
      req.userId!,
      req.organizationId!,
    );
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
  } catch (error) {
    await transaction.rollback();

    // The role was deleted between the check above and the update.
    if (error instanceof ForeignKeyConstraintError) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Unknown role")));
    }

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "updateUserById",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Validation error during update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "updateUserById",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Business logic error during update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logStructured("error", `unexpected error for user ID ${id}`, "updateUserById", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Unexpected error during update for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in updateUserById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function deleteUserById(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `attempting to delete user ID ${id}`,
    "deleteUserById",
    "user.ctrl.ts",
  );
  logger.debug(`🗑️ Delete request for user ID ${id}`);

  try {
    // A user in another organization answers like a missing one, so the
    // endpoint does not reveal which user ids exist. This also covers a pure
    // SuperAdmin (no membership), never removable from here.
    const user = await getUserByIdQuery(id, transaction, req.organizationId);
    if (!user) {
      logStructured("error", `user not found: ID ${id}`, "deleteUserById", "user.ctrl.ts");
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    if (user) {
      if (user.isDemoUser()) {
        logStructured(
          "error",
          `attempted to delete demo user ID ${id}`,
          "deleteUserById",
          "user.ctrl.ts",
        );
        await logEvent(
          "Error",
          `Blocked deletion of demo user ID ${id}`,
          req.userId!,
          req.organizationId!,
        );
        await transaction.rollback();
        return res
          .status(403)
          .json(
            STATUS_CODE[403](
              req.t!(
                "Demo users cannot be deleted. Remove demo data from Management > Delete demo data",
              ),
            ),
          );
      }

      if (await isLastAdminQuery(req.organizationId!, id, transaction)) {
        logStructured(
          "error",
          `refused to delete the last Admin, user ID ${id}`,
          "deleteUserById",
          "user.ctrl.ts",
        );
        await transaction.rollback();
        return res
          .status(409)
          .json(STATUS_CODE[409](req.t!("The organization must keep at least one Admin")));
      }

      // Removes the user from this organization only; the account goes too
      // when this was their last membership.
      const { removed, accountDeleted } = await removeUserFromOrganizationQuery(
        id,
        req.organizationId!,
        transaction,
      );
      await transaction.commit();

      logStructured(
        "successful",
        `user removed from organization: ID ${id}${accountDeleted ? ", account deleted" : ""}`,
        "deleteUserById",
        "user.ctrl.ts",
      );
      await logEvent(
        "Delete",
        `User removed from organization: ID ${id}, email: ${user.email}${accountDeleted ? " (account deleted)" : ""}`,
        req.userId!,
        req.organizationId!,
      );

      return res.status(202).json(STATUS_CODE[202](removed));
    }

    logStructured("error", `user not found: ID ${id}`, "deleteUserById", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Delete failed — user not found: ID ${id}`,
      req.userId!,
      req.organizationId!,
    );
    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error deleting user ID ${id}`,
      "deleteUserById",
      "user.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Unexpected error during delete for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in deleteUserById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Checks if any user exists in the database.
 *
 * @param {Request} _req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {Promise<Response>} A promise that resolves when the response is sent.
 */
async function checkUserExists(_req: Request, res: Response): Promise<Response> {
  logStructured("processing", "checking if any user exists", "checkUserExists", "user.ctrl.ts");
  logger.debug("🔍 Checking for existing users");

  try {
    const userExists = await checkUserExistsQuery();

    logStructured(
      "successful",
      `user existence check: ${userExists}`,
      "checkUserExists",
      "user.ctrl.ts",
    );

    return res.status(200).json(userExists);
  } catch (error) {
    logStructured("error", "failed to check user existence", "checkUserExists", "user.ctrl.ts");
    logger.error("❌ Error in checkUserExists:", error);
    return res.status(500).json(STATUS_CODE[500](_req.t!("Internal server error")));
  }
}

async function calculateProgress(req: Request, res: Response): Promise<Response> {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logStructured(
    "processing",
    `calculating progress for user ID ${id}`,
    "calculateProgress",
    "user.ctrl.ts",
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
      const controlcategories = await getControlCategoriesForProject(userProject.id!);
      for (const controlcategory of controlcategories) {
        const controls = await getControlForControlCategory(controlcategory.id!);
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
      "user.ctrl.ts",
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
      "user.ctrl.ts",
    );
    logger.error("❌ Error in calculateProgress:", error);
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
}

async function ChangePassword(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { id, currentPassword, newPassword } = req.body;

  logStructured(
    "processing",
    `attempting password change for user ID ${id}`,
    "ChangePassword",
    "user.ctrl.ts",
  );
  logger.debug(`🔐 Password change requested for user ID ${id}`);

  try {
    const user = await getUserByIdQuery(id);

    if (!user) {
      logStructured("error", `user not found: ID ${id}`, "ChangePassword", "user.ctrl.ts");
      await logEvent(
        "Error",
        `Password change failed — user not found: ID ${id}`,
        req.userId!,
        req.organizationId!,
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    await user.updatePassword(newPassword, currentPassword);

    const updatedUser = (await resetPasswordQuery(
      user.email,
      user.password_hash,
      transaction,
    )) as UserModel;

    await transaction.commit();
    logStructured(
      "successful",
      `password changed for user ID ${id}`,
      "ChangePassword",
      "user.ctrl.ts",
    );
    await logEvent(
      "Update",
      `Password changed for user ID ${id}`,
      req.userId!,
      req.organizationId!,
    );

    return res.status(202).json({
      message: req.t!("Password updated successfully"),
      data: updatedUser.toSafeJSON(),
    });
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "ChangePassword",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Validation error during password change: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "ChangePassword",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Business logic error during password change: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured("error", `unexpected error for user ID ${id}`, "ChangePassword", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Unexpected error during password change for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in ChangePassword:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// New function to update user role
async function updateUserRole(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { newRoleId: newRoleIdRaw } = req.body;

  // Normalize newRoleId from the request payload (frontend may send as string)
  const newRoleId = typeof newRoleIdRaw === "string" ? parseInt(newRoleIdRaw, 10) : newRoleIdRaw;

  const currentUserId = (req as any).user?.id;

  logStructured("processing", `updating role for user ID ${id}`, "updateUserRole", "user.ctrl.ts");
  logger.debug(`🔧 Role update requested for user ID ${id} by admin ID ${currentUserId}`);

  try {
    // Prevent role escalation to SuperAdmin
    if (newRoleId === 5) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403](req.t!("Cannot assign SuperAdmin role")));
    }

    // A pure SuperAdmin has no membership, so is never found here.
    const targetUser = await getUserByIdQuery(parseInt(id), transaction, req.organizationId);
    if (!targetUser) {
      logStructured("error", `target user not found: ID ${id}`, "updateUserRole", "user.ctrl.ts");
      await logEvent(
        "Error",
        `Role update failed — target user not found: ID ${id}`,
        req.userId!,
        req.organizationId!,
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    const currentUser = await getUserByIdQuery(currentUserId, transaction, req.organizationId);
    if (!currentUser) {
      logStructured(
        "error",
        `admin user not found: ID ${currentUserId}`,
        "updateUserRole",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Role update failed — admin user not found: ID ${currentUserId}`,
        req.userId!,
        req.organizationId!,
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Current user not found")));
    }

    // Capture the old role before updating
    const oldRoleId = targetUser.role_id;

    await targetUser.updateRole(newRoleId, currentUser);

    await updateOrganizationMemberRoleQuery(
      req.organizationId!,
      targetUser.id!,
      targetUser.role_id!,
      transaction,
    );
    const updatedUser = targetUser;

    await transaction.commit();
    logStructured("successful", `role updated for user ID ${id}`, "updateUserRole", "user.ctrl.ts");
    await logEvent(
      "Update",
      `User role updated: ID ${id}, new role ID: ${newRoleId}, by admin ID: ${currentUserId}`,
      req.userId!,
      req.organizationId!,
    );

    // Send email notifications for role change from Editor (3) to Admin (1)
    if (oldRoleId === 3 && newRoleId === 1) {
      // Get all projects where the user is a member
      try {
        const userProjects = await getUserProjects(
          parseInt(Array.isArray(id) ? id[0] : id),
          req.organizationId!,
        );

        // Send notification for each project (fire-and-forget)
        for (const project of userProjects) {
          sendMemberRoleChangedEditorToAdminNotification({
            projectId: project.id!,
            projectName: project.project_title,
            actorId: currentUserId,
            userId: parseInt(id),
            organizationId: req.organizationId!,
          }).catch(async (emailError) => {
            await logFailure({
              eventType: "Update",
              description: `Failed to send role changed notification for project ${project.id} to user ${id}`,
              functionName: "updateUserRole",
              fileName: "user.ctrl.ts",
              error: emailError as Error,
              userId: req.userId!,
              organizationId: req.organizationId!,
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
          organizationId: req.organizationId!,
        });
      }
    }

    return res.status(202).json({
      message: req.t!("User role updated successfully"),
      data: updatedUser.toSafeJSON(),
    });
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation error: ${error.message}`,
        "updateUserRole",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Validation error during role update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      logStructured(
        "error",
        `business logic error: ${error.message}`,
        "updateUserRole",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Business logic error during role update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured("error", `unexpected error for user ID ${id}`, "updateUserRole", "user.ctrl.ts");
    await logEvent(
      "Error",
      `Unexpected error during role update for user ID ${id}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in updateUserRole:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
    "user.ctrl.ts",
  );
  logger.debug(`📸 Uploading profile photo for user ID ${userId}`);

  try {
    // A missing user and another organization's answer alike (no id oracle).
    const user = await getUserByIdQuery(userId, null, req.organizationId);
    if (!user) {
      logStructured(
        "error",
        `access denied to user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts",
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    if (!attachment) {
      await transaction.rollback();
      logStructured(
        "error",
        `no file provided for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts",
      );
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!("No file provided"),
        }),
      );
    }

    // Upload file to tenant-specific files table
    const file = await uploadFile(
      attachment,
      req.userId!,
      null,
      "AI trust center group",
      req.organizationId!,
      transaction,
    );
    const fileId = file?.id || undefined;

    if (!fileId) {
      await transaction.rollback();
      logStructured(
        "error",
        `file upload failed for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts",
      );
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!("File upload failed"),
        }),
      );
    }

    // Update user's profile_photo_id
    const upload = await uploadUserProfilePhotoQuery(
      userId,
      fileId,
      req.organizationId!,
      transaction,
    );

    if (upload) {
      await transaction.commit();
      logStructured(
        "successful",
        `Profile photo uploaded for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts",
      );
      await logEvent(
        "Create",
        `Profile photo uploaded for user ID ${userId}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(200).json(
        STATUS_CODE[200]({
          message: req.t!("Profile photo uploaded successfully"),
          ...upload,
        }),
      );
    } else {
      await transaction.rollback();
      logStructured(
        "error",
        `failed to upload profile photo for user ID ${userId}`,
        "uploadUserProfilePhoto",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Failed to upload profile photo for user ID ${userId}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(500).json(
        STATUS_CODE[500]({
          message: req.t!("Failed to upload profile photo"),
        }),
      );
    }
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error uploading profile photo for user ID ${userId}`,
      "uploadUserProfilePhoto",
      "user.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Unexpected error uploading profile photo for user ID ${userId}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in uploadUserProfilePhoto:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function getUserProfilePhoto(req: Request, res: Response) {
  const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logStructured(
    "processing",
    `fetching profile photo for user ID ${userId}`,
    "getUserProfilePhoto",
    "user.ctrl.ts",
  );
  logger.debug(`📸 Fetching profile photo for user ID ${userId}`);

  try {
    // A missing user and another organization's answer alike (no id oracle).
    const user = await getUserByIdQuery(userId, null, req.organizationId);
    if (!user) {
      logStructured(
        "error",
        `access denied to user ID ${userId}`,
        "getUserProfilePhoto",
        "user.ctrl.ts",
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    const photo = await getUserProfilePhotoQuery(userId, req.organizationId!);

    if (!photo) {
      logStructured(
        "successful",
        `no profile photo for user ID ${userId}`,
        "getUserProfilePhoto",
        "user.ctrl.ts",
      );
      return res.status(200).json(
        STATUS_CODE[200]({
          message: req.t!("No profile photo"),
          photo: null,
        }),
      );
    }

    logStructured(
      "successful",
      `profile photo retrieved for user ID ${userId}`,
      "getUserProfilePhoto",
      "user.ctrl.ts",
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        message: req.t!("Profile photo retrieved successfully"),
        photo,
      }),
    );
  } catch (error) {
    logStructured(
      "error",
      `failed to retrieve profile photo for user ID ${userId}`,
      "getUserProfilePhoto",
      "user.ctrl.ts",
    );
    logger.error("❌ Error in getUserProfilePhoto:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function deleteUserProfilePhoto(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `deleting profile photo for user ID ${userId}`,
    "deleteUserProfilePhoto",
    "user.ctrl.ts",
  );
  logger.debug(`🗑️ Deleting profile photo for user ID ${userId}`);

  try {
    // A missing user and another organization's answer alike (no id oracle).
    const user = await getUserByIdQuery(userId, null, req.organizationId);
    if (!user) {
      logStructured(
        "error",
        `access denied to user ID ${userId}`,
        "deleteUserProfilePhoto",
        "user.ctrl.ts",
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    const isDeleted = await deleteUserProfilePhotoQuery(userId, req.organizationId!, transaction);

    if (isDeleted) {
      await transaction.commit();
      logStructured(
        "successful",
        `profile photo deleted for user ID ${userId}`,
        "deleteUserProfilePhoto",
        "user.ctrl.ts",
      );
      await logEvent(
        "Delete",
        `Profile photo deleted for user ID ${userId}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(200).json(
        STATUS_CODE[200]({
          message: req.t!("Profile photo deleted successfully"),
        }),
      );
    } else {
      await transaction.rollback();
      logStructured(
        "error",
        `failed to delete profile photo for user ID ${userId}`,
        "deleteUserProfilePhoto",
        "user.ctrl.ts",
      );
      await logEvent(
        "Error",
        `Failed to delete profile photo for user ID ${userId}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(500).json(
        STATUS_CODE[500]({
          message: req.t!("Failed to delete profile photo"),
        }),
      );
    }
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error deleting profile photo for user ID ${userId}`,
      "deleteUserProfilePhoto",
      "user.ctrl.ts",
    );
    await logEvent(
      "Error",
      `Unexpected error deleting profile photo for user ID ${userId}: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("❌ Error in deleteUserProfilePhoto:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Logs out the current session.
 *
 * Revokes the presented refresh token server-side and clears the cookie.
 * No JWT authentication is required (the access token may already be
 * expired); the endpoint only ever revokes the token presented in the
 * cookie, so it cannot be abused to log out other users.
 */
async function logoutUser(req: Request, res: Response): Promise<any> {
  logStructured("processing", "logout requested", "logoutUser", "user.ctrl.ts");

  try {
    const refreshToken = req.cookies.refresh_token;

    if (refreshToken) {
      const stored = await findRefreshToken(refreshToken);
      if (stored) {
        await revokeRefreshTokenByHash(stored.token_hash);
      }
    }

    res.clearCookie("refresh_token", {
      httpOnly: true,
      path: "/api/users",
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    res.clearCookie(CSRF_COOKIE_NAME, {
      httpOnly: false,
      path: "/api/users",
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    logStructured("successful", "logout completed", "logoutUser", "user.ctrl.ts");
    return res.status(200).json(STATUS_CODE[200]({ message: req.t!("Logged out") }));
  } catch (error) {
    logStructured("error", "unexpected error during logout", "logoutUser", "user.ctrl.ts");
    logger.error("❌ Error in logoutUser:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export {
  getAllUsers,
  getUserByEmail,
  getUserById,
  getPreferencesForCurrentUser,
  patchPreferencesForCurrentUser,
  createNewUserWrapper,
  createNewUser,
  acceptInvitationAsExistingUser,
  loginUser,
  selectLoginOrganization,
  loginUserWithMicrosoft,
  resetPassword,
  updateUserById,
  deleteUserById,
  checkUserExists,
  calculateProgress,
  ChangePassword,
  refreshAccessToken,
  logoutUser,
  updateUserRole,
  uploadUserProfilePhoto,
  getUserProfilePhoto,
  deleteUserProfilePhoto,
};
