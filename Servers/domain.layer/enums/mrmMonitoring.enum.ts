/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion) enums.
 *
 * String values mirror the PostgreSQL enum type labels created in the Branch-2
 * MRM migrations. `op` uses safe labels (gt/gte/lt/lte/outside) in place of the
 * spec's comparison symbols (>, >=, <, <=, outside).
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
 * also flags the model for re-validation (the seed of a revalidation workflow).
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

/**
 * MRM (Model Risk Management) — Branch 3 (revalidation triggers).
 *
 * What fired a revalidation trigger. All 4 sources converge on the one
 * task-creation path and are recorded in the mrm_revalidation_events audit log.
 * `tier_increase` fires when a model is re-tiered upward (1 is the highest);
 * `scheduled` fires from the due-date sweep over validation next_due dates.
 */
export enum MrmRevalidationTriggerSource {
  BREACH = "breach",
  MATERIAL_CHANGE = "material_change",
  TIER_INCREASE = "tier_increase",
  SCHEDULED = "scheduled",
}
