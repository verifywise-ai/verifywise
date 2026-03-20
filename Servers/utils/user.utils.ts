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
 * - `deleteUserByIdQuery`: Deletes a user by their ID.
 *
 * Each function interacts with the database using SQL queries and returns the result.
 *
 * @module utils/user.utils
 */

import { UserModel } from "../domain.layer/models/user/user.model";
import { sequelize } from "../database/db";
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
import { AutomationModel } from "../domain.layer/models/automation/automation.model";

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
export const getAllUsersQuery = async (
  organization_id: number
): Promise<UserModel[]> => {
  const users = await sequelize.query(
    "SELECT * FROM users WHERE organization_id = :organization_id ORDER BY created_at DESC, id ASC",
    {
      replacements: { organization_id }, // Assuming you want to fetch users without filtering by organization
      mapToModel: true,
      model: UserModel,
    }
  );
  return users;
};

/**
 * Retrieves a user from the database by their email address.
 *
 * This function executes a SQL query to select a user from the `users` table
 * based on the provided email address. It returns a promise that resolves to
 * the user object or null if no user is found.
 *
 * @param {string} email - The email address of the user to retrieve.
 * @returns {Promise<User | null>} A promise that resolves to the user object or null.
 *
 * @throws {Error} If there is an error executing the SQL query.
 */
