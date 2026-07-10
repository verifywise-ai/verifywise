import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

/**
 * MRM org-wide settings (mrm_org_settings). One row per org, lazily created —
 * a missing row means defaults. Currently holds only the metric-retention
 * window; future MRM-wide config (alert recipients/channels) belongs here too.
 */

export const DEFAULT_RETENTION_MONTHS = 25;
// Floor: never below a one-year examiner cycle + margin (SR 26-2 / SS1/23 / OSFI E-23).
export const MIN_RETENTION_MONTHS = 13;

export interface MrmOrgSettings {
  organization_id: number;
  retention_months: number;
}

/** Read the org's MRM settings; a missing row resolves to defaults. */
export const getMrmOrgSettings = async (organizationId: number): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, retention_months
       FROM mrm_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as MrmOrgSettings[];
  return rows[0] ?? { organization_id: organizationId, retention_months: DEFAULT_RETENTION_MONTHS };
};

/** Create-or-update the org's MRM settings row. Caller validates the value. */
export const upsertMrmOrgSettings = async (
  organizationId: number,
  retentionMonths: number,
): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `INSERT INTO mrm_org_settings (organization_id, retention_months)
     VALUES (:organizationId, :retentionMonths)
     ON CONFLICT (organization_id)
     DO UPDATE SET retention_months = EXCLUDED.retention_months, updated_at = now()
     RETURNING organization_id, retention_months`,
    {
      replacements: { organizationId, retentionMonths },
      type: QueryTypes.SELECT,
    },
  )) as MrmOrgSettings[];
  return rows[0];
};
