import { apiServices } from "../../infrastructure/api/networkServices";

export type RetentionRecordKey =
  | "audit_records"
  | "ai_gateway_guardrail_logs"
  | "ai_gateway_spend_logs"
  | "agent_control_logs"
  | "mrm_metrics"
  | "evidence_files"
  | "shadow_ai_events"
  | "shadow_ai_daily_rollups"
  | "shadow_ai_alert_history"
  | "server_logs";

export type RetentionPeriod =
  { unit: "months" | "days"; value: number } | { unit: "policy"; value: string | null } | null;

export interface RetentionLastCleanup {
  ranAt: string;
  deletedCount: number;
  status: "success" | "capped" | "failed";
  /** The AI Gateway refused the purge over the internal key. */
  refusal?: "internal_key_not_configured" | "internal_key_rejected";
}

export interface RetentionRow {
  key: RetentionRecordKey;
  /** null means kept indefinitely. */
  period: RetentionPeriod;
  automaticDeletion: "yes" | "no" | "archive" | "rotate";
  lastCleanup: RetentionLastCleanup | null;
  source: "app" | "deployment";
  deploymentSetting?: string;
  /** The AI Gateway could not be reached, so the values are unknown. */
  unavailable?: boolean;
  /** Agent Control: no own period is set, so the deployment default applies. */
  usesDeploymentDefault?: boolean;
  deploymentDefaultDays?: number;
  minDays?: number;
}

export interface DataRetentionOverview {
  rows: RetentionRow[];
  auditPrunedThrough: { cutoff: string } | null;
}

/** Keys the AI Gateway guardrail settings endpoint accepts as a partial update. */
export interface GatewayRetentionUpdate {
  log_retention_days?: number;
  spend_log_retention_days?: number;
  auto_purge_enabled?: boolean;
  /** Agent Control log retention in days; null returns to the deployment default. */
  mcp_audit_retention_days?: number | null;
}

const ROUTE = "/data-retention";

export async function getDataRetention(signal?: AbortSignal): Promise<DataRetentionOverview> {
  const response = await apiServices.get(ROUTE, { signal });
  return (response.data as { data: DataRetentionOverview }).data;
}

export async function previewAuditRetention(months: number): Promise<{ count: number }> {
  const response = await apiServices.get(`${ROUTE}/audit-records/preview`, { months });
  return (response.data as { data: { count: number } }).data;
}

export async function updateAuditRetention(
  months: number | null,
): Promise<{ months: number | null }> {
  const response = await apiServices.put(`${ROUTE}/audit-records`, { months });
  return (response.data as { data: { months: number | null } }).data;
}

export async function updateGatewayRetention(update: GatewayRetentionUpdate): Promise<void> {
  await apiServices.put("/ai-gateway/guardrails/settings", update);
}
