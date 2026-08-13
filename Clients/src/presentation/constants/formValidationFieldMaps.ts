import { FormValues } from "../components/Forms/ProjectForm/constants";
import { MitigationFormValues, RiskFormValues } from "../components/AddNewRiskForm/interface";
import { FormValues as VendorRiskFormValues } from "../../domain/interfaces/i.form";

/** Visual tab order for ProjectForm fields that participate in validation. */
export const PROJECT_FORM_FIELD_ORDER: (keyof FormValues)[] = [
  "project_title",
  "owner",
  "ai_risk_classification",
  "type_of_high_risk_role",
  "start_date",
  "geography",
  "monitored_regulations_and_standards",
  "goal",
];

export const PROJECT_FORM_FIELD_IDS: Partial<Record<keyof FormValues, string>> = {
  project_title: "project-title-input",
  owner: "owner-input",
  ai_risk_classification: "risk-classification-input",
  type_of_high_risk_role: "type-of-high-risk-role-input",
  start_date: "project-start-date-input",
  geography: "geography-type-input",
  monitored_regulations_and_standards: "monitored-regulations-and-standards-input",
  goal: "goal-input",
};

export const RISK_FORM_FIELD_ORDER: (keyof RiskFormValues)[] = [
  "riskName",
  "aiLifecyclePhase",
  "riskDescription",
  "riskCategory",
  "potentialImpact",
  "reviewNotes",
];

export const RISK_FORM_FIELD_IDS: Partial<Record<keyof RiskFormValues, string>> = {
  riskName: "risk-name-input",
  aiLifecyclePhase: "ai-lifecycle-phase-input",
  riskDescription: "risk-description-input",
  riskCategory: "risk-categories-input",
  potentialImpact: "potential-impact-input",
  reviewNotes: "review-notes-input",
};

export const MITIGATION_FORM_FIELD_ORDER: (keyof MitigationFormValues)[] = [
  "mitigationStatus",
  "currentRiskLevel",
  "deadline",
  "mitigationPlan",
  "implementationStrategy",
  "approver",
  "approvalStatus",
  "dateOfAssessment",
];

export const MITIGATION_FORM_FIELD_IDS: Partial<Record<keyof MitigationFormValues, string>> = {
  mitigationStatus: "mitigation-status-input",
  currentRiskLevel: "current-risk-level-input",
  deadline: "mitigation-deadline-input",
  mitigationPlan: "mitigation-plan-input",
  implementationStrategy: "implementation-strategy-input",
  approver: "approver-input",
  approvalStatus: "approval-status-input",
  dateOfAssessment: "mitigation-assessment-date-input",
};

export const VENDOR_RISK_FORM_FIELD_ORDER: (keyof VendorRiskFormValues)[] = [
  "vendorName",
  "actionOwner",
  "riskName",
  "reviewDate",
  "riskDescription",
];

export const VENDOR_RISK_FORM_FIELD_IDS: Partial<Record<keyof VendorRiskFormValues, string>> = {
  vendorName: "vendor-name-input",
  actionOwner: "action-owner-input",
  riskName: "risk-name-input",
  reviewDate: "vendor-review-date-input",
  riskDescription: "risk-description-input",
};

/** Vendor risk modal (`Modals/NewRisk`) — the form used on /vendors/risks. */
export interface VendorRiskModalFormValues {
  vendor_id: string;
  action_owner: string;
  risk_description: string;
  action_plan: string;
  impact_description: string;
  likelihood: string;
  risk_severity: string;
}

export const VENDOR_RISK_MODAL_FIELD_ORDER: (keyof VendorRiskModalFormValues)[] = [
  "vendor_id",
  "action_owner",
  "risk_description",
  "action_plan",
  "impact_description",
  "likelihood",
  "risk_severity",
];

export const VENDOR_RISK_MODAL_FIELD_IDS: Partial<Record<keyof VendorRiskModalFormValues, string>> =
  {
    vendor_id: "vendor_id",
    action_owner: "action_owner",
    risk_description: "vendor-risk-description-input",
    action_plan: "vendor-risk-action-plan-input",
    impact_description: "vendor-risk-impact-description-input",
    likelihood: "likelihood-input",
    risk_severity: "risk-severity-input",
  };
