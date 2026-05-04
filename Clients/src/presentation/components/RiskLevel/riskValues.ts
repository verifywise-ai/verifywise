// Existing enums from previous interface
enum RiskLevel {
  Low = "Low",
  Medium = "Medium",
  High = "High",
  VeryHigh = "Very High",
  Extreme = "Extreme",
}

export enum RiskLikelihood {
  Rare = "Rare",
  Unlikely = "Unlikely",
  Possible = "Possible",
  Likely = "Likely",
  AlmostCertain = "Almost Certain",
}
export enum RiskSeverity {
  Negligible = "Negligible",
  Minor = "Minor",
  Moderate = "Moderate",
  Major = "Major",
  Catastrophic = "Catastrophic",
}

// New enums for mitigation form
export enum MitigationStatus {
  NotStarted = "Not Started",
  InProgress = "In Progress",
  Completed = "Completed",
  OnHold = "On Hold",
  Deferred = "Deferred",
  Canceled = "Canceled",
  RequiresReview = "Requires review",
}

enum ApprovalStatus {
  Pending = "Pending",
  Approved = "Approved",
  Rejected = "Rejected",
  UnderReview = "Under Review",
  RequiresChanges = "Requires Changes",
  Escalated = "Escalated",
}

// Interface for the mitigation form data
interface RiskMitigationForm {
  mitigationStatus: MitigationStatus;
  currentRiskLevel: RiskLevel;
  deadline: Date;
  mitigationPlan: string;
  implementationStrategy: string;
  mitigationEvidenceDocument: File | null; // Represents the uploaded file
  residualRiskLikelihood: RiskLikelihood;
  residualRiskSeverity: RiskSeverity;
  residualRiskLevel: RiskLevel; // Auto-calculated based on likelihood and severity
  approver: string; // Assuming this is a free text field or could be an enum if there's a fixed list of approvers
  approvalStatus: ApprovalStatus;
  dateOfAssessment: Date;
  recommendations: string;
}

// Example usage:
export const newRiskMitigation: RiskMitigationForm = {
  mitigationStatus: MitigationStatus.InProgress,
  currentRiskLevel: RiskLevel.High,
  deadline: new Date("2024-01-06"),
  mitigationPlan: "Implement additional security measures and conduct thorough testing.",
  implementationStrategy:
    "Engage security team for review and integrate new protocols into development pipeline.",
  mitigationEvidenceDocument: null, // No file uploaded yet
  residualRiskLikelihood: RiskLikelihood.Unlikely,
  residualRiskSeverity: RiskSeverity.Moderate,
  residualRiskLevel: RiskLevel.Medium, // This would be auto-calculated in the actual implementation
  approver: "Jane Smith",
  approvalStatus: ApprovalStatus.Pending,
  dateOfAssessment: new Date("2024-01-06"),
  recommendations: "Consider additional employee training on new security protocols.",
};
