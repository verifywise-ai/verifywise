// projectRisk.model.ts

export type ProjectRiskMitigation = {
  id: number;
  meta_id: number;
  sup_id: number;
  sub_id: number;
  title: string;
  parent_id: number;
  type:
    | "subclause"
    | "annexcategory"
    | "assessment"
    | "control"
    | "annexcontrol_27001"
    | "annexsubclause_27001";
  project_id: number;
};

export type ProjectRisk = {
  id: number;
  risk_name: string;
  risk_owner: string;
  ai_lifecycle_phase:
    | "Problem definition & planning"
    | "Data collection & processing"
    | "Model development & training"
    | "Model validation & testing"
    | "Deployment & integration"
    | "Monitoring & maintenance"
    | "Decommissioning & retirement";
  risk_description: string;
  risk_category: (
    | "Strategic risk"
    | "Operational risk"
    | "Compliance risk"
    | "Financial risk"
    | "Cybersecurity risk"
    | "Reputational risk"
    | "Legal risk"
    | "Technological risk"
    | "Third-party/vendor risk"
    | "Environmental risk"
    | "Human resources risk"
    | "Geopolitical risk"
    | "Fraud risk"
    | "Data privacy risk"
    | "Health and safety risk"
  )[];
  impact: string;
  assessment_mapping: string;
  controls_mapping: string;
  likelihood: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
  severity: "Negligible" | "Minor" | "Moderate" | "Major" | "Critical";
  risk_level_autocalculated:
    | "No risk"
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
  current_risk_level: "Very Low risk" | "Low risk" | "Medium risk" | "High risk" | "Very high risk";
  deadline: Date;
  mitigation_plan: string;
  implementation_strategy: string;
  mitigation_evidence_document: string;
  likelihood_mitigation: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
  risk_severity: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  final_risk_level: string;
  risk_approval: string;
  approval_status: string;
  date_of_assessment: Date;
  annexCategories?: ProjectRiskMitigation[];
  subClauses?: ProjectRiskMitigation[];
  assessments?: ProjectRiskMitigation[];
  controls?: ProjectRiskMitigation[];
  annexControls_27001?: ProjectRiskMitigation[];
  subClauses_27001?: ProjectRiskMitigation[];
  recommendations?: string;
  projects?: number[];
  frameworks?: number[];
  is_deleted?: boolean;
  deleted_at?: Date;
};
