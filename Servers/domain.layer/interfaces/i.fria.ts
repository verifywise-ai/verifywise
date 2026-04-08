import { FriaStatus, FriaRiskLevel, FriaLikelihood, FriaSeverity } from "../enums/fria-status.enum";

// ========================================
// FRIA ASSESSMENT
// ========================================

export interface IFriaAssessment {
  id?: number;
  organization_id: number;
  project_id: number;
  version: number;
  status: FriaStatus;

  // Section 1: Organisation & system profile
  assessment_owner?: string;
  assessment_date?: string;
  operational_context?: string;

  // Section 2: Applicability & scope
  is_high_risk?: string;
  high_risk_basis?: string;
  deployer_type?: string;
  annex_iii_category?: string;
  first_use_date?: string;
  review_cycle?: string;
  period_frequency?: string;
  fria_rationale?: string;

  // Section 3: Affected persons
  affected_groups?: string;
  vulnerability_context?: string;
  group_flags?: string[];

  // Section 5: Specific risks context
  risk_scenarios?: string;
  provider_info_used?: string;

  // Section 6: Oversight
  human_oversight?: string;
  transparency_measures?: string;
  redress_process?: string;
  data_governance?: string;

  // Section 7: Consultation
  legal_review?: string;
  dpo_review?: string;
  owner_approval?: string;
  stakeholders_consulted?: string;
  consultation_notes?: string;

  // Section 8: Summary
  deployment_decision?: string;
  decision_conditions?: string;

  // Computed (cached on save)
  completion_pct: number;
  risk_score: number;
  risk_level: FriaRiskLevel;
  rights_flagged: number;

  // Metadata
  created_by: number;
  updated_by?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface IFriaAssessmentJSON extends IFriaAssessment {
  project_title?: string;
  organization_name?: string;
  created_by_name?: string;
  updated_by_name?: string;
}

// ========================================
// FRIA RIGHT
// ========================================

export interface IFriaRight {
  id?: number;
  organization_id: number;
  fria_id: number;
  right_key: string;
  right_title: string;
  charter_ref: string;
  flagged: boolean;
  severity: number;
  confidence: number;
  impact_pathway?: string;
  mitigation?: string;
}

// ========================================
// FRIA RISK ITEM
// ========================================

export interface IFriaRiskItem {
  id?: number;
  organization_id: number;
  fria_id: number;
  risk_description: string;
  likelihood?: FriaLikelihood;
  severity?: FriaSeverity;
  existing_controls?: string;
  further_action?: string;
  linked_project_risk_id?: number;
  sort_order: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface IFriaRiskItemJSON extends IFriaRiskItem {
  linked_risk_name?: string;
  linked_risk_description?: string;
}

// ========================================
// FRIA MODEL LINK
// ========================================

export interface IFriaModelLink {
  id?: number;
  organization_id: number;
  fria_id: number;
  model_id: number;
}

export interface IFriaModelLinkJSON extends IFriaModelLink {
  provider?: string;
  model?: string;
  version?: string;
  model_status?: string;
}

// ========================================
// FRIA SNAPSHOT
// ========================================

export interface IFriaSnapshot {
  id?: number;
  organization_id: number;
  fria_id: number;
  version: number;
  snapshot_data: Record<string, unknown>;
  snapshot_reason?: string;
  created_by: number;
  created_at?: Date;
}

export interface IFriaSnapshotJSON extends IFriaSnapshot {
  created_by_name?: string;
}

// ========================================
// FRIA SCORE RESULT
// ========================================

export interface IFriaScoreResult {
  riskScore: number;
  riskLevel: string;
  completionPct: number;
  rightsFlagged: number;
  // Snake-case aliases for updateFriaQuery
  risk_score: number;
  risk_level: string;
  completion_pct: number;
  rights_flagged: number;
}
