/**
 * Shadow AI Configuration Utils
 *
 * Database queries for syslog config and department sensitivity.
 */

import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { IShadowAiSyslogConfig, IShadowAiSettings } from "../domain.layer/interfaces/i.shadowAi";

// ─── Syslog Config ─────────────────────────────────────────────────────

/**
 * Get all syslog configurations for an organization.
 */
export async function getSyslogConfigsQuery(
  organizationId: number,
): Promise<IShadowAiSyslogConfig[]> {
  const [rows] = await sequelize.query(
    `SELECT * FROM shadow_ai_syslog_config
     WHERE organization_id = :organizationId
     ORDER BY created_at DESC`,
    { replacements: { organizationId } },
  );

  return rows as IShadowAiSyslogConfig[];
}

/**
 * Create a new syslog configuration.
 */
export async function createSyslogConfigQuery(
  organizationId: number,
  config: {
    source_identifier: string;
    parser_type: string;
    is_active: boolean;
  },
  transaction?: Transaction,
): Promise<IShadowAiSyslogConfig> {
  const [result] = await sequelize.query(
    `INSERT INTO shadow_ai_syslog_config
       (organization_id, source_identifier, parser_type, is_active)
     VALUES
       (:organizationId, :source_identifier, :parser_type, :is_active)
     RETURNING *`,
    {
      replacements: {
        organizationId,
        source_identifier: config.source_identifier,
        parser_type: config.parser_type,
        is_active: config.is_active,
      },
      ...(transaction ? { transaction } : {}),
    },
  );

  return (result as IShadowAiSyslogConfig[])[0];
}

/**
 * Update a syslog configuration.
 */
