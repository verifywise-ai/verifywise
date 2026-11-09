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
  transaction: Transaction | null = null,
): Promise<"already_member" | "super_admin" | null> => {
  // "Any membership" goes through the helper: under RLS enforcement a join on
  // organization_members only sees the inviting organization's rows, so a
  // member of other organizations only would look like a pure super admin.
  const rows = (await sequelize.query(
    `SELECT verifywise.user_has_organization_membership(u.id) AS has_membership,
            EXISTS (
              SELECT 1 FROM organization_members om
               WHERE om.user_id = u.id AND om.organization_id = :organizationId
            ) AS in_organization
       FROM users u
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(:email))`,
    {
      replacements: { email, organizationId },
      type: QueryTypes.SELECT,
      ...(transaction ? { transaction } : {}),
    },
  )) as { has_membership: boolean; in_organization: boolean }[];

  if (rows.length === 0) return null;
  if (rows.every((r) => !r.has_membership)) return "super_admin";
  if (rows.some((r) => r.in_organization)) return "already_member";
  return null;
};
