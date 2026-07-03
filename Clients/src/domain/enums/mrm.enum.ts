/**
 * MRM (Model Risk Management) enums — frontend mirror of the backend enums in
 * Servers/domain.layer/enums/mrm.enum.ts. String values must match the API
 * exactly. Tiering is manual in v1 — the tier is a human-chosen value only.
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

/**
 * MRM Branch 2 (monitoring / ingestion) enums — mirror of
 * Servers/domain.layer/enums/mrmMonitoring.enum.ts. String values must match the
 * API exactly.
 */

/**
 * Comparison operator for a threshold. gt/gte/lt/lte compare a single value;
 * `outside` uses a band [lo, hi] (breach when the metric falls outside it).
 */
export enum MrmThresholdOp {
  GT = "gt",
  GTE = "gte",
  LT = "lt",
  LTE = "lte",
  OUTSIDE = "outside",
}

export enum MrmThresholdSeverity {
  WARN = "warn",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * What happens on breach. `notify` raises an alert only; `notify_flag_revalidation`
 * also flags the model for re-validation.
 */
export enum MrmBreachAction {
  NOTIFY = "notify",
  NOTIFY_FLAG_REVALIDATION = "notify_flag_revalidation",
}

/**
 * Outcome of evaluating an ingested point against a threshold. `no_threshold`
 * is a first-class state: a metric with no matching active threshold is stored
 * and shown, not silently dropped.
 */
export enum MrmEvalStatus {
  OK = "ok",
  WARN = "warn",
  BREACH = "breach",
  NO_THRESHOLD = "no_threshold",
}
