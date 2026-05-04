// enums/ai-incident-management.enum.ts
export enum AIIncidentManagementStatus {
  OPEN = "Open",
  INVESTIGATING = "Investigating",
  MITIGATED = "Mitigated",
  CLOSED = "Closed",
}

export enum AIIncidentManagementApprovalStatus {
  APPROVED = "Approved",
  REJECTED = "Rejected",
  PENDING = "Pending",
  NOT_REQUIRED = "Not required",
}

export enum Severity {
  MINOR = "Minor",
  SERIOUS = "Serious",
  VERY_SERIOUS = "Very serious",
}

export enum IncidentType {
  MALFUNCTION = "Malfunction",
  UNEXPECTED_BEHAVIOR = "Unexpected behavior",
  MODEL_DRIFT = "Model drift",
  MISUSE = "Misuse",
  DATA_CORRUPTION = "Data corruption",
  SECURITY_BREACH = "Security breach",
  PERFORMANCE_DEGRADATION = "Performance degradation",
}
