import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { ExtensionService } from "../../services/extension/extensionService";
import {
  assertSafeOutboundUrl,
  composeSafeOutboundUrl,
  UnsafeOutboundUrlError,
} from "../../utils/safeOutboundUrl";

/**
 * mlflow extension — talks to a user-configured MLflow tracking server and
 * mirrors runs into verifywise.mlflow_model_records.
 *
 * Configuration is stored in extension_enablements.configuration:
 *   tracking_server_url  (required)
 *   auth_method          (none | basic | token)
 *   username, password   (basic auth, `password` is is_secret → encrypted)
 *   api_token            (token auth, is_secret → encrypted)
 *   verify_ssl           (boolean, informational only — fetch() honours it)
 *   timeout              (number, seconds; not currently plumbed into fetch)
 */

export interface MLflowConfig {
  tracking_server_url?: string;
  auth_method?: "none" | "basic" | "token";
  username?: string;
  password?: string;
  api_token?: string;
  verify_ssl?: boolean;
  timeout?: number;
}

export interface MLflowTestConnectionResult {
  success: boolean;
  message: string;
  testedAt: string;
}

export interface MLflowSyncResult {
  success: boolean;
  modelCount: number;
  syncedAt: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Config accessor
// ---------------------------------------------------------------------------

export async function loadConfiguration(organizationId: number): Promise<MLflowConfig> {
  return (await ExtensionService.getRuntimeConfiguration("mlflow", organizationId)) as MLflowConfig;
}

function buildHeaders(config: MLflowConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.auth_method === "basic" && config.username && config.password) {
    const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  } else if (config.auth_method === "token" && config.api_token) {
    headers.Authorization = `Bearer ${config.api_token}`;
  }
  return headers;
}

