import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

export interface SuperAdminRow {
  user_id: number;
  name: string;
  surname: string;
  email: string;
  role_id: number | null;
  role_name: string | null;
  organization_id: number | null;
  organization_name: string | null;
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
            u.name, u.surname, u.email, u.role_id, r.name AS role_name,
            u.organization_id, o.name AS organization_name
     FROM super_admins sa
     JOIN users u ON u.id = sa.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN organizations o ON o.id = u.organization_id
     ORDER BY u.name ASC, u.surname ASC`,
    { type: QueryTypes.SELECT },
  )) as SuperAdminRow[];
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
