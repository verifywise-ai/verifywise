import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

/**
 * MRM org-wide settings (mrm_org_settings). One row per org, lazily created —
 * a missing row means defaults. Holds the metric-retention window and the
 * alert configuration (email delivery, breach auto-open-finding).
 */

export const DEFAULT_RETENTION_MONTHS = 25;
// Floor: never below a one-year examiner cycle + margin (SR 26-2 / SS1/23 / OSFI E-23).
export const MIN_RETENTION_MONTHS = 13;

export interface MrmOrgSettings {
  organization_id: number;
  retention_months: number;
  alert_email_enabled: boolean;
  breach_auto_open_finding: boolean;
}

export interface MrmOrgSettingsUpdate {
  retention_months?: number;
  alert_email_enabled?: boolean;
  breach_auto_open_finding?: boolean;
}

/** Read the org's MRM settings; a missing row resolves to defaults. */
export const getMrmOrgSettings = async (organizationId: number): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, retention_months, alert_email_enabled, breach_auto_open_finding
       FROM mrm_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as MrmOrgSettings[];
  return (
    rows[0] ?? {
      organization_id: organizationId,
      retention_months: DEFAULT_RETENTION_MONTHS,
      alert_email_enabled: false,
      breach_auto_open_finding: false,
    }
  );
};

/**
 * Create-or-update the org's MRM settings row with PARTIAL semantics: only the
 * fields present in `update` change; absent fields keep their current value
 * (or the column default on first insert). Caller validates the values.
 */
export const upsertMrmOrgSettings = async (
  organizationId: number,
  update: MrmOrgSettingsUpdate,
  transaction?: Transaction,
): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `INSERT INTO mrm_org_settings
       (organization_id, retention_months, alert_email_enabled, breach_auto_open_finding)
     VALUES
       (:organizationId,
        COALESCE(:retentionMonths, ${DEFAULT_RETENTION_MONTHS}),
        COALESCE(:alertEmailEnabled, false),
        COALESCE(:breachAutoOpenFinding, false))
     ON CONFLICT (organization_id)
     DO UPDATE SET
       retention_months = COALESCE(:retentionMonths, mrm_org_settings.retention_months),
       alert_email_enabled = COALESCE(:alertEmailEnabled, mrm_org_settings.alert_email_enabled),
       breach_auto_open_finding = COALESCE(:breachAutoOpenFinding, mrm_org_settings.breach_auto_open_finding),
       updated_at = now()
     RETURNING organization_id, retention_months, alert_email_enabled, breach_auto_open_finding`,
    {
      replacements: {
        organizationId,
        retentionMonths: update.retention_months ?? null,
        alertEmailEnabled: update.alert_email_enabled ?? null,
        breachAutoOpenFinding: update.breach_auto_open_finding ?? null,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as MrmOrgSettings[];
  return rows[0];
};
