import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

/**
 * One person's dashboard layout in one organization (dashboard_preferences).
 * Lazily created; a missing row means the default layout. Every query is keyed
 * by both the user and the organization, which the caller takes from the JWT.
 */

export interface DashboardLayoutEntry {
  widgetKey: string;
  visible: boolean;
  position: number;
}

export interface DashboardPreferences {
  layout: DashboardLayoutEntry[];
  updated_at: string;
}

/** The user's saved layout in this organization, or null when there is none. */
export const getDashboardPreferences = async (
  userId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<DashboardPreferences | null> => {
  const rows = (await sequelize.query(
    `SELECT layout, updated_at
       FROM dashboard_preferences
      WHERE user_id = :userId AND organization_id = :organizationId
      LIMIT 1`,
    { replacements: { userId, organizationId }, type: QueryTypes.SELECT, transaction },
  )) as DashboardPreferences[];
  return rows[0] ?? null;
};

/** Create or replace the user's layout in this organization. */
export const upsertDashboardPreferences = async (
  userId: number,
  organizationId: number,
  layout: DashboardLayoutEntry[],
  transaction?: Transaction,
): Promise<DashboardPreferences> => {
  const rows = (await sequelize.query(
    `INSERT INTO dashboard_preferences (user_id, organization_id, layout)
     VALUES (:userId, :organizationId, CAST(:layout AS jsonb))
     ON CONFLICT (user_id, organization_id)
     DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()
     RETURNING layout, updated_at`,
    {
      replacements: { userId, organizationId, layout: JSON.stringify(layout) },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as DashboardPreferences[];
  return rows[0];
};
