// enums/ai-incident-management.enum.ts
export enum AIIncidentManagementStatus {
  OPEN = "Open",
  INVESTIGATING = "Investigating",
  MITIGATED = "Mitigated",
  CLOSED = "Closed",
  SUSPENDED = "Suspended",
  EMERGENCY_ACTION = "Emergency action",
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

/** Severity values that count as a critical-tier incident and launch the incident_response workflow. */
const CRITICAL_SEVERITIES = new Set([Severity.VERY_SERIOUS.toLowerCase(), "critical"]);

export function isCriticalIncidentSeverity(severity: unknown): severity is string {
  return typeof severity === "string" && CRITICAL_SEVERITIES.has(severity.toLowerCase());
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
