export type MappingStrength = "direct" | "partial" | "related";
export type MappingDirection = "forward" | "backward" | "bidirectional";
export type ControlType =
  | "control_category"
  | "control"
  | "sub_control"
  | "clause"
  | "sub_clause"
  | "annex_category"
  | "function"
  | "category"
  | "subcategory";

export interface IGovernanceControlMappingAttributes {
  id?: number;
  source_framework_id: number;
  source_control_type: ControlType;
  source_control_identifier: string;
  source_control_id?: number;
  target_framework_id: number;
  target_control_type: ControlType;
  target_control_identifier: string;
  target_control_id?: number;
  mapping_strength: MappingStrength;
  mapping_direction: MappingDirection;
  domain_tag?: string;
  rationale?: string;
  source_reference?: string;
  confidence_score?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface IGovernanceScenarioAttributes {
  id?: number;
  organization_id?: number | null;
  name: string;
  description?: string;
  industry?: string;
  use_case_type?: string;
  region?: string;
  recommended_framework_ids?: number[];
  priority_order?: Record<string, unknown>;
  rationale?: string;
  is_builtin?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface IGovernanceScenarioRuleAttributes {
  id?: number;
  scenario_id: number;
  rule_type: string;
  rule_operator: string;
  rule_value: string;
  weight: number;
}

export interface IGovernanceOrgPreferencesAttributes {
  id?: number;
  organization_id: number;
  selected_scenario_id?: number | null;
  custom_framework_priority?: Record<string, unknown>;
  active_mapping_filters?: Record<string, unknown>;
  is_enabled?: boolean;
  dont_ask_governance_os?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface IGovernanceCoverageCacheAttributes {
  id?: number;
  organization_id: number;
  project_id: number;
  framework_id: number;
  total_controls: number;
  mapped_controls: number;
  coverage_percentage: number;
  gap_details?: Record<string, unknown>;
  synergy_details?: Record<string, unknown>;
  computed_at?: Date;
}

export interface IRecommendationRequest {
  industry?: string;
  region?: string;
  riskLevel?: string;
  dataTypes?: string[];
  deploymentScale?: string;
  purpose?: string;
  useCaseType?: string;
}

export interface IGovernanceScenarioActivationAttributes {
  id?: number;
  organization_id: number;
  scenario_id: number;
  activated_by?: number;
  activated_at?: Date;
  deactivated_at?: Date;
  tasks_created?: number;
  frameworks_assigned?: number;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface IRecommendationResult {
  scenario: IGovernanceScenarioAttributes;
  score: number;
  matchedRules: string[];
}
