import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

export interface SuperAdminRow {
  user_id: number;
  name: string;
  surname: string;
  email: string;
  /** Empty for a pure super admin. */
  organizations: {
    organization_id: number;
    organization_name: string;
    role_id: number;
    role_name: string;
  }[];
}

export async function isUserSuperAdmin(userId: number): Promise<boolean> {
  const [row] = await sequelize.query<{ exists: number }>(
    `SELECT 1 AS exists FROM super_admins WHERE user_id = :userId LIMIT 1`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  return !!row;
}

export async function countSuperAdmins(): Promise<number> {
  const [row] = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM super_admins`,
    { type: QueryTypes.SELECT },
  );
  return parseInt(row?.count ?? "0", 10);
}

export async function listSuperAdmins(): Promise<SuperAdminRow[]> {
  return (await sequelize.query(
    `SELECT sa.user_id,
            u.name, u.surname, u.email,
            COALESCE(
              (SELECT json_agg(
                        json_build_object(
                          'organization_id', om.organization_id,
                          'organization_name', o.name,
                          'role_id', om.role_id,
                          'role_name', r.name
                        )
                        ORDER BY o.name, om.organization_id
                      )
                 FROM organization_members om
                 JOIN organizations o ON o.id = om.organization_id
                 JOIN roles r ON r.id = om.role_id
                WHERE om.user_id = sa.user_id),
              '[]'::json
            ) AS organizations
     FROM super_admins sa
     JOIN users u ON u.id = sa.user_id
     ORDER BY u.name ASC, u.surname ASC`,
    { type: QueryTypes.SELECT },
  )) as SuperAdminRow[];
}

export interface OrganizationRow {
  id: number;
  name: string;
  logo: string | null;
  created_at: string;
  onboarding_status: string | null;
  user_count: string;
}

/**
 * Every organization on this deployment, newest first.
 *
 * Cross-org by design: this is the super-admin view, so there is no
 * organization_id filter. Called from both the super-admin console controller
 * and the MCP tool of the same name, which is why it lives here rather than
 * inline in either.
 */
export async function listOrganizationsQuery(): Promise<OrganizationRow[]> {
  return (await sequelize.query(
    `SELECT o.id, o.name, o.logo, o.created_at, o.onboarding_status,
            (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS user_count
     FROM organizations o
     ORDER BY o.created_at DESC`,
    { type: QueryTypes.SELECT },
  )) as OrganizationRow[];
}

export interface UserRow {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id: number | null;
  role_name: string | null;
  organization_id?: number | null;
  organization_name?: string | null;
  created_at: string;
  last_login: string | null;
}

/**
 * Every organization membership, newest user first: a user in several
 * organizations has one row per organization.
 *
 * Pure super admins (no membership) are excluded: they have no organization
 * membership to report and are not editable through this surface.
 */
export async function listAllUsersQuery(): Promise<UserRow[]> {
  return (await sequelize.query(
    `SELECT u.id, u.name, u.surname, u.email, om.role_id, r.name as role_name,
            om.organization_id, o.name as organization_name,
            u.created_at, u.last_login
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     JOIN roles r ON r.id = om.role_id
     JOIN organizations o ON o.id = om.organization_id
     ORDER BY u.created_at DESC, u.id ASC, o.name ASC`,
    { type: QueryTypes.SELECT },
  )) as UserRow[];
}

/** The users of one organization, oldest first. */
export async function listOrganizationUsersQuery(organizationId: number): Promise<UserRow[]> {
  return (await sequelize.query(
    `SELECT u.id, u.name, u.surname, u.email, om.role_id, r.name as role_name,
            u.created_at, u.last_login
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     JOIN roles r ON r.id = om.role_id
     WHERE om.organization_id = :organizationId
     ORDER BY u.created_at ASC`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as UserRow[];
}

/** Whether an organization row exists. */
export async function organizationExists(organizationId: number): Promise<boolean> {
  const rows = await sequelize.query(`SELECT 1 FROM organizations WHERE id = :organizationId`, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });
  return rows.length > 0;
}

export async function grantSuperAdmin(userId: number, transaction?: Transaction): Promise<void> {
  await sequelize.query(
    `INSERT INTO super_admins (user_id) VALUES (:userId) ON CONFLICT DO NOTHING`,
    { replacements: { userId }, transaction },
  );
}

export async function revokeSuperAdmin(userId: number, transaction?: Transaction): Promise<void> {
  await sequelize.query(`DELETE FROM super_admins WHERE user_id = :userId`, {
    replacements: { userId },
    transaction,
  });
}
