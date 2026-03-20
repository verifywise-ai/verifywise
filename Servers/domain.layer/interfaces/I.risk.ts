export interface IRisk {
  id?: number;
  risk_name: string;
  risk_owner: number;
  ai_lifecycle_phase:
    | "Problem definition & planning"
    | "Data collection & processing"
    | "Model development & training"
    | "Model validation & testing"
    | "Deployment & integration"
    | "Monitoring & maintenance"
    | "Decommissioning & retirement";
  risk_description: string;
  risk_category: string[];
  impact: string;
  assessment_mapping: string;
  controls_mapping: string;
  likelihood: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
  severity: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  risk_level_autocalculated:
    | "No risk"
    | "Very low risk"
    | "Low risk"
    | "Medium risk"
    | "High risk"
    | "Very high risk";
  review_notes: string;
  mitigation_status:
    | "Not Started"
    | "In Progress"
    | "Completed"
    | "On Hold"
    | "Deferred"
    | "Canceled"
    | "Requires review";
  current_risk_level:
    | "Very Low risk"
    | "Low risk"
    | "Medium risk"
    | "High risk"
    | "Very high risk";
  deadline: Date;
  mitigation_plan: string;
  implementation_strategy: string;
  mitigation_evidence_document: string;
  likelihood_mitigation:
    | "Rare"
    | "Unlikely"
    | "Possible"
    | "Likely"
    | "Almost Certain";
  risk_severity: "Negligible" | "Minor" | "Moderate" | "Major" | "Critical";
  final_risk_level: string;
  risk_approval: number;
  approval_status: string;
  date_of_assessment: Date;
  is_demo?: boolean;
  created_at?: Date;
  recommendations?: string;
  deletedLinkedProject?: boolean;
  deletedLinkedFrameworks?: boolean;

  // Quantitative risk assessment (FAIR) fields
  event_frequency_min?: number | null;
  event_frequency_likely?: number | null;
  event_frequency_max?: number | null;
  loss_regulatory_min?: number | null;
  loss_regulatory_likely?: number | null;
  loss_regulatory_max?: number | null;
  loss_operational_min?: number | null;
  loss_operational_likely?: number | null;
  loss_operational_max?: number | null;
  loss_litigation_min?: number | null;
  loss_litigation_likely?: number | null;
  loss_litigation_max?: number | null;
  loss_reputational_min?: number | null;
  loss_reputational_likely?: number | null;
  loss_reputational_max?: number | null;
  total_loss_likely?: number | null;
  ale_estimate?: number | null;
  control_effectiveness?: number | null;
  residual_ale?: number | null;
  mitigation_cost_annual?: number | null;
  roi_percentage?: number | null;
  benchmark_id?: number | null;
  currency?: string | null;
}
