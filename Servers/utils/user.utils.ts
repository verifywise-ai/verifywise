/**
 * @file user.utils.ts
 * @description This file contains utility functions for performing CRUD operations on the 'users' table in the database.
 *
 * The functions included are:
 * - `getAllUsersQuery`: Fetches all users from the database.
 * - `getUserByEmailQuery`: Fetches a user by their email address.
 * - `getUserByIdQuery`: Fetches a user by their ID.
 * - `createNewUserQuery`: Creates a new user in the database.
 * - `resetPasswordQuery`: Resets the password for a user identified by their email.
 * - `updateUserByIdQuery`: Updates user details by their ID.
 * - `removeUserFromOrganizationQuery`: Removes a user from one organization.
 * - `deleteUserAccountQuery`: Deletes a user's account from every organization.
 *
 * Each function interacts with the database using SQL queries and returns the result.
 *
 * @module utils/user.utils
 */

import { UserModel } from "../domain.layer/models/user/user.model";
import { sequelize } from "../database/db";
import { withLegacyHighRiskRole } from "./highRiskRoles.utils";
import { QueryTypes, Transaction } from "sequelize";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
import { ControlModel } from "../domain.layer/models/control/control.model";
import { SubcontrolModel } from "../domain.layer/models/subcontrol/subcontrol.model";
import { RiskModel } from "../domain.layer/models/risks/risk.model";
import { VendorRiskModel } from "../domain.layer/models/vendorRisk/vendorRisk.model";
import { FileModel } from "../domain.layer/models/file/file.model";
import { ControlCategoryModel } from "../domain.layer/models/controlCategory/controlCategory.model";
import { AssessmentModel } from "../domain.layer/models/assessment/assessment.model";
import { TopicModel } from "../domain.layer/models/topic/topic.model";
import { SubtopicModel } from "../domain.layer/models/subtopic/subtopic.model";
import { QuestionModel } from "../domain.layer/models/question/question.model";
import { deleteFileById } from "./fileUpload.utils";
import { reassignAgentOwnersOfDeletedUsersQuery } from "./agentDiscovery.utils";
import { AutomationModel } from "../domain.layer/models/automation/automation.model";
import { addOrganizationMemberQuery } from "./organizationMember.utils";
import { revokeUserOrganizationTokens } from "./refreshToken.utils";

/**
 * Retrieves all users from the database.
 *
 * This function executes a SQL query to select all records from the `users` table.
 * It returns a promise that resolves to an array of `User` objects.
 *
 * @returns {Promise<User[]>} A promise that resolves to an array of `User` objects.
 *
 * @example
 * // Example usage:
 * getAllUsersQuery().then(users => {
 * }).catch(error => {
 *   console.error(error);
 * });
 *
 * @throws {Error} If there is an error executing the SQL query.
 */
export const getAllUsersQuery = async (organization_id: number): Promise<UserModel[]> => {
  const users = await sequelize.query(
    `SELECT u.*, om.role_id
       FROM users u
       JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organization_id
      ORDER BY u.created_at DESC, u.id ASC`,
    {
      replacements: { organization_id },
      mapToModel: true,
      model: UserModel,
    },
  );
  return users;
};

/**
 * Retrieves a user from the database by their email address.
 *
 * Identity only: a user's organizations and roles are their
 * organization_members rows (getUserOrganizationsQuery).
 *
 * @param {string} email - The email address of the user to retrieve.
 * @returns {Promise<User | null>} A promise that resolves to the user object or null.
 *
 * @throws {Error} If there is an error executing the SQL query.
 */
export const getUserByEmailQuery = async (email: string): Promise<UserModel | null> => {
  try {
    const [userObj] = await sequelize.query(
      `
      SELECT users.*
      FROM users
      WHERE LOWER(TRIM(users.email)) = LOWER(TRIM(:email))
      LIMIT 1
      `,
      {
        replacements: { email },
        type: QueryTypes.SELECT,
      },
    );

    return (userObj as UserModel | undefined) ?? null;
  } catch (error) {
    console.error("Error getting user by email:", error);
    throw error;
  }
};

/**
 * Retrieves a user from the database by their unique identifier.
 *
 * @param {number} id - The unique identifier of the user.
 * @returns {Promise<UserModel>} A promise that resolves to the user object.
 *
 * @throws {Error} If the query fails.
 *
 * @example
 * ```typescript
 * const userId = 12345;
 * getUserByIdQuery(userId)
 *   .then(user => {
 *     // user is a UserModel instance with all methods available
 *   })
 *   .catch(error => {
 *     console.error(error);
 *   });
 * ```
 */
