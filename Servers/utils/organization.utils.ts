/**
 * @file organization.util.ts
 * @description This file contains utility functions for performing CRUD operations on the 'organizations' table in the database.
 *
 * The functions included are:
 * - `getAllOrganizationsQuery`: Fetches all organizations from the database.
 * - `getOrganizationByIdQuery`: Fetches an organization by its ID.
 * - `createOrganizationQuery`: Creates a new organization in the database.
 * - `updateOrganizationByIdQuery`: Updates organization details by its ID.
 * - `deleteOrganizationByIdQuery`: Deletes an organization by its ID.
 * - `getOrganizationMembersQuery`: Fetches members of an organization.
 * - `getOrganizationProjectsQuery`: Fetches projects of an organization.
 * - `addMemberToOrganizationQuery`: Adds a member to an organization.
 * - `removeMemberFromOrganizationQuery`: Removes a member from an organization.
 * - `addProjectToOrganizationQuery`: Adds a project to an organization.
 * - `removeProjectFromOrganizationQuery`: Removes a project from an organization.
 *
 * Each function interacts with the database using SQL queries and returns the result.
 *
 * @module utils/organization.util
 */

import { OrganizationModel } from "../domain.layer/models/organization/organization.model";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { createHash } from "crypto";

/**
 * Generates a tenant hash from organization ID.
 * This is used for backward compatibility and identifying old tenant schemas.
 */
const generateTenantId = (orgId: number): string => {
  const hash = createHash('sha256').update(orgId.toString()).digest('base64');
  return hash.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
};

/**
 * Retrieves all organizations from the database.
 *
 * This function executes a SQL query to select all records from the `organizations` table.
 * It returns a promise that resolves to an array of `Organization` objects.
 *
 * @returns {Promise<Organization[]>} A promise that resolves to an array of `Organization` objects.
 *
 * @throws {Error} If there is an error executing the SQL query.
 */
export const getAllOrganizationsQuery = async (
  transaction: Transaction | null = null
): Promise<OrganizationModel[]> => {
  const organizations = await sequelize.query(
    "SELECT * FROM organizations ORDER BY created_at DESC, id ASC",
    {
      mapToModel: true,
      model: OrganizationModel,
      ...(transaction && { transaction }),
    }
  );
  return organizations;
};

export const getOrganizationsExistsQuery = async () => {
  const result = await sequelize.query(
    "SELECT COUNT(*) > 0 AS exists FROM organizations"
  ) as [{ exists: boolean }[], number];
  return result[0][0];
}

/**
 * Retrieves an organization from the database by its unique identifier.
 *
 * @param {number} id - The unique identifier of the organization.
 * @returns {Promise<Organization | null>} A promise that resolves to the organization object or null if not found.
 *
 * @throws {Error} If the query fails.
 */
export const getOrganizationByIdQuery = async (
  id: number
): Promise<OrganizationModel | null> => {
  const result = await sequelize.query(
    "SELECT * FROM organizations WHERE id = :id",
    {
      replacements: { id },
      mapToModel: true,
      model: OrganizationModel,
    }
  );
  return result[0] || null;
};

/**
 * Retrieves an organization from the database by its tenant_id (hash).
 * Used for public endpoints like AI Trust Centre where the hash is in the URL.
 *
 * @param {string} tenantHash - The tenant hash (tenant_id) of the organization.
 * @returns {Promise<OrganizationModel | null>} A promise that resolves to the organization object or null if not found.
 */
export const getOrganizationByTenantHashQuery = async (
  tenantHash: string
): Promise<OrganizationModel | null> => {
  const result = await sequelize.query(
    "SELECT * FROM organizations WHERE tenant_id = :tenantHash",
    {
      replacements: { tenantHash },
      mapToModel: true,
      model: OrganizationModel,
    }
  );
  return result[0] || null;
};

/**
 * Creates a new organization in the database.
 *
 * @param organization - An object containing the organization details.
 * @param transaction - The transaction object for database operations.
 * @returns A promise that resolves to the newly created organization object.
 *
 * @throws Will throw an error if the database query fails.
 */
export const createOrganizationQuery = async (
  organization: Partial<OrganizationModel>,
  transaction: Transaction
): Promise<OrganizationModel> => {
  // Generate a unique slug for the organization
  const slug = Math.random().toString(36).substring(2, 10);

  // First insert without tenant_id to get the ID
  const result = await sequelize.query(
    `INSERT INTO organizations(name, logo, created_at, slug)
     VALUES (:name, :logo, :created_at, :slug) RETURNING *`,
    {
      replacements: {
        name: organization.name,
        logo: organization.logo || null,
        created_at: new Date(),
        slug,
      },
      mapToModel: true,
      model: OrganizationModel,
      transaction,
    }
  );

  const createdOrg = result[0];

  // Generate and set tenant_id based on the organization ID
  const tenantId = generateTenantId(createdOrg.id!);
  await sequelize.query(
    `UPDATE organizations SET tenant_id = :tenantId WHERE id = :id`,
    {
      replacements: { tenantId, id: createdOrg.id },
      transaction,
    }
  );

  // Return organization with tenant_id
  createdOrg.tenant_id = tenantId;
  return createdOrg;
};

/**
 * Updates an organization in the database by its ID.
 *
 * @param id - The ID of the organization to update.
 * @param organization - The organization data to update.
 * @param transaction - The transaction object for database operations.
 * @returns A promise that resolves to the updated organization object or null if not found.
 *
 * @throws Will throw an error if the database query fails.
 */
export const updateOrganizationByIdQuery = async (
  id: number,
  organization: Partial<OrganizationModel>,
  transaction: Transaction
): Promise<OrganizationModel | null> => {
  const updateOrg: Partial<Record<keyof OrganizationModel, any>> = {};
  const updateFields = ["name", "logo"];

  const setClause = updateFields
    .filter((field) => {
      if (organization[field as keyof OrganizationModel] !== undefined) {
        updateOrg[field as keyof OrganizationModel] =
          organization[field as keyof OrganizationModel];
        return true;
      }
      return false;
    })
    .map((field) => `${field} = :${field}`)
    .join(", ");

  if (!setClause) {
    return getOrganizationByIdQuery(id); // No fields to update, return current state
  }

  updateOrg.id = id;

  const query = `UPDATE organizations SET ${setClause} WHERE id = :id RETURNING *`;

  const result = await sequelize.query(query, {
    replacements: updateOrg,
    mapToModel: true,
    model: OrganizationModel,
    transaction,
  });

  return result[0] || null;
};

/**
 * Deletes an organization from the database by its ID.
 *
 * @param id - The ID of the organization to delete.
 * @param transaction - The transaction object for database operations.
 * @returns A promise that resolves to a boolean indicating if the organization was deleted.
 *
 * @throws Will throw an error if the database query fails.
 */
export const deleteOrganizationByIdQuery = async (
  id: number,
  transaction: Transaction
): Promise<boolean> => {
  const result = await sequelize.query(
    `DELETE FROM organizations WHERE id = :id RETURNING *`,
    {
      replacements: { id },
      mapToModel: true,
      model: OrganizationModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};
