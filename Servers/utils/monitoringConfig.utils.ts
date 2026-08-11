import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Instance-level observability configuration (single row, id = 1).
 *
 * Drives where every service pushes OpenTelemetry metrics/logs and the
 * `deployment.name` label used to distinguish managed deployments.
 */
export interface MonitoringConfig {
  enabled: boolean;
  otlp_endpoint: string | null;
  deployment_name: string | null;
  auth_header: string | null;
  updated_by: number | null;
  updated_at: string | null;
}

const DEFAULT_CONFIG: MonitoringConfig = {
  enabled: false,
  otlp_endpoint: null,
  deployment_name: null,
  auth_header: null,
  updated_by: null,
  updated_at: null,
};

/**
 * Read the monitoring config. Returns disabled defaults if the row/table is
 * missing (e.g. migrations not yet run) so callers never crash on startup.
 */
export const getMonitoringConfig = async (): Promise<MonitoringConfig> => {
  try {
    const rows = await sequelize.query(
      `SELECT enabled, otlp_endpoint, deployment_name, auth_header, updated_by, updated_at
       FROM monitoring_config
       WHERE id = 1`,
      { type: QueryTypes.SELECT },
    );
    return (rows[0] as MonitoringConfig) ?? DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
};

export interface UpdateMonitoringConfigInput {
  enabled?: boolean;
  otlp_endpoint?: string | null;
  deployment_name?: string | null;
  auth_header?: string | null;
  updated_by?: number | null;
}

/**
 * Upsert the single monitoring config row and return the new state.
 */
export const upsertMonitoringConfig = async (
  input: UpdateMonitoringConfigInput,
): Promise<MonitoringConfig> => {
  await sequelize.query(
    `INSERT INTO monitoring_config (id, enabled, otlp_endpoint, deployment_name, auth_header, updated_by, updated_at)
     VALUES (1, :enabled, :otlp_endpoint, :deployment_name, :auth_header, :updated_by, NOW())
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       otlp_endpoint = EXCLUDED.otlp_endpoint,
       deployment_name = EXCLUDED.deployment_name,
       auth_header = EXCLUDED.auth_header,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    {
      replacements: {
        enabled: input.enabled ?? false,
        otlp_endpoint: input.otlp_endpoint ?? null,
        deployment_name: input.deployment_name ?? null,
        auth_header: input.auth_header ?? null,
        updated_by: input.updated_by ?? null,
      },
      type: QueryTypes.INSERT,
    },
  );
  return getMonitoringConfig();
};
