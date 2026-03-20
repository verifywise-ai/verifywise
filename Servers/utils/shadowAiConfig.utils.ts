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
  organizationId: number
): Promise<IShadowAiSyslogConfig[]> {
  const [rows] = await sequelize.query(
    `SELECT * FROM shadow_ai_syslog_config
     WHERE organization_id = :organizationId
     ORDER BY created_at DESC`,
    { replacements: { organizationId } }
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
  transaction?: Transaction
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
    }
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
  transaction?: Transaction
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
    }
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
  transaction?: Transaction
): Promise<boolean> {
  const [rows] = await sequelize.query(
    `DELETE FROM shadow_ai_syslog_config WHERE organization_id = :organizationId AND id = :configId
     RETURNING id`,
    {
      replacements: { organizationId, configId },
      ...(transaction ? { transaction } : {}),
    }
  );

  return (rows as any[]).length > 0;
}

// ─── Settings ──────────────────────────────────────────────────────

/**
 * Get organization settings (always returns a row — created by migration).
 */
export async function getSettingsQuery(
  organizationId: number
): Promise<IShadowAiSettings> {
  const [rows] = await sequelize.query(
    `SELECT * FROM shadow_ai_settings WHERE organization_id = :organizationId`,
    { replacements: { organizationId } }
  );

  // Return defaults if no row exists yet
  if ((rows as any[]).length === 0) {
    return {
      rate_limit_max_events_per_hour: 0,
      retention_events_days: 30,
      retention_daily_rollups_days: 365,
      retention_alert_history_days: 90,
    };
  }

  return (rows as IShadowAiSettings[])[0];
}

/**
 * Update organization settings.
 */
export async function updateSettingsQuery(
  organizationId: number,
  updates: Partial<Omit<IShadowAiSettings, "id" | "updated_at">>,
  transaction?: Transaction
): Promise<IShadowAiSettings> {
  const setClauses: string[] = ["updated_at = NOW()"];
  const replacements: Record<string, unknown> = { organizationId };

  if (updates.rate_limit_max_events_per_hour !== undefined) {
    setClauses.push("rate_limit_max_events_per_hour = :rate_limit");
    replacements.rate_limit = Math.max(0, updates.rate_limit_max_events_per_hour);
  }
  if (updates.retention_events_days !== undefined) {
    setClauses.push("retention_events_days = :ret_events");
    replacements.ret_events = Math.max(0, updates.retention_events_days);
  }
  if (updates.retention_daily_rollups_days !== undefined) {
    setClauses.push("retention_daily_rollups_days = :ret_rollups");
    replacements.ret_rollups = Math.max(0, updates.retention_daily_rollups_days);
  }
  if (updates.retention_alert_history_days !== undefined) {
    setClauses.push("retention_alert_history_days = :ret_alerts");
    replacements.ret_alerts = Math.max(0, updates.retention_alert_history_days);
  }
  if (updates.updated_by !== undefined) {
    setClauses.push("updated_by = :updated_by");
    replacements.updated_by = updates.updated_by;
  }

  const [result] = await sequelize.query(
    `UPDATE shadow_ai_settings
     SET ${setClauses.join(", ")}
     WHERE organization_id = :organizationId
     RETURNING *`,
    {
      replacements,
      ...(transaction ? { transaction } : {}),
    }
  );

  return (result as IShadowAiSettings[])[0];
}
