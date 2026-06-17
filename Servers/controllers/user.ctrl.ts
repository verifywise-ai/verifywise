/**
 * @fileoverview User Management Controller
 *
 * HTTP entry points for users — authentication, CRUD, password management,
 * profile photos, and progress aggregation. Heavy work is delegated to
 * services/utils:
 *   - utils/user/userProgress.utils           → calculateUserProgress
 *   - services/auth/microsoftSso.service      → loginViaMicrosoftSso
 *   - services/user/userLoginContext.service  → buildLoginOrgContext
 *   - services/user/userProfilePhoto.service  → upload/get/delete profile photo
 *   - services/userNotification/roleChangeNotifications → role-change fanout
 *
 * @module controllers/user
 */

import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { Transaction } from "sequelize";
import {
  checkUserExistsQuery,
  createNewUserQuery,
  deleteUserByIdQuery,
  getAllUsersQuery,
  getUserByEmailQuery,
  getUserByIdQuery,
  resetPasswordQuery,
  updateUserByIdQuery,
} from "../utils/user.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { generateToken, getRefreshTokenPayload } from "../utils/jwt.utils";
import { UserModel } from "../domain.layer/models/user/user.model";
import { sequelize } from "../database/db";
import {
  ValidationException,
  BusinessLogicException,
  ConflictException,
} from "../domain.layer/exceptions/custom.exception";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";
import { generateUserTokens } from "../utils/auth.utils";
import { sendSlackNotification } from "../services/slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../domain.layer/enums/slack.enum";
import { getRoleByIdQuery } from "../utils/role.utils";
import { markInvitationAcceptedQuery } from "../utils/invitation.utils";
import { isSSOFeatureEnabled } from "../utils/ssoConfig.utils";
import { translateError } from "../utils/i18n.utils";
import { calculateUserProgress } from "../utils/user/userProgress.utils";
import { loginViaMicrosoftSso } from "../services/auth/microsoftSso.service";
import { buildLoginOrgContext } from "../services/user/userLoginContext.service";
import {
  uploadProfilePhoto as uploadProfilePhotoService,
  getProfilePhoto as getProfilePhotoService,
  deleteProfilePhoto as deleteProfilePhotoService,
} from "../services/user/userProfilePhoto.service";
import { notifyRoleChangedEditorToAdmin } from "../services/userNotification/roleChangeNotifications";

const FILE_NAME = "user.ctrl.ts";

// ===========================================================================
// READ
// ===========================================================================

