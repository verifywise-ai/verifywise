/**
 * MRM (Model Risk Management) enums.
 *
 * String values mirror the PostgreSQL enum type labels created in the MRM
 * migrations. Tiering is manual in v1 — MrmTier only stores a human-chosen tier.
 */

export enum MrmTier {
  TIER_1 = "1",
  TIER_2 = "2",
  TIER_3 = "3",
}

export enum MrmValidationStage {
  NOT_STARTED = "not_started",
  IN_VALIDATION = "in_validation",
  UNDER_REVIEW = "under_review",
  VALIDATED = "validated",
}

export enum MrmValidationTrigger {
  PERIODIC = "periodic",
  FIRST_USE = "first_use",
  CHANGE = "change",
  BREACH = "breach",
}

export enum MrmValidationOutcome {
  VALIDATED = "validated",
  VALIDATED_WITH_FINDINGS = "validated_with_findings",
  NOT_VALIDATED = "not_validated",
}

export enum MrmFindingSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export enum MrmFindingStage {
  OPEN = "open",
  REMEDIATION_PLANNED = "remediation_planned",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
  CLOSED = "closed",
}

export enum MrmModelRole {
  OWNER = "owner",
  DEVELOPER = "developer",
  VALIDATOR = "validator",
  APPROVER = "approver",
}