// URL composition goes through utils/safeOutboundUrl.ts — that helper
// validates protocol, blocks cloud metadata endpoints, and trims trailing
// slashes with a bounded quantifier (ReDoS-safe). Every fetch below MUST
// use it.

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export async function testConnection(config: MLflowConfig): Promise<MLflowTestConnectionResult> {
  if (!config.tracking_server_url) {
    return {
      success: false,
      message: "Tracking server URL is required",
      testedAt: new Date().toISOString(),
    };
  }
  let url: string;
  try {
    url = composeSafeOutboundUrl(
      config.tracking_server_url,
      "/api/2.0/mlflow/experiments/search",
    );
  } catch (err) {
    return {
      success: false,
      message: err instanceof UnsafeOutboundUrlError ? err.message : String(err),
      testedAt: new Date().toISOString(),
    };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify({ max_results: 1 }),
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        message: `Server returned ${response.status}: ${text || "no details"}`,
        testedAt: new Date().toISOString(),
      };
    }
    await response.json();
    return {
      success: true,
      message: "Successfully connected to MLflow server",
      testedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Connection failed: ${err.message}`,
      testedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Sync (fetch experiments + runs, upsert into mlflow_model_records)
// ---------------------------------------------------------------------------

interface ExperimentInfo {
  name?: string;
  artifact_location?: string;
}

function transformRunToRecord(
  run: any,
  experimentsMap: Map<string, ExperimentInfo>,
): Record<string, unknown> | null {
  const runInfo = run.info || {};
  const runData = run.data || {};

  const tags: Record<string, string> = {};
  for (const t of runData.tags || []) {
    if (t.key && t.value !== undefined) tags[t.key] = String(t.value);
  }

  const modelName =
    tags["mlflow.runName"] ||
    tags["model_name"] ||
    tags["mlflow.project.entryPoint"] ||
    runInfo.run_name ||
    runInfo.run_id;
  if (!modelName) return null;

  const metrics: Record<string, number> = {};
  for (const m of runData.metrics || []) {
    if (m.key && m.value !== undefined) metrics[m.key] = Number(m.value);
  }

  const parameters: Record<string, string> = {};
  for (const p of runData.params || []) {
    if (p.key && p.value !== undefined) parameters[p.key] = String(p.value);
  }

  const experimentInfo = experimentsMap.get(runInfo.experiment_id);

  return {
    model_name: modelName,
    version: tags["version"] || runInfo.run_id?.substring(0, 8) || "1",
    lifecycle_stage: tags["mlflow.lifecycleStage"] || tags["stage"] || "None",
    run_id: runInfo.run_id ?? null,
    description: tags["mlflow.note.content"] ?? null,
    source: tags["mlflow.source.name"] ?? runInfo.artifact_uri ?? null,
    status: runInfo.status ?? null,
    tags,
    metrics,
    parameters,
    experiment_id: runInfo.experiment_id ?? null,
    experiment_name: experimentInfo?.name ?? null,
    artifact_location: experimentInfo?.artifact_location ?? null,
    training_status: runInfo.status ?? null,
    training_started_at: runInfo.start_time ? new Date(runInfo.start_time) : null,
    training_ended_at: runInfo.end_time ? new Date(runInfo.end_time) : null,
    source_version: tags["mlflow.source.git.commit"] ?? null,
    model_created_at: runInfo.start_time ? new Date(runInfo.start_time) : null,
    model_updated_at: runInfo.end_time ? new Date(runInfo.end_time) : null,
  };
}

async function upsertModelRecords(
  organizationId: number,
  records: Array<Record<string, unknown>>,
): Promise<void> {
  if (records.length === 0) return;
  const now = new Date();
  for (const r of records) {
    await sequelize.query(
      `INSERT INTO mlflow_model_records
         (organization_id, model_name, version, lifecycle_stage, run_id, description,
          source, status, tags, metrics, parameters, experiment_id, experiment_name,
          artifact_location, training_status, training_started_at, training_ended_at,
          source_version, model_created_at, model_updated_at, last_synced_at,
          created_at, updated_at)
       VALUES
         (:organization_id, :model_name, :version, :lifecycle_stage, :run_id, :description,
          :source, :status, CAST(:tags AS JSONB), CAST(:metrics AS JSONB),
          CAST(:parameters AS JSONB), :experiment_id, :experiment_name,
          :artifact_location, :training_status, :training_started_at, :training_ended_at,
          :source_version, :model_created_at, :model_updated_at, :last_synced_at,
          NOW(), NOW())
       ON CONFLICT (organization_id, model_name, version) DO UPDATE
       SET lifecycle_stage      = EXCLUDED.lifecycle_stage,
           run_id               = EXCLUDED.run_id,
           description          = EXCLUDED.description,
           source               = EXCLUDED.source,
           status               = EXCLUDED.status,
           tags                 = EXCLUDED.tags,
           metrics              = EXCLUDED.metrics,
           parameters           = EXCLUDED.parameters,
           experiment_id        = EXCLUDED.experiment_id,
           experiment_name      = EXCLUDED.experiment_name,
           artifact_location    = EXCLUDED.artifact_location,
           training_status      = EXCLUDED.training_status,
           training_started_at  = EXCLUDED.training_started_at,
           training_ended_at    = EXCLUDED.training_ended_at,
           source_version       = EXCLUDED.source_version,
           model_created_at     = EXCLUDED.model_created_at,
           model_updated_at     = EXCLUDED.model_updated_at,
           last_synced_at       = EXCLUDED.last_synced_at,
           updated_at           = NOW();`,
      {
        replacements: {
          organization_id: organizationId,
          model_name: r.model_name,
          version: r.version,
          lifecycle_stage: r.lifecycle_stage ?? null,
          run_id: r.run_id ?? null,
          description: r.description ?? null,
          source: r.source ?? null,
          status: r.status ?? null,
          tags: JSON.stringify(r.tags ?? {}),
          metrics: JSON.stringify(r.metrics ?? {}),
          parameters: JSON.stringify(r.parameters ?? {}),
          experiment_id: r.experiment_id ?? null,
          experiment_name: r.experiment_name ?? null,
          artifact_location: r.artifact_location ?? null,
          training_status: r.training_status ?? null,
          training_started_at: r.training_started_at ?? null,
          training_ended_at: r.training_ended_at ?? null,
          source_version: r.source_version ?? null,
          model_created_at: r.model_created_at ?? null,
          model_updated_at: r.model_updated_at ?? null,
          last_synced_at: now,
        },
      },
    );
  }
}

export async function syncModels(
  organizationId: number,
  config: MLflowConfig,
): Promise<MLflowSyncResult> {
  if (!config.tracking_server_url) {
    return {
      success: false,
      modelCount: 0,
      syncedAt: new Date().toISOString(),
      status: "failed: tracking server URL is required",
    };
  }

  const headers = buildHeaders(config);
  let baseUrl: string;
  try {
    baseUrl = assertSafeOutboundUrl(config.tracking_server_url);
  } catch (err) {
    return {
      success: false,
      modelCount: 0,
      syncedAt: new Date().toISOString(),
      status: `failed: ${err instanceof UnsafeOutboundUrlError ? err.message : String(err)}`,
    };
  }

  try {
    // 1. Experiments
    const experimentsResponse = await fetch(`${baseUrl}/api/2.0/mlflow/experiments/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ max_results: 1000 }),
    });
    if (!experimentsResponse.ok) {
      throw new Error(`Failed to fetch experiments: ${experimentsResponse.status}`);
    }
    const experimentsData: any = await experimentsResponse.json();
    const experiments = experimentsData.experiments || [];
    const experimentsMap = new Map<string, ExperimentInfo>();
    experiments.forEach((exp: any) => {
      experimentsMap.set(exp.experiment_id, {
        name: exp.name,
        artifact_location: exp.artifact_location,
      });
    });

    const experimentIds =
      experiments.length > 0 ? experiments.map((exp: any) => exp.experiment_id) : ["0"];

    // 2. Runs — chunk to keep MLflow's payload happy
    const chunkSize = 50;
    const allRuns: any[] = [];
    for (let i = 0; i < experimentIds.length; i += chunkSize) {
      const chunk = experimentIds.slice(i, i + chunkSize);
      const runsResponse = await fetch(`${baseUrl}/api/2.0/mlflow/runs/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ experiment_ids: chunk, max_results: 1000 }),
      });
      if (runsResponse.ok) {
        const runsData: any = await runsResponse.json();
        if (runsData.runs?.length) allRuns.push(...runsData.runs);
      }
    }

    // 3. Transform + dedupe on (name, lifecycle_stage), preferring latest training end.
    const modelsMap = new Map<string, Record<string, unknown>>();
    for (const run of allRuns) {
      const record = transformRunToRecord(run, experimentsMap);
      if (!record) continue;
      const key = `${record.model_name}:${record.lifecycle_stage}`;
      const existing = modelsMap.get(key);
      const existingEnd = (existing?.training_ended_at as Date | null)?.getTime() ?? 0;
      const newEnd = (record.training_ended_at as Date | null)?.getTime() ?? 0;
      if (!existing || newEnd >= existingEnd) {
        modelsMap.set(key, record);
      }
    }
    const models = Array.from(modelsMap.values());
    if (models.length === 0) {
      return {
        success: false,
        modelCount: 0,
        syncedAt: new Date().toISOString(),
        status: "failed: MLflow returned no runs",
      };
    }

    await upsertModelRecords(organizationId, models);

    return {
      success: true,
      modelCount: models.length,
      syncedAt: new Date().toISOString(),
      status: "success",
    };
  } catch (err: any) {
    return {
      success: false,
      modelCount: 0,
      syncedAt: new Date().toISOString(),
      status: `failed: ${err.message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Table reads
// ---------------------------------------------------------------------------

export async function listSyncedModels(organizationId: number): Promise<any[]> {
  return (await sequelize.query(
    `SELECT * FROM mlflow_model_records
      WHERE organization_id = :organizationId
      ORDER BY created_at DESC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
}

export async function getSyncedModelById(
  modelId: number,
  organizationId: number,
): Promise<any | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM mlflow_model_records
      WHERE id = :modelId AND organization_id = :organizationId
      LIMIT 1;`,
    { replacements: { modelId, organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? null;
}