export async function updateSyslogConfigQuery(
  organizationId: number,
  configId: number,
  updates: {
    source_identifier?: string;
    parser_type?: string;
    is_active?: boolean;
  },
  transaction?: Transaction,
): Promise<IShadowAiSyslogConfig | null> {
  const setClauses: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, configId };

  if (updates.source_identifier !== undefined) {
    setClauses.push("source_identifier = :source_identifier");
    replacements.source_identifier = updates.source_identifier;
  }
  if (updates.parser_type !== undefined) {
    setClauses.push("parser_type = :parser_type");
    replacements.parser_type = updates.parser_type;
  }
  if (updates.is_active !== undefined) {
    setClauses.push("is_active = :is_active");
    replacements.is_active = updates.is_active;
  }

  if (setClauses.length === 0) return null;

  const [result] = await sequelize.query(
    `UPDATE shadow_ai_syslog_config
     SET ${setClauses.join(", ")}
     WHERE organization_id = :organizationId AND id = :configId
     RETURNING *`,
    {
      replacements,
      ...(transaction ? { transaction } : {}),
    },
  );

  const rows = result as IShadowAiSyslogConfig[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Delete a syslog configuration.
 */
export async function deleteSyslogConfigQuery(
  organizationId: number,
  configId: number,
  transaction?: Transaction,
): Promise<boolean> {
  const [rows] = await sequelize.query(
    `DELETE FROM shadow_ai_syslog_config WHERE organization_id = :organizationId AND id = :configId
     RETURNING id`,
    {
      replacements: { organizationId, configId },
      ...(transaction ? { transaction } : {}),
    },
  );

  return (rows as any[]).length > 0;
}

// ─── Settings ──────────────────────────────────────────────────────

/** Settings an organization has before it saves any (match the column defaults). */
export const SHADOW_AI_SETTINGS_DEFAULTS = {
  rate_limit_max_events_per_hour: 0,
  retention_events_days: 30,
  retention_daily_rollups_days: 365,
  retention_alert_history_days: 90,
} as const;

/**
 * Get organization settings, or the defaults when the organization has not
 * saved any yet.
 */
export async function getSettingsQuery(organizationId: number): Promise<IShadowAiSettings> {
  const [rows] = await sequelize.query(
    `SELECT * FROM shadow_ai_settings WHERE organization_id = :organizationId`,
    { replacements: { organizationId } },
  );

  if ((rows as any[]).length === 0) {
    return { ...SHADOW_AI_SETTINGS_DEFAULTS };
  }

  return (rows as IShadowAiSettings[])[0];
}

/**
 * Read the organization's settings inside `transaction`, holding a row lock
 * until it ends, so a concurrent save cannot change them between this read and
 * the caller's update. A missing row is first created with the column
 * defaults, so there is always a row to lock.
 */
export async function lockShadowAiSettings(
  organizationId: number,
  transaction: Transaction,
): Promise<IShadowAiSettings> {
  await sequelize.query(
    `INSERT INTO shadow_ai_settings (organization_id)
     VALUES (:organizationId)
     ON CONFLICT (organization_id) DO NOTHING`,
    { replacements: { organizationId }, transaction },
  );
  const [rows] = await sequelize.query(
    `SELECT * FROM shadow_ai_settings
      WHERE organization_id = :organizationId
      FOR UPDATE`,
    { replacements: { organizationId }, transaction },
  );
  return (rows as IShadowAiSettings[])[0];
}

/** Clamp a submitted value at 0; undefined (not submitted) becomes null. */
function nonNegativeOrNull(value: number | undefined): number | null {
  return value === undefined ? null : Math.max(0, value);
}

/**
 * Save organization settings. Creates the row on the first save (missing
 * fields take the defaults); afterwards only the submitted fields change.
 */
export async function updateSettingsQuery(
  organizationId: number,
  updates: Partial<Omit<IShadowAiSettings, "id" | "updated_at">>,
  transaction?: Transaction,
): Promise<IShadowAiSettings> {
  const replacements = {
    organizationId,
    rate_limit: nonNegativeOrNull(updates.rate_limit_max_events_per_hour),
    ret_events: nonNegativeOrNull(updates.retention_events_days),
    ret_rollups: nonNegativeOrNull(updates.retention_daily_rollups_days),
    ret_alerts: nonNegativeOrNull(updates.retention_alert_history_days),
    updated_by: updates.updated_by ?? null,
    default_rate_limit: SHADOW_AI_SETTINGS_DEFAULTS.rate_limit_max_events_per_hour,
    default_ret_events: SHADOW_AI_SETTINGS_DEFAULTS.retention_events_days,
    default_ret_rollups: SHADOW_AI_SETTINGS_DEFAULTS.retention_daily_rollups_days,
    default_ret_alerts: SHADOW_AI_SETTINGS_DEFAULTS.retention_alert_history_days,
  };

  // A NULL replacement means "not submitted": the insert takes the default and
  // the update keeps the stored value.
  const [result] = await sequelize.query(
    `INSERT INTO shadow_ai_settings AS s (
       organization_id,
       rate_limit_max_events_per_hour,
       retention_events_days,
       retention_daily_rollups_days,
       retention_alert_history_days,
       updated_by,
       updated_at
     ) VALUES (
       :organizationId,
       COALESCE(:rate_limit, :default_rate_limit),
       COALESCE(:ret_events, :default_ret_events),
       COALESCE(:ret_rollups, :default_ret_rollups),
       COALESCE(:ret_alerts, :default_ret_alerts),
       :updated_by,
       NOW()
     )
     ON CONFLICT (organization_id) DO UPDATE SET
       rate_limit_max_events_per_hour = COALESCE(:rate_limit, s.rate_limit_max_events_per_hour),
       retention_events_days = COALESCE(:ret_events, s.retention_events_days),
       retention_daily_rollups_days = COALESCE(:ret_rollups, s.retention_daily_rollups_days),
       retention_alert_history_days = COALESCE(:ret_alerts, s.retention_alert_history_days),
       updated_by = COALESCE(:updated_by, s.updated_by),
       updated_at = NOW()
     RETURNING *`,
    {
      replacements,
      ...(transaction ? { transaction } : {}),
    },
  );

  return (result as IShadowAiSettings[])[0];
}