export const getUserByIdQuery = async (
  id: number,
  transaction: Transaction | null = null,
  /**
   * When given, only a member of this organization is returned, with role_id
   * set to their role in it. Without it, the user is identity only.
   */
  organizationId?: number,
): Promise<UserModel> => {
  const query =
    organizationId !== undefined
      ? `SELECT u.*, om.role_id
           FROM users u
           JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
          WHERE u.id = :id`
      : `SELECT * FROM users WHERE id = :id`;
  const users = await sequelize.query<UserModel>(query, {
    replacements: { id, organizationId },
    model: UserModel,
    mapToModel: true, // converts results into UserModel instances
    ...(transaction ? { transaction } : {}), // include transaction if provided
  });

  // users will be an array. Return first element or null if not found
  return users[0];
};

/**
 * Retrieves a user from the database by their ID, throwing an error if not found.
 * This is a safe wrapper around getUserByIdQuery for cases where the user must exist.
 *
 * @param {number} id - The unique identifier of the user.
 * @returns {Promise<UserModel>} A promise that resolves to the user object.
 * @throws {Error} If the user is not found or the query fails.
 *
 * @example
 * ```typescript
 * // Use this when you expect the user to exist
 * const user = await getUserByIdOrThrow(12345);
 * // No null check needed - will throw if user doesn't exist
 * console.log(user.name);
 * ```
 */
/** Returns the ids in `userIds` that are not users of `organizationId` (invalid ids are ignored). */
export const findUsersNotInOrganization = async (
  userIds: number[],
  organizationId: number,
  transaction: Transaction | null = null,
): Promise<number[]> => {
  const unique = Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (unique.length === 0) return [];

  const rows = (await sequelize.query(
    `SELECT user_id AS id FROM organization_members
     WHERE organization_id = :organizationId
       AND user_id IN (:userIds);`,
    {
      replacements: { organizationId, userIds: unique },
      type: QueryTypes.SELECT,
      ...(transaction ? { transaction } : {}),
    },
  )) as { id: number }[];

  const found = new Set(rows.map((r) => r.id));
  return unique.filter((id) => !found.has(id));
};

export const getUserByIdOrThrow = async (id: number): Promise<UserModel> => {
  const user = await getUserByIdQuery(id);
  if (!user) {
    throw new Error(`User not found with ID: ${id}`);
  }
  return user;
};

export const doesUserBelongsToOrganizationQuery = async (
  userId: number,
  organizationId: number,
) => {
  const result = (await sequelize.query(
    "SELECT COUNT(*) > 0 AS belongs FROM organization_members WHERE user_id = :userId AND organization_id = :organizationId",
    {
      replacements: { userId, organizationId },
    },
  )) as [{ belongs: boolean }[], number];
  return result[0][0];
};

/**
 * Creates a new user and their first organization membership.
 *
 * @param user - The user's identity details, excluding the user ID.
 * @param membership - The organization the user joins and their role in it.
 * @returns The new user, with role_id set to their role in that organization.
 *
 * @throws Will throw an error if the database query fails.
 */
export const createNewUserQuery = async (
  user: Omit<UserModel, "id">,
  membership: { organizationId: number; roleId: number },
  transaction: Transaction,
  is_demo: boolean = false,
): Promise<UserModel> => {
  const { name, surname, email, password_hash, sso_provider, sso_user_id } = user;
  const created_at = new Date();
  const last_login = new Date();

  try {
    const result = await sequelize.query(
      `INSERT INTO users (name, surname, email, password_hash, created_at, last_login, is_demo, sso_provider, sso_user_id)
        VALUES (:name, :surname, :email, :password_hash, :created_at, :last_login, :is_demo, :sso_provider, :sso_user_id) RETURNING *`,
      {
        replacements: {
          name,
          surname,
          email,
          password_hash: password_hash ?? null,
          created_at,
          last_login,
          is_demo,
          sso_provider: sso_provider ?? null,
          sso_user_id: sso_user_id ?? null,
        },
        mapToModel: true,
        model: UserModel,
        transaction,
      },
    );

    const created = result[0];
    await addOrganizationMemberQuery(
      membership.organizationId,
      created.id!,
      membership.roleId,
      transaction,
    );
    created.role_id = membership.roleId;
    return created;
  } catch (error) {
    console.error("Error creating new user:", error);
    throw error;
  }
};

/**
 * Resets the password for a user identified by their email.
 *
 * @param email - The email address of the user whose password is to be reset.
 * @param newPassword - The new password to be set for the user.
 * @returns A promise that resolves to the updated user object.
 *
 * @throws Will throw an error if the database query fails.
 */
