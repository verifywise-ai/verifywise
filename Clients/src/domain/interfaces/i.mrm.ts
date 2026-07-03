/**
 * MRM (Model Risk Management) interfaces — frontend contract for the /api/mrm
 * endpoints. Shapes mirror the backend domain models/interfaces so the repository
 * can type its responses without any-casts leaking into the UI.
 */

import {
  MrmBreachAction,
  MrmEvalStatus,
  MrmFindingSeverity,
  MrmFindingStage,
  MrmModelRole,
  MrmThresholdOp,
  MrmThresholdSeverity,
  MrmTier,
  MrmValidationOutcome,
  MrmValidationStage,
  MrmValidationTrigger,
} from "../enums/mrm.enum";

/** One row of the fleet-tiering list (GET /api/mrm/tiering). */
export interface IMrmFleetRow {
  id: number;
  provider: string | null;
  model: string | null;
  version: string | null;
  status: string | null;
  external_key: string | null;
  mrm_tier: MrmTier | null;
  mrm_materiality_drivers: string | null;
  mrm_tiered_at: string | null;
  mrm_tiered_by: number | null;
}

/** One section of a validation report (free text + attached evidence links). */
export interface IMrmValidationReportSection {
  text: string;
  evidence_links: number[];
}

/** The 6 sections of a validation report (JSONB on mrm_validations.report). */
export interface IMrmValidationReport {
  purpose_scope?: IMrmValidationReportSection;
  conceptual_soundness?: IMrmValidationReportSection;
  data_review?: IMrmValidationReportSection;
  outcomes_analysis?: IMrmValidationReportSection;
  findings_limitations?: IMrmValidationReportSection;
  conclusion_signoff?: IMrmValidationReportSection;
}

export interface IMrmValidation {
  id: number;
  organization_id: number;
  model_inventory_id: number;
  stage: MrmValidationStage;
  trigger?: MrmValidationTrigger | null;
  validator_id?: number | null;
  outcome?: MrmValidationOutcome | null;
  report_version?: string | null;
  report: IMrmValidationReport;
  signed_off_at?: string | null;
  signed_off_by?: number | null;
  next_due?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface IMrmFinding {
  id: number;
  organization_id: number;
  model_inventory_id: number;
  validation_id?: number | null;
  title: string;
  severity: MrmFindingSeverity;
  stage: MrmFindingStage;
  owner_id?: number | null;
  remediation_plan?: string | null;
  due_date?: string | null;
  closed_at?: string | null;
  closed_verified: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface IMrmModelRole {
  id: number;
  organization_id: number;
  model_inventory_id: number;
  role: MrmModelRole;
  user_id?: number | null;
  created_at?: string | null;
}

// ---- Request payloads ----

export interface IAssignTierPayload {
  tier: MrmTier;
  materiality_drivers?: string | null;
}

export interface ICreateValidationPayload {
  trigger?: MrmValidationTrigger;
  validator_id?: number | null;
  report_version?: string | null;
  report?: IMrmValidationReport;
  next_due?: string | null;
}

export interface IUpdateValidationPayload {
  stage?: MrmValidationStage;
  trigger?: MrmValidationTrigger;
  validator_id?: number | null;
  outcome?: MrmValidationOutcome | null;
  report_version?: string | null;
  report?: IMrmValidationReport;
  next_due?: string | null;
}

export interface ISignoffValidationPayload {
  outcome: MrmValidationOutcome;
  report_version?: string | null;
}

export interface ICreateFindingPayload {
  title: string;
  severity?: MrmFindingSeverity;
  owner_id?: number | null;
  remediation_plan?: string | null;
  due_date?: string | null;
}

export interface IUpdateFindingPayload {
  stage?: MrmFindingStage;
  severity?: MrmFindingSeverity;
  owner_id?: number | null;
  remediation_plan?: string | null;
  due_date?: string | null;
  closed_verified?: boolean;
}

export interface IRoleAssignment {
  role: MrmModelRole;
  user_id: number | null;
}

// ---- Branch 2: monitoring / ingestion ----

/**
 * One row of the per-model monitoring summary (GET /api/mrm/models/:id/monitoring):
 * the latest value + latest evaluation status per (metric, segment, window).
 * `status` is null and `threshold_id` is null when a point was ingested before an
 * evaluation was recorded; the UI treats a null status as "no data yet".
 */
export interface IMrmMonitoringRow {
  metric: string;
  segment: string;
  window: string;
  value: number;
  at: string;
  metric_id: number;
  status: MrmEvalStatus | null;
  threshold_id: number | null;
  evaluated_at: string | null;
}

/** One point on a metric's value/status trend (GET .../monitoring/trend?metric=). */
export interface IMrmTrendPoint {
  metric_id: number;
  value: number;
  at: string;
  segment: string;
  window: string;
  status: MrmEvalStatus | null;
}

/** A frozen copy of the threshold at evaluation time (audit snapshot). */
export interface IMrmThresholdSnapshot {
  op?: MrmThresholdOp;
  value_num?: number;
  value_lo?: number;
  value_hi?: number;
  severity?: MrmThresholdSeverity;
  segment?: string;
  window?: string;
}

/** One warn/breach evaluation in a model's breach history (GET .../monitoring/breaches). */
export interface IMrmBreachHistoryRow {
  evaluation_id: number;
  metric_id: number;
  metric: string;
  value: number;
  at: string;
  segment: string;
  window: string;
  status: MrmEvalStatus;
  threshold_id: number | null;
  threshold_snapshot: IMrmThresholdSnapshot | null;
  evaluated_at: string;
}

/** A threshold definition, per (model, metric), optionally per segment/window. */
export interface IMrmThreshold {
  id: number;
  organization_id: number;
  model_inventory_id: number;
  metric: string;
  segment?: string | null;
  window?: string | null;
  op: MrmThresholdOp;
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  severity: MrmThresholdSeverity;
  breach_action: MrmBreachAction;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ICreateThresholdPayload {
  metric: string;
  segment?: string | null;
  window?: string | null;
  op: MrmThresholdOp;
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  severity?: MrmThresholdSeverity;
  breach_action?: MrmBreachAction;
  active?: boolean;
}

export interface IUpdateThresholdPayload {
  segment?: string | null;
  window?: string | null;
  op?: MrmThresholdOp;
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  severity?: MrmThresholdSeverity;
  breach_action?: MrmBreachAction;
  active?: boolean;
}

/**
 * A per-org, named, revocable machine-to-machine ingestion token. Only the hash
 * is stored server-side; the plaintext is shown once on creation (see
 * `ICreatedIngestionToken`). `revoked_at` non-null means the token is revoked.
 */
export interface IMrmIngestionToken {
  id: number;
  name: string;
  model_inventory_id: number | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: number | null;
  created_at: string;
}

/** The create/rotate response — carries the plaintext `token` exactly once. */
export interface ICreatedIngestionToken extends IMrmIngestionToken {
  token: string;
}

export interface ICreateIngestionTokenPayload {
  name: string;
  model_inventory_id?: number | null;
}

/** A registered metric key in an org's catalogue (e.g. `psi`, `auc`). */
export interface IMrmMetricKey {
  id: number;
  organization_id: number;
  key: string;
  display_name?: string | null;
  created_at?: string | null;
}

export interface ICreateMetricKeyPayload {
  key: string;
  display_name?: string | null;
}