async function getAllUsers(req: Request, res: Response): Promise<any> {
  logStructured("processing", "starting getAllUsers", "getAllUsers", FILE_NAME);
  try {
    const users = (await getAllUsersQuery(req.organizationId!)) as UserModel[];
    if (users && users.length > 0) {
      return res.status(200).json(STATUS_CODE[200](users.map((user) => user.toSafeJSON())));
    }
    return res.status(204).json(STATUS_CODE[204](users));
  } catch (error) {
    logStructured("error", "failed to retrieve users", "getAllUsers", FILE_NAME);
    logger.error("❌ Error in getAllUsers:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function getUserByEmail(req: Request, res: Response) {
  const email = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
  try {
    const user = (await getUserByEmailQuery(email)) as UserModel & { role_name: string };
    if (user) return res.status(200).json(STATUS_CODE[200](user.toSafeJSON()));
    return res.status(404).json(STATUS_CODE[404](user));
  } catch (error) {
    logStructured("error", `failed to fetch user: ${email}`, "getUserByEmail", FILE_NAME);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function getUserById(req: Request, res: Response) {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    const user = (await getUserByIdQuery(id)) as UserModel;
    const isSelfLookup = id === req.userId;
    if (!req.isSuperAdmin && !isSelfLookup && user.organization_id !== req.organizationId) {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Forbidden: Access to this user is denied")));
    }
    if (user) return res.status(200).json(STATUS_CODE[200](user.toSafeJSON()));
    return res.status(404).json(STATUS_CODE[404](user));
  } catch (error) {
    logStructured("error", `failed to fetch user: ID ${id}`, "getUserById", FILE_NAME);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ===========================================================================
// CREATE
// ===========================================================================

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

  const existingUser = await getUserByEmailQuery(email);
  if (existingUser) {
    throw new ConflictException("User with this email already exists");
  }

  const userModel = await UserModel.createNewUser(
    name,
    surname,
    email,
    password,
    roleId,
    organizationId,
  );
  await userModel.validateUserData();

  const isEmailUnique = await UserModel.validateEmailUniqueness(email);
  if (!isEmailUnique) {
    throw new ConflictException("Email already exists");
  }

  return (await createNewUserQuery(userModel, transaction)) as UserModel;
}

async function createNewUser(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { name, surname, email, password, roleId, organizationId } = req.body;

  try {
    const user = await createNewUserWrapper(
      { name, surname, email, password, roleId, organizationId },
      transaction,
    );

    if (user) {
      await transaction.commit();

      try {
        await markInvitationAcceptedQuery(organizationId, email);
      } catch (_) {
        // Non-critical — don't block user creation
      }

      await logEvent("Create", `User created: ${email}`, req.userId!, req.organizationId!);
      return res.status(201).json(STATUS_CODE[201](user.toSafeJSON()));
    }

    await transaction.rollback();
    return res.status(400).json(STATUS_CODE[400](req.t!("Failed to create user")));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ConflictException) {
      return res.status(409).json(STATUS_CODE[409](translateError(req, error)));
    }
    if (error instanceof ValidationException) {
      await logEvent(
        "Error",
        `Validation error during user creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    if (error instanceof BusinessLogicException) {
      await logEvent(
        "Error",
        `Business logic error during user creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

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

// ===========================================================================
// LOGIN / TOKEN
// ===========================================================================

async function loginUser(req: Request, res: Response): Promise<any> {
  const { email, password } = req.body;

  try {
    const userData = await getUserByEmailQuery(email);
    if (!userData) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid email or password")));
    }

    const user = userData instanceof UserModel ? userData : Object.assign(new UserModel(), userData);

    let passwordIsMatched = false;
    try {
      passwordIsMatched = await user.comparePassword(password);
    } catch {
      passwordIsMatched = await bcrypt.compare(password, userData.password_hash);
    }

    if (!passwordIsMatched) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid email or password")));
    }

    user.updateLastLogin();
    const isSuperAdmin = user.role_id === 5;
    const { accessToken } = generateUserTokens(
      {
        id: user.id!,
        email,
        roleName: (userData as any).role_name || (isSuperAdmin ? "SuperAdmin" : ""),
        organizationId: isSuperAdmin ? null : (userData as any).organization_id,
      },
      res,
    );

    if (isSuperAdmin) {
      return res.status(202).json(STATUS_CODE[202]({ token: accessToken, isSuperAdmin: true }));
    }

    const orgId = (userData as any).organization_id;
    const { onboardingStatus, isOrgCreator } = await buildLoginOrgContext(orgId, user.id!);

    return res.status(202).json(
      STATUS_CODE[202]({
        token: accessToken,
        onboarding_status: onboardingStatus,
        is_org_creator: isOrgCreator,
      }),
    );
  } catch (error) {
    logger.error("❌ Error in loginUser:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function loginUserWithMicrosoft(req: Request, res: Response): Promise<any> {
  if (!isSSOFeatureEnabled()) {
    return res.status(404).json(STATUS_CODE[404]("SSO feature is not enabled"));
  }

  const { code, organizationId, redirectUri } = req.body as {
    code?: string;
    organizationId?: number;
    redirectUri?: string;
  };

  if (!code) return res.status(400).json(STATUS_CODE[400]("Authorization code is required"));
  if (!organizationId || isNaN(Number(organizationId))) {
    return res.status(400).json(STATUS_CODE[400]("organizationId is required"));
  }
  if (!redirectUri) return res.status(400).json(STATUS_CODE[400]("redirectUri is required"));

  const transaction = await sequelize.transaction();
  try {
    const outcome = await loginViaMicrosoftSso(
      { code, organizationId: Number(organizationId), redirectUri },
      transaction,
    );

    if (!outcome.ok) {
      await transaction.rollback();
      return res.status(outcome.status).json(STATUS_CODE[outcome.status](outcome.message));
    }

    const { user, roleName } = outcome;
    const { accessToken } = generateUserTokens(
      {
        id: user.id!,
        email: user.email,
        roleName,
        organizationId: user.organization_id ?? null,
      },
      res,
    );

    await transaction.commit();
    return res.status(202).json(STATUS_CODE[202]({ token: accessToken }));
  } catch (error) {
    await transaction.rollback();
    logger.error("❌ Error in loginUserWithMicrosoft:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

async function refreshAccessToken(req: Request, res: Response): Promise<any> {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Refresh token is required")));
    }

    const decoded = getRefreshTokenPayload(refreshToken);
    if (!decoded) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid refresh token")));
    }
    if (decoded.expire < Date.now()) {
      return res.status(406).json(STATUS_CODE[406]({ message: req.t!("Token expired") }));
    }

    const newAccessToken = generateToken({
      id: decoded.id,
      email: decoded.email,
      roleName: decoded.roleName,
      organizationId: decoded.organizationId,
    });

    return res.status(200).json(STATUS_CODE[200]({ token: newAccessToken }));
  } catch (error) {
    logger.error("❌ Error in refreshAccessToken:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ===========================================================================
// PASSWORD
// ===========================================================================

async function resetPassword(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { email, newPassword } = req.body;

  try {
    const _user = (await getUserByEmailQuery(email)) as UserModel & { role_name: string };
    const user = await UserModel.createNewUser(
      _user.name,
      _user.surname,
      _user.email,
      _user.password_hash,
      _user.role_id,
      _user.organization_id!,
    );

    if (user) {
      await user.updatePassword(newPassword);
      const updatedUser = (await resetPasswordQuery(
        email,
        user.password_hash,
        transaction,
      )) as UserModel;
      await transaction.commit();
      await logEvent(
        "Update",
        `Password reset for user: ${email}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(202).json(STATUS_CODE[202](updatedUser.toSafeJSON()));
    }

    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logEvent(
        "Error",
        `Validation error during password reset: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    if (error instanceof BusinessLogicException) {
      await logEvent(
        "Error",
        `Business logic error during password reset: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logger.error("❌ Error in resetPassword:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function ChangePassword(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const { id, currentPassword, newPassword } = req.body;

  try {
    const user = await getUserByIdQuery(id);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: req.t!("User not found") });
    }

    await user.updatePassword(newPassword, currentPassword);
    const updatedUser = (await resetPasswordQuery(
      user.email,
      user.password_hash,
      transaction,
    )) as UserModel;

    await transaction.commit();
    await logEvent("Update", `Password changed for user ID ${id}`, req.userId!, req.organizationId!);

    return res.status(202).json({
      message: req.t!("Password updated successfully"),
      data: updatedUser.toSafeJSON(),
    });
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      return res.status(400).json({ message: (error as Error).message });
    }
    if (error instanceof BusinessLogicException) {
      return res.status(403).json({ message: (error as Error).message });
    }
    logger.error("❌ Error in ChangePassword:", error);
    return res.status(500).json({ message: (error as Error).message });
  }
}

// ===========================================================================
// UPDATE
// ===========================================================================

async function updateUserById(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { name, surname, email, roleId: roleIdRaw, last_login } = req.body;
  const roleId = roleIdRaw ? parseInt(roleIdRaw) : undefined;

  try {
    const currentUserId = (req as any).user?.id;
    const user = await getUserByIdQuery(id);

    if (user.organization_id !== req.organizationId) {
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Forbidden: Access to this user is denied")));
    }

    if (user) {
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
        transaction,
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
        },
      );

      await logEvent(
        "Update",
        `User updated: ID ${id}, email: ${updatedUser.email}`,
        req.userId!,
        req.organizationId!,
      );

      if (Number(roleId) === 1 && Number(oldRoleId) === 3) {
        await notifyRoleChangedEditorToAdmin({
          userId: id,
          actorId: currentUserId || id,
          organizationId: req.organizationId!,
          functionName: "updateUserById",
          fileName: FILE_NAME,
          loggerUserId: req.userId!,
        });
      }

      return res.status(202).json(STATUS_CODE[202](updatedUser.toSafeJSON()));
    }

    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logEvent(
        "Error",
        `Validation error during update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    if (error instanceof BusinessLogicException) {
      await logEvent(
        "Error",
        `Business logic error during update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    logger.error("❌ Error in updateUserById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function updateUserRole(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { newRoleId: newRoleIdRaw } = req.body;
  const newRoleId = typeof newRoleIdRaw === "string" ? parseInt(newRoleIdRaw, 10) : newRoleIdRaw;
  const currentUserId = (req as any).user?.id;

  try {
    if (newRoleId === 5) {
      await transaction.rollback();
      return res.status(403).json({ message: req.t!("Cannot assign SuperAdmin role") });
    }

    const targetUser = await getUserByIdQuery(parseInt(id));
    if (!targetUser) {
      await transaction.rollback();
      return res.status(404).json({ message: req.t!("User not found") });
    }
    if (targetUser.role_id === 5) {
      await transaction.rollback();
      return res.status(403).json({ message: req.t!("Cannot modify SuperAdmin role") });
    }

    const currentUser = await getUserByIdQuery(currentUserId);
    if (!currentUser) {
      await transaction.rollback();
      return res.status(404).json({ message: req.t!("Current user not found") });
    }

    const oldRoleId = targetUser.role_id;
    await targetUser.updateRole(newRoleId, currentUser);

    const updatedUser = (await updateUserByIdQuery(
      parseInt(Array.isArray(id) ? id[0] : id),
      { role_id: targetUser.role_id },
      transaction,
    )) as UserModel;

    await transaction.commit();
    await logEvent(
      "Update",
      `User role updated: ID ${id}, new role ID: ${newRoleId}, by admin ID: ${currentUserId}`,
      req.userId!,
      req.organizationId!,
    );

    if (oldRoleId === 3 && newRoleId === 1) {
      await notifyRoleChangedEditorToAdmin({
        userId: parseInt(id),
        actorId: currentUserId,
        organizationId: req.organizationId!,
        functionName: "updateUserRole",
        fileName: FILE_NAME,
        loggerUserId: req.userId!,
      });
    }

    return res.status(202).json({
      message: req.t!("User role updated successfully"),
      data: updatedUser.toSafeJSON(),
    });
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      return res.status(400).json({ message: (error as Error).message });
    }
    if (error instanceof BusinessLogicException) {
      return res.status(403).json({ message: (error as Error).message });
    }

    logger.error("❌ Error in updateUserRole:", error);
    return res.status(500).json({ message: (error as Error).message });
  }
}

// ===========================================================================
// DELETE
// ===========================================================================

async function deleteUserById(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  try {
    const user = await getUserByIdQuery(id);

    if (user && user.role_id === 5) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403](req.t!("Super-admin user cannot be deleted")));
    }
    if (user.organization_id !== req.organizationId) {
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Forbidden: Access to this user is denied")));
    }

    if (user) {
      if (user.isDemoUser()) {
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

      const deletedUser = await deleteUserByIdQuery(id, req.organizationId!, transaction);
      await transaction.commit();
      await logEvent(
        "Delete",
        `User deleted: ID ${id}, email: ${user.email}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(202).json(STATUS_CODE[202](deletedUser));
    }

    await transaction.rollback();
    return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
  } catch (error) {
    await transaction.rollback();
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

// ===========================================================================
// MISC
// ===========================================================================

async function checkUserExists(_req: Request, res: Response): Promise<Response> {
  try {
    const userExists = await checkUserExistsQuery();
    return res.status(200).json(userExists);
  } catch (error) {
    logger.error("❌ Error in checkUserExists:", error);
    return res.status(500).json({ message: _req.t!("Internal server error") });
  }
}

async function calculateProgress(req: Request, res: Response): Promise<Response> {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  try {
    const result = await calculateUserProgress(id, req.organizationId!);
    return res.status(200).json(result);
  } catch (error) {
    logger.error("❌ Error in calculateProgress:", error);
    return res.status(500).json({ message: req.t!("Internal server error") });
  }
}

// ===========================================================================
// PROFILE PHOTO
// ===========================================================================

const profilePhotoErrorResponse = (req: Request, res: Response, outcome: { status: number; message: string }) =>
  res
    .status(outcome.status)
    .json((STATUS_CODE as any)[outcome.status](req.t!(outcome.message)));

async function uploadUserProfilePhoto(req: any, res: Response) {
  const transaction = await sequelize.transaction();
  const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  try {
    const outcome = await uploadProfilePhotoService({
      targetUserId: userId,
      organizationId: req.organizationId!,
      actorUserId: req.userId!,
      file: req.file,
      transaction,
    });

    if (!outcome.ok) {
      await transaction.rollback();
      return profilePhotoErrorResponse(req, res, outcome);
    }

    await transaction.commit();
    await logEvent(
      "Create",
      `Profile photo uploaded for user ID ${userId}`,
      req.userId!,
      req.organizationId!,
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        message: req.t!("Profile photo uploaded successfully"),
        ...outcome.data,
      }),
    );
  } catch (error) {
    await transaction.rollback();
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

  try {
    const outcome = await getProfilePhotoService({
      targetUserId: userId,
      organizationId: req.organizationId!,
    });

    if (!outcome.ok) return profilePhotoErrorResponse(req, res, outcome);

    const photo = outcome.data.photo;
    if (!photo) {
      return res.status(200).json(
        STATUS_CODE[200]({
          message: req.t!("No profile photo"),
          photo: null,
        }),
      );
    }
    return res.status(200).json(
      STATUS_CODE[200]({
        message: req.t!("Profile photo retrieved successfully"),
        photo,
      }),
    );
  } catch (error) {
    logger.error("❌ Error in getUserProfilePhoto:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

async function deleteUserProfilePhoto(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  try {
    const outcome = await deleteProfilePhotoService({
      targetUserId: userId,
      organizationId: req.organizationId!,
      transaction,
    });

    if (!outcome.ok) {
      await transaction.rollback();
      return profilePhotoErrorResponse(req, res, outcome);
    }

    await transaction.commit();
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
  } catch (error) {
    await transaction.rollback();
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

export {
  getAllUsers,
  getUserByEmail,
  getUserById,
  createNewUserWrapper,
  createNewUser,
  loginUser,
  loginUserWithMicrosoft,
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