export const getUserByEmailQuery = async (
  email: string
): Promise<(UserModel & { role_name: string | null }) | null> => {
  try {
    const [userObj] = await sequelize.query(
      `
      SELECT users.*, roles.name AS role_name
      FROM users
      LEFT JOIN roles ON users.role_id = roles.id
      WHERE LOWER(users.email) = LOWER(:email)
      LIMIT 1
      `,
      {
        replacements: { email },
        type: QueryTypes.SELECT,
      }
    );

    if (!userObj) {
      // no user found
      return null;
    }

    const user = userObj as UserModel & { role_name: string | null };

    if (!user.role_name) {
      console.warn(`User ${email} has no assigned role`);
    }

    return user;
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
  transaction: Transaction | null = null
): Promise<UserModel> => {
  const users = await sequelize.query<UserModel>(
    "SELECT * FROM users WHERE id = :id",
    {
      replacements: { id },
      model: UserModel,
      mapToModel: true, // converts results into UserModel instances
      ...(transaction ? { transaction } : {}), // include transaction if provided
    }
  );

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
export const getUserByIdOrThrow = async (id: number): Promise<UserModel> => {
  const user = await getUserByIdQuery(id);
  if (!user) {
    throw new Error(`User not found with ID: ${id}`);
  }
  return user;
};

export const doesUserBelongsToOrganizationQuery = async (
  userId: number,
  organizationId: number
) => {
  const result = (await sequelize.query(
    "SELECT COUNT(*) > 0 AS belongs FROM users WHERE id = :userId AND organization_id = :organizationId",
    {
      replacements: { userId, organizationId },
    }
  )) as [{ belongs: boolean }[], number];
  return result[0][0];
};

/**
 * Creates a new user in the database.
 *
 * @param user - An object containing the user details, excluding the user ID.
 * @returns A promise that resolves to the newly created user object.
 *
 * @example
 * ```typescript
 * const newUser = await createNewUserQuery({
 *   name: "John Doe",
 *   email: "john.doe@example.com",
 *   password_hash: "hashed_password",
 *   role_id: 2,
 *   created_at: new Date(),
 *   last_login: new Date()
 * });
 * ```
 *
 * @throws Will throw an error if the database query fails.
 */
export const createNewUserQuery = async (
  user: Omit<UserModel, "id">,
  transaction: Transaction,
  is_demo: boolean = false
): Promise<UserModel> => {
  const { name, surname, email, password_hash, role_id, organization_id } =
    user;
  const created_at = new Date();
  const last_login = new Date();

  try {
    const result = await sequelize.query(
      `INSERT INTO users (name, surname, email, password_hash, role_id, created_at, last_login, is_demo, organization_id)
        VALUES (:name, :surname, :email, :password_hash, :role_id, :created_at, :last_login, :is_demo, :organization_id) RETURNING *`,
      {
        replacements: {
          name,
          surname,
          email,
          password_hash,
          role_id,
          created_at,
          last_login,
          is_demo,
          organization_id,
        },
        mapToModel: true,
        model: UserModel,
        // type: QueryTypes.INSERT
        transaction,
      }
    );

    return result[0];
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
  transaction: Transaction
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
    }
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
 *   password_hash: 'newhashedpassword',
 *   role_id: 1,
 *   last_login: new Date()
 * });
 */
export const updateUserByIdQuery = async (
  id: number,
  user: Partial<UserModel>,
  transaction: Transaction
): Promise<UserModel> => {
  const updateUser: Partial<Record<keyof UserModel, any>> = {};
  const setClause = ["name", "surname", "email", "role_id", "last_login"]
    .filter((f) => {
      if (
        user[f as keyof UserModel] !== undefined &&
        user[f as keyof UserModel]
      ) {
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
 * Deletes a user from the database by their ID.
 *
 * This function executes a SQL DELETE query to remove a user from the 'users' table
 * based on the provided user ID. It returns the deleted user's data.
 *
 * @param {string} id - The unique identifier of the user to be deleted.
 * @returns {Promise<User>} A promise that resolves to the deleted user's data.
 *
 * @throws {Error} If the query fails or the user does not exist.
 */
export const deleteUserByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
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
  ];

  for (let entry of usersFK) {
    await Promise.all(
      entry.fields.map(async (f) => {
        await sequelize.query(
          `UPDATE ${entry.table} SET ${f} = :x WHERE organization_id = :organizationId AND ${f} = :id`,
          {
            replacements: { x: null, id, organizationId },
            // type: QueryTypes.UPDATE
            transaction,
          }
        );
      })
    );
  }

  await sequelize.query(
    `DELETE FROM projects_members WHERE organization_id = :organizationId AND user_id = :user_id`,
    {
      replacements: { user_id: id, organizationId },
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  const result = await sequelize.query(
    "DELETE FROM users WHERE id = :id RETURNING *",
    {
      replacements: { id },
      mapToModel: true,
      model: UserModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
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
    const result = await sequelize.query<{ count: number }>(
      "SELECT COUNT(*) FROM users",
      {
        type: QueryTypes.SELECT,
      }
    );
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
    }
  );
  return result;
};

export const getControlCategoriesForProject = async (id: number) => {
  const result = await sequelize.query(
    "SELECT id FROM controlcategories WHERE project_id = :project_id",
    {
      replacements: { project_id: id },
      mapToModel: true,
      model: ControlCategoryModel,
    }
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
    }
  );
  return result;
};

export const getSubControlForControl = async (id: number) => {
  const result = await sequelize.query(
    "SELECT * FROM subcontrols WHERE control_id = :control_id",
    {
      replacements: { control_id: id },
      mapToModel: true,
      model: SubcontrolModel,
    }
  );
  return result;
};

export const getAssessmentsForProject = async (id: number) => {
  const result = await sequelize.query(
    "SELECT id FROM assessments WHERE project_id = :project_id",
    {
      replacements: { project_id: id },
      mapToModel: true,
      model: AssessmentModel,
    }
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
    }
  );
  return result;
};

export const getSubTopicsForTopic = async (id: number) => {
  const result = await sequelize.query(
    "SELECT id FROM subtopics WHERE topic_id = :topic_id",
    {
      replacements: { topic_id: id },
      mapToModel: true,
      model: SubtopicModel,
    }
  );
  return result;
};

export const getQuestionsForSubTopic = async (id: number) => {
  const result = await sequelize.query(
    "SELECT * FROM questions WHERE subtopic_id = :subtopic_id",
    {
      replacements: { subtopic_id: id },
      mapToModel: true,
      model: QuestionModel,
    }
  );
  return result;
};

export const uploadUserProfilePhotoQuery = async (
  userId: number,
  fileId: number,
  organizationId: number,
  transaction: Transaction
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

export const getUserProfilePhotoQuery = async (
  userId: number,
  organizationId: number
) => {
  const result = (await sequelize.query(
    `SELECT f.content, f.type
     FROM users u
     INNER JOIN files f ON u.profile_photo_id = f.id AND f.organization_id = :organizationId
     WHERE u.id = :userId
     LIMIT 1;`,
    { replacements: { userId, organizationId } }
  )) as [{ content: Buffer; type: string }[], number];

  return result[0][0] || null;
};

export const deleteUserProfilePhotoQuery = async (
  userId: number,
  organizationId: number,
  transaction: Transaction
) => {
  // Get current profile photo ID
  const currentPhoto = (await sequelize.query(
    `SELECT profile_photo_id FROM users WHERE id = :userId;`,
    { replacements: { userId }, transaction }
  )) as [{ profile_photo_id: number | null }[], number];

  const deleteFileId = currentPhoto[0][0]?.profile_photo_id;

  // Set profile_photo_id to NULL
  const result = (await sequelize.query(
    `UPDATE users SET profile_photo_id = NULL WHERE id = :userId RETURNING profile_photo_id;`,
    { replacements: { userId }, transaction }
  )) as [{ profile_photo_id: number | null }[], number];

  // Delete the file if it exists
  let deleted = false;
  if (deleteFileId) {
    deleted = await deleteFileById(deleteFileId, organizationId, transaction);
  }

  return deleted && result[0][0].profile_photo_id === null;
};

/**
 * Deletes all demo users from the database.
 *
 * @param transaction - The database transaction to use.
 * @returns A promise that resolves when the demo users are deleted.
 */
export const deleteDemoUsersQuery = async (
  transaction: Transaction
): Promise<void> => {
  await sequelize.query(
    `DELETE FROM users WHERE is_demo = true`,
    { transaction }
  );
};
