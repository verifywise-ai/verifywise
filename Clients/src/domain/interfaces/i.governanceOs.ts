export type MappingStrength = "direct" | "partial" | "related";
export type MappingDirection = "forward" | "backward" | "bidirectional";

export interface IGovernanceControlMapping {
  id: number;
  source_framework_id: number;
  source_control_type: string;
  source_control_identifier: string;
  source_control_id?: number;
  target_framework_id: number;
  target_control_type: string;
  target_control_identifier: string;
  target_control_id?: number;
  mapping_strength: MappingStrength;
  mapping_direction: MappingDirection;
  domain_tag?: string;
  rationale?: string;
  source_reference?: string;
  confidence_score?: number;
}

export interface IGovernanceScenario {
  id: number;
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
  rules?: IGovernanceScenarioRule[];
}

export interface IGovernanceScenarioRule {
  id: number;
  scenario_id: number;
  rule_type: string;
  rule_operator: string;
  rule_value: string;
  weight: number;
}

export interface IGovernanceOrgPreferences {
  id: number;
  organization_id: number;
  selected_scenario_id?: number | null;
  custom_framework_priority?: Record<string, unknown>;
  active_mapping_filters?: Record<string, unknown>;
  is_enabled?: boolean;
  dont_ask_governance_os?: boolean;
}

export interface IGovernanceCoverage {
  framework_id: number;
  framework_name: string;
  total_controls: number;
  mapped_controls: number;
  coverage_percentage: number;
  gap_details: { unmapped_controls: string[] };
  synergy_details: { multi_framework_controls: string[] };
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

export interface IRecommendationResult {
  scenario: IGovernanceScenario;
  score: number;
  matchedRules: string[];
}

export interface IUnifiedView {
  coverage: IGovernanceCoverage[];
  mappingStats: {
    total: number;
    byDomain: Record<string, number>;
    byStrength: Record<string, number>;
  };
  preferences: IGovernanceOrgPreferences | null;
  projectId: number;
}

export interface IGovernanceOsPageProps {
  defaultTab?: string;
}

export interface IMappingCardProps {
  mapping: IGovernanceControlMapping;
  frameworkNames?: Record<number, string>;
}

export interface IScenarioCardProps {
  scenario: IGovernanceScenario;
  score?: number;
  matchedRules?: string[];
  isSelected?: boolean;
  onSelect?: (scenario: IGovernanceScenario) => void;
}

export interface ICoverageChartProps {
  coverage: IGovernanceCoverage[];
}
