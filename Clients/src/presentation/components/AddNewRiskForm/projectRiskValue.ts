import { RiskLikelihood, MitigationStatus, RiskSeverity } from "../RiskLevel/riskValues";
import { RISK_LABELS, Likelihood, Severity } from "../RiskLevel/constants";
import type { RiskApprovalStatus } from "../../../domain/types/ProjectRisk";

// Setting up risk-type
export type riskType = {
  _id: number;
  name: string;
};

// Setting up risk constants
export const aiLifecyclePhase: riskType[] = [
  { _id: 1, name: "Problem definition & planning" },
  { _id: 2, name: "Data collection & processing" },
  { _id: 3, name: "Model development & training" },
  { _id: 4, name: "Model validation & testing" },
  { _id: 5, name: "Deployment & integration" },
  { _id: 6, name: "Monitoring & maintenance" },
  { _id: 7, name: "Decommissioning & retirement" },
];

export const riskCategoryItems: riskType[] = [
  { _id: 1, name: "Strategic risk" },
  { _id: 2, name: "Operational risk" },
  { _id: 3, name: "Compliance risk" },
  { _id: 4, name: "Financial risk" },
  { _id: 5, name: "Cybersecurity risk" },
  { _id: 6, name: "Reputational risk" },
  { _id: 7, name: "Legal risk" },
  { _id: 8, name: "Technological risk" },
  { _id: 9, name: "Third-party/vendor risk" },
  { _id: 10, name: "Environmental risk" },
  { _id: 11, name: "Human resources risk" },
  { _id: 12, name: "Geopolitical risk" },
  { _id: 13, name: "Fraud risk" },
  { _id: 14, name: "Data privacy risk" },
  { _id: 15, name: "Health and safety risk" },
];

// Setting up mitigation constants
export const mitigationStatusItems: riskType[] = [
  { _id: 1, name: MitigationStatus.NotStarted },
  { _id: 2, name: MitigationStatus.InProgress },
  { _id: 3, name: MitigationStatus.Completed },
  { _id: 4, name: MitigationStatus.OnHold },
  { _id: 5, name: MitigationStatus.Deferred },
  { _id: 6, name: MitigationStatus.Canceled },
  { _id: 7, name: MitigationStatus.RequiresReview },
];

export const riskLevelItems: riskType[] = [
  { _id: 1, name: RISK_LABELS.critical.text },
  { _id: 2, name: RISK_LABELS.high.text },
  { _id: 3, name: RISK_LABELS.medium.text },
  { _id: 4, name: RISK_LABELS.low.text },
  { _id: 5, name: RISK_LABELS.noRisk.text },
];

/** Select ids of the four risk approval statuses. */
export const RISK_APPROVAL_STATUS = {
  Pending: 1,
  Approved: 2,
  Rejected: 3,
  NotRequired: 4,
} as const;

/** Approved and Rejected: only the risk's approver or an Admin may set them or move off them. */
export const RISK_APPROVAL_DECISION_IDS: readonly number[] = [
  RISK_APPROVAL_STATUS.Approved,
  RISK_APPROVAL_STATUS.Rejected,
];

// The names are the stored values (the server allows only these four).
export const approvalStatusItems: { _id: number; name: RiskApprovalStatus }[] = [
  { _id: RISK_APPROVAL_STATUS.Pending, name: "Pending" },
  { _id: RISK_APPROVAL_STATUS.Approved, name: "Approved" },
  { _id: RISK_APPROVAL_STATUS.Rejected, name: "Rejected" },
  { _id: RISK_APPROVAL_STATUS.NotRequired, name: "Not required" },
];

export const likelihoodItems: riskType[] = [
  { _id: Likelihood.Rare, name: RiskLikelihood.Rare },
  { _id: Likelihood.Unlikely, name: RiskLikelihood.Unlikely },
  { _id: Likelihood.Possible, name: RiskLikelihood.Possible },
  { _id: Likelihood.Likely, name: RiskLikelihood.Likely },
  { _id: Likelihood.AlmostCertain, name: RiskLikelihood.AlmostCertain },
];

export const riskSeverityItems: riskType[] = [
  { _id: Severity.Negligible, name: RiskSeverity.Negligible },
  { _id: Severity.Minor, name: RiskSeverity.Minor },
  { _id: Severity.Moderate, name: RiskSeverity.Moderate },
  { _id: Severity.Major, name: RiskSeverity.Major },
  { _id: Severity.Catastrophic, name: RiskSeverity.Catastrophic },
];
