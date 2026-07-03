/**
 * MRM (Model Risk Management) interfaces — frontend contract for the /api/mrm
 * endpoints. Shapes mirror the backend domain models/interfaces so the repository
 * can type its responses without any-casts leaking into the UI.
 */

import {
  MrmFindingSeverity,
  MrmFindingStage,
  MrmModelRole,
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