export const resetPasswordQuery = async (
  email: string,
  newPassword: string,
  transaction: Transaction,
): Promise<UserModel> => {
  const result = await sequelize.query(
    `UPDATE users SET password_hash = :password_hash WHERE email = :email RETURNING *`,
    {
      replacements: {
        password_hash: newPassword,
        email,
      },
      mapToModel: true,
      model: UserModel,
      // type: QueryTypes.UPDATE
      transaction,
    },
  );
  return result[0];
};

/**
 * Updates a user in the database by their ID.
 *
 * @param {string} id - The ID of the user to update.
 * @param {Partial<User>} user - An object containing the user properties to update.
 *                               Only the provided properties will be updated.
 * @returns {Promise<User>} A promise that resolves to the updated user object.
 *
 * @example
 * const updatedUser = await updateUserByIdQuery('123', {
 *   name: 'John Doe',
 *   email: 'john.doe@example.com',
 *   last_login: new Date()
 * });
 *
 * A role is per organization: updateOrganizationMemberRoleQuery.
 */
export const updateUserByIdQuery = async (
  id: number,
  user: Partial<UserModel>,
  transaction: Transaction,
): Promise<UserModel> => {
  const updateUser: Partial<Record<keyof UserModel, any>> = {};
  const setClause = ["name", "surname", "email", "last_login"]
    .filter((f) => {
      if (user[f as keyof UserModel] !== undefined && user[f as keyof UserModel]) {
        updateUser[f as keyof UserModel] = user[f as keyof UserModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE users SET ${setClause} WHERE id = :id RETURNING *;`;

  updateUser.id = id;

  const result = await sequelize.query(query, {
    replacements: updateUser,
    mapToModel: true,
    model: UserModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });

  return result[0];
};

/**
 * True if `userId` holds the built-in Admin role and is the only member of
 * `organizationId` who does. Locks every Admin membership of the organization
 * (in user id order) for the rest of the transaction, so two concurrent demotions or
 * deletions cannot each see the other Admin and leave the organization with
 * none: the second waits, then re-reads the first one's change.
 */
export const isLastAdminQuery = async (
  organizationId: number,
  userId: number,
  transaction: Transaction,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `SELECT om.user_id AS id
       FROM organization_members om
       JOIN roles r ON r.id = om.role_id
      WHERE om.organization_id = :organizationId
        AND r.organization_id IS NULL
        AND r.name = 'Admin'
      ORDER BY om.user_id
        FOR UPDATE OF om`,
    { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
  )) as { id: number }[];
  return rows.length === 1 && rows[0].id === userId;
};

/**
 * Clears one organization's references to a user: assignment columns go to
 * NULL, agents they primarily own move to their next owner, and their project
 * memberships in that organization are deleted. Audit columns are kept.
 */
const clearOrganizationReferencesToUser = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  const usersFK = [
    {
      table: "projects",
      model: ProjectModel,
      fields: ["owner", "last_updated_by"],
    },
    { table: "vendors", model: VendorModel, fields: ["assignee", "reviewer"] },
    // {
    //   table: "controls",
    //   model: ControlModel,
    //   fields: ["approver", "owner", "reviewer"],
    // },
    // {
    //   table: "subcontrols",
    //   model: SubcontrolModel,
    //   fields: ["approver", "owner", "reviewer"],
    // },
    {
      table: "risks",
      model: RiskModel,
      fields: ["risk_owner", "risk_approval"],
    },
    { table: "vendorrisks", model: VendorRiskModel, fields: ["action_owner"] },
    { table: "files", model: FileModel, fields: ["uploaded_by"] },
    { table: "automations", model: AutomationModel, fields: ["created_by"] },
    { table: "invitations", model: null as any, fields: ["invited_by"] },
  ];

  for (let entry of usersFK) {
    await Promise.all(
      entry.fields.map(async (f) => {
        await sequelize.query(
          `UPDATE ${entry.table} SET ${f} = :x WHERE organization_id = :organizationId AND ${f} = :id`,
          {
            replacements: { x: null, id, organizationId },
            transaction,
          },
        );
      }),
    );
  }

  // Agents whose primary owner is this user move to their next remaining owner.
  await reassignAgentOwnersOfDeletedUsersQuery([id], organizationId, transaction);

  await sequelize.query(
    `DELETE FROM projects_members WHERE organization_id = :organizationId AND user_id = :user_id`,
    {
      replacements: { user_id: id, organizationId },
      type: QueryTypes.DELETE,
      transaction,
    },
  );
};

/**
 * Removes a user from one organization: clears that organization's references
 * to them, revokes their refresh tokens for it, and deletes the membership.
 * When it was their last membership the account is deleted too, in the same
 * transaction, unless they are a super admin.
 *
 * @returns `removed` false when the user is not a member of the organization.
 */
export const removeUserFromOrganizationQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<{ removed: boolean; accountDeleted: boolean }> => {
  await clearOrganizationReferencesToUser(id, organizationId, transaction);
  await revokeUserOrganizationTokens(id, organizationId, transaction);

  const removed = (await sequelize.query(
    `DELETE FROM organization_members
     WHERE organization_id = :organizationId AND user_id = :id
     RETURNING user_id`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT, transaction },
  )) as { user_id: number }[];
  if (removed.length === 0) {
    return { removed: false, accountDeleted: false };
  }

  // The helper sees every organization's memberships: under RLS enforcement a
  // plain NOT EXISTS here only sees the current organization's rows. A super
  // admin keeps their account as a pure super admin.
  const deleted = (await sequelize.query(
    `DELETE FROM users
     WHERE id = :id
       AND NOT verifywise.user_has_organization_membership(:id)
       AND NOT EXISTS (SELECT 1 FROM super_admins WHERE user_id = :id)
     RETURNING id`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction },
  )) as { id: number }[];
  return { removed: true, accountDeleted: deleted.length > 0 };
};

/**
 * Deletes a user's account: clears every organization's references to them,
 * then deletes the user. Memberships, refresh tokens and a super_admins row go
 * with it (ON DELETE CASCADE).
 *
 * @returns false when the user does not exist.
 */
export const deleteUserAccountQuery = async (
  id: number,
  transaction: Transaction,
): Promise<boolean> => {
  const memberships = (await sequelize.query(
    `SELECT organization_id FROM organization_members WHERE user_id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction },
  )) as { organization_id: number }[];
  for (const { organization_id } of memberships) {
    await clearOrganizationReferencesToUser(id, organization_id, transaction);
  }

  const deleted = (await sequelize.query(`DELETE FROM users WHERE id = :id RETURNING id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  })) as { id: number }[];
  return deleted.length > 0;
};

/**
 * Checks if any user exists in the database.
 *
 * This function executes a SQL query to count the number of users in the `users` table.
 * It returns a promise that resolves to a boolean indicating whether any user exists.
 *
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether any user exists.
 *
 * @example
 * const userExists = await checkUserExistsQuery();
 *
 * @throws {Error} If there is an error executing the SQL query.
 */
export const checkUserExistsQuery = async (): Promise<boolean> => {
  try {
    const result = await sequelize.query<{ count: number }>("SELECT COUNT(*) FROM users", {
      type: QueryTypes.SELECT,
    });
    return result[0].count > 0;
  } catch (error) {
    console.error("Error checking user existence:", error);
    throw error;
  }
};

export const getUserProjects = async (userId: number, organizationId: number) => {
  const result = await sequelize.query(
    `SELECT p.* FROM projects p
     INNER JOIN projects_members pm ON p.id = pm.project_id AND pm.organization_id = :organizationId
     WHERE p.organization_id = :organizationId AND pm.user_id = :user_id`,
    {
      replacements: { user_id: userId, organizationId },
      mapToModel: true,
      model: ProjectModel,
    },
  );
  result.forEach((project) => withLegacyHighRiskRole(project));
  return result;
};

export const getControlCategoriesForProject = async (id: number) => {
  const result = await sequelize.query(
    "SELECT id FROM controlcategories WHERE project_id = :project_id",
    {
      replacements: { project_id: id },
      mapToModel: true,
      model: ControlCategoryModel,
    },
  );
  return result;
};

export const getControlForControlCategory = async (id: number) => {
  const result = await sequelize.query(
    "SELECT id FROM controls WHERE control_category_id = :control_category_id",
    {
      replacements: { control_category_id: id },
      mapToModel: true,
      model: ControlModel,
    },
  );
  return result;
};

export const getSubControlForControl = async (id: number) => {
  const result = await sequelize.query("SELECT * FROM subcontrols WHERE control_id = :control_id", {
    replacements: { control_id: id },
    mapToModel: true,
    model: SubcontrolModel,
  });
  return result;
};

export const getAssessmentsForProject = async (id: number) => {
  const result = await sequelize.query(
    "SELECT id FROM assessments WHERE project_id = :project_id",
    {
      replacements: { project_id: id },
      mapToModel: true,
      model: AssessmentModel,
    },
  );
  return result;
};

export const getTopicsForAssessment = async (id: number) => {
  const result = await sequelize.query(
    "SELECT id FROM topics WHERE assessment_id = :assessment_id",
    {
      replacements: { assessment_id: id },
      mapToModel: true,
      model: TopicModel,
    },
  );
  return result;
};

export const getSubTopicsForTopic = async (id: number) => {
  const result = await sequelize.query("SELECT id FROM subtopics WHERE topic_id = :topic_id", {
    replacements: { topic_id: id },
    mapToModel: true,
    model: SubtopicModel,
  });
  return result;
};

export const getQuestionsForSubTopic = async (id: number) => {
  const result = await sequelize.query("SELECT * FROM questions WHERE subtopic_id = :subtopic_id", {
    replacements: { subtopic_id: id },
    mapToModel: true,
    model: QuestionModel,
  });
  return result;
};

export const uploadUserProfilePhotoQuery = async (
  userId: number,
  fileId: number,
  organizationId: number,
  transaction: Transaction,
) => {
  // Get current profile photo ID if exists
  const getPhotoQuery = `SELECT profile_photo_id FROM users WHERE id = :userId;`;
  const currentPhoto = (await sequelize.query(getPhotoQuery, {
    replacements: { userId },
    transaction,
  })) as [{ profile_photo_id: number | null }[], number];
  const deleteFileId = currentPhoto[0][0]?.profile_photo_id;

  // Update user's profile_photo_id
  const updatePhotoQuery = `UPDATE users SET profile_photo_id = :fileId WHERE id = :userId RETURNING profile_photo_id;`;
  const result = (await sequelize.query(updatePhotoQuery, {
    replacements: { fileId, userId },
    transaction,
  })) as [{ profile_photo_id: number }[], number];

  // Delete old file if it exists
  if (deleteFileId) {
    await deleteFileById(deleteFileId, organizationId, transaction);
  }

  return result[0][0];
};

export const getUserProfilePhotoQuery = async (userId: number, organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT f.content, f.type
     FROM users u
     INNER JOIN files f ON u.profile_photo_id = f.id AND f.organization_id = :organizationId
     WHERE u.id = :userId
     LIMIT 1;`,
    { replacements: { userId, organizationId } },
  )) as [{ content: Buffer; type: string }[], number];

  return result[0][0] || null;
};

export const deleteUserProfilePhotoQuery = async (
  userId: number,
  organizationId: number,
  transaction: Transaction,
) => {
  // Get current profile photo ID
  const currentPhoto = (await sequelize.query(
    `SELECT profile_photo_id FROM users WHERE id = :userId;`,
    { replacements: { userId }, transaction },
  )) as [{ profile_photo_id: number | null }[], number];

  const deleteFileId = currentPhoto[0][0]?.profile_photo_id;

  // Set profile_photo_id to NULL
  const result = (await sequelize.query(
    `UPDATE users SET profile_photo_id = NULL WHERE id = :userId RETURNING profile_photo_id;`,
    { replacements: { userId }, transaction },
  )) as [{ profile_photo_id: number | null }[], number];

  // Delete the file if it exists
  let deleted = false;
  if (deleteFileId) {
    deleted = await deleteFileById(deleteFileId, organizationId, transaction);
  }

  return deleted && result[0][0].profile_photo_id === null;
};

/**
 * Removes one organization's demo users.
 *
 * Scoped by organization: removing demo data from one org must never touch
 * another org's users. A demo user who is also a member of another
 * organization keeps their account and that membership.
 *
 * @param organizationId - The organization whose demo users are removed.
 * @param transaction - The database transaction to use.
 * @returns A promise that resolves when the demo users are removed.
 */
export const deleteDemoUsersQuery = async (
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  const demoUsers = (await sequelize.query(
    `SELECT u.id
       FROM users u
       JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
      WHERE u.is_demo = true`,
    { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
  )) as { id: number }[];
  if (demoUsers.length === 0) return;
  const userIds = demoUsers.map((u) => Number(u.id));

  await reassignAgentOwnersOfDeletedUsersQuery(userIds, organizationId, transaction);
  await sequelize.query(
    `DELETE FROM organization_members
     WHERE organization_id = :organizationId AND user_id IN (:userIds)`,
    { replacements: { organizationId, userIds }, transaction },
  );
  // See removeUserFromOrganizationQuery: a plain NOT EXISTS is blind to other
  // organizations under RLS enforcement.
  await sequelize.query(
    `DELETE FROM users u
     WHERE u.id IN (:userIds)
       AND NOT verifywise.user_has_organization_membership(u.id)`,
    { replacements: { userIds }, transaction },
  );
};
