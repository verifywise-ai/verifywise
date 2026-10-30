/**
 * @file organizationMember.utils.ts
 * @description Queries on organization_members: which organizations a user
 * belongs to and the role they hold in each. A user can be a member of several
 * organizations; users itself holds identity only.
 *
 * @module utils/organizationMember.utils
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

export interface UserOrganization {
  organization_id: number;
  organization_name: string;
  role_id: number;
  role_name: string;
}

/** Every organization the user belongs to, with their role in it, by organization name. */
export const getUserOrganizationsQuery = async (
  userId: number,
  transaction: Transaction | null = null,
): Promise<UserOrganization[]> => {
  return (await sequelize.query(
    `SELECT om.organization_id, o.name AS organization_name, om.role_id, r.name AS role_name
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       JOIN roles r ON r.id = om.role_id
      WHERE om.user_id = :userId
      ORDER BY o.name ASC, om.organization_id ASC`,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
      ...(transaction ? { transaction } : {}),
    },
  )) as UserOrganization[];
};

export const addOrganizationMemberQuery = async (
  organizationId: number,
  userId: number,
  roleId: number,
  transaction: Transaction,
): Promise<void> => {
  await sequelize.query(
    `INSERT INTO organization_members (organization_id, user_id, role_id)
     VALUES (:organizationId, :userId, :roleId)`,
    { replacements: { organizationId, userId, roleId }, transaction },
  );
};

export const updateOrganizationMemberRoleQuery = async (
  organizationId: number,
  userId: number,
  roleId: number,
  transaction: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE organization_members SET role_id = :roleId
     WHERE organization_id = :organizationId AND user_id = :userId`,
    { replacements: { organizationId, userId, roleId }, transaction },
  );
};

/**
 * Why `email` cannot be invited into `organizationId`, or null when it can: a
 * new address, or an account that belongs only to other organizations.
 *
 * - `already_member`: the account is a member of this organization.
 * - `super_admin`: the account has no membership, so it is a pure super
 *   admin, which never joins an organization.
 */
export const inviteeRefusalQuery = async (
  organizationId: number,
  email: string,
): Promise<"already_member" | "super_admin" | null> => {
  const rows = (await sequelize.query(
    `SELECT om.organization_id
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(:email))`,
    { replacements: { email }, type: QueryTypes.SELECT },
  )) as { organization_id: number | null }[];

  if (rows.length === 0) return null;
  if (rows.every((r) => r.organization_id === null)) return "super_admin";
  if (rows.some((r) => r.organization_id === organizationId)) return "already_member";
  return null;
};
