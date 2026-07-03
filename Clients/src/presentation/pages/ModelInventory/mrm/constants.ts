/**
 * Shared labels, chip mappings and helpers for the Model risk management tab.
 *
 * All user-facing strings live as plain English literals here and in the
 * sub-tab components; the DOM translator resolves them via i18n/translations.ts
 * (which carries de/fr/es for every string). Keep copy in sentence case.
 */

import { ChipVariant } from "../../../types/interfaces/i.chip";
import {
  MrmBreachAction,
  MrmEvalStatus,
  MrmFindingSeverity,
  MrmFindingStage,
  MrmModelRole,
  MrmThresholdOp,
  MrmThresholdSeverity,
  MrmTier,
  MrmValidationOutcome,
  MrmValidationStage,
} from "../../../../domain/enums/mrm.enum";
import { IMrmThreshold } from "../../../../domain/interfaces/i.mrm";

// ---- Tier ----

export const TIER_OPTIONS: { value: MrmTier; label: string }[] = [
  { value: MrmTier.TIER_1, label: "Tier 1" },
  { value: MrmTier.TIER_2, label: "Tier 2" },
  { value: MrmTier.TIER_3, label: "Tier 3" },
];

export const tierLabel = (tier: MrmTier | null): string => {
  if (tier === MrmTier.TIER_1) return "Tier 1";
  if (tier === MrmTier.TIER_2) return "Tier 2";
  if (tier === MrmTier.TIER_3) return "Tier 3";
  return "Untiered";
};

export const tierChipVariant = (tier: MrmTier | null): ChipVariant => {
  if (tier === MrmTier.TIER_1) return "critical";
  if (tier === MrmTier.TIER_2) return "warning";
  if (tier === MrmTier.TIER_3) return "success";
  return "default";
};

// ---- Validation stage ----

export const VALIDATION_STAGE_LABELS: Record<MrmValidationStage, string> = {
  [MrmValidationStage.NOT_STARTED]: "Not started",
  [MrmValidationStage.IN_VALIDATION]: "In validation",
  [MrmValidationStage.UNDER_REVIEW]: "Under review",
  [MrmValidationStage.VALIDATED]: "Validated",
};

/** Ordered stages for the pipeline summary strip. */
export const VALIDATION_STAGE_ORDER: MrmValidationStage[] = [
  MrmValidationStage.NOT_STARTED,
  MrmValidationStage.IN_VALIDATION,
  MrmValidationStage.UNDER_REVIEW,
  MrmValidationStage.VALIDATED,
];

export const validationStageChipVariant = (stage: MrmValidationStage): ChipVariant => {
  switch (stage) {
    case MrmValidationStage.VALIDATED:
      return "success";
    case MrmValidationStage.UNDER_REVIEW:
      return "info";
    case MrmValidationStage.IN_VALIDATION:
      return "warning";
    default:
      return "default";
  }
};

/** Stages a validator can move to via PATCH (validated is reached only via sign-off). */
export const VALIDATION_STAGE_OPTIONS: { value: MrmValidationStage; label: string }[] = [
  { value: MrmValidationStage.NOT_STARTED, label: "Not started" },
  { value: MrmValidationStage.IN_VALIDATION, label: "In validation" },
  { value: MrmValidationStage.UNDER_REVIEW, label: "Under review" },
];

// ---- Validation outcome ----

export const VALIDATION_OUTCOME_LABELS: Record<MrmValidationOutcome, string> = {
  [MrmValidationOutcome.VALIDATED]: "Validated",
  [MrmValidationOutcome.VALIDATED_WITH_FINDINGS]: "Validated with findings",
  [MrmValidationOutcome.NOT_VALIDATED]: "Not validated",
};

export const VALIDATION_OUTCOME_OPTIONS: { value: MrmValidationOutcome; label: string }[] = [
  { value: MrmValidationOutcome.VALIDATED, label: "Validated" },
  { value: MrmValidationOutcome.VALIDATED_WITH_FINDINGS, label: "Validated with findings" },
  { value: MrmValidationOutcome.NOT_VALIDATED, label: "Not validated" },
];

// ---- Validation report sections (6, per spec §6.1) ----

export type ReportSectionKey =
  | "purpose_scope"
  | "conceptual_soundness"
  | "data_review"
  | "outcomes_analysis"
  | "findings_limitations"
  | "conclusion_signoff";

export const REPORT_SECTIONS: { key: ReportSectionKey; label: string }[] = [
  { key: "purpose_scope", label: "Purpose & scope" },
  { key: "conceptual_soundness", label: "Conceptual soundness" },
  { key: "data_review", label: "Data review" },
  { key: "outcomes_analysis", label: "Outcomes analysis" },
  { key: "findings_limitations", label: "Findings & limitations" },
  { key: "conclusion_signoff", label: "Conclusion & sign-off" },
];

// ---- Finding severity ----

export const FINDING_SEVERITY_LABELS: Record<MrmFindingSeverity, string> = {
  [MrmFindingSeverity.CRITICAL]: "Critical",
  [MrmFindingSeverity.HIGH]: "High",
  [MrmFindingSeverity.MEDIUM]: "Medium",
  [MrmFindingSeverity.LOW]: "Low",
};

export const FINDING_SEVERITY_OPTIONS: { value: MrmFindingSeverity; label: string }[] = [
  { value: MrmFindingSeverity.CRITICAL, label: "Critical" },
  { value: MrmFindingSeverity.HIGH, label: "High" },
  { value: MrmFindingSeverity.MEDIUM, label: "Medium" },
  { value: MrmFindingSeverity.LOW, label: "Low" },
];

export const findingSeverityChipVariant = (severity: MrmFindingSeverity): ChipVariant => {
  switch (severity) {
    case MrmFindingSeverity.CRITICAL:
      return "critical";
    case MrmFindingSeverity.HIGH:
      return "high";
    case MrmFindingSeverity.MEDIUM:
      return "medium";
    default:
      return "low";
  }
};

// ---- Finding stage (lifecycle) ----

export const FINDING_STAGE_LABELS: Record<MrmFindingStage, string> = {
  [MrmFindingStage.OPEN]: "Open",
  [MrmFindingStage.REMEDIATION_PLANNED]: "Remediation planned",
  [MrmFindingStage.IN_PROGRESS]: "In progress",
  [MrmFindingStage.RESOLVED]: "Resolved",
  [MrmFindingStage.CLOSED]: "Closed",
};

export const FINDING_STAGE_ORDER: MrmFindingStage[] = [
  MrmFindingStage.OPEN,
  MrmFindingStage.REMEDIATION_PLANNED,
  MrmFindingStage.IN_PROGRESS,
  MrmFindingStage.RESOLVED,
  MrmFindingStage.CLOSED,
];

export const FINDING_STAGE_OPTIONS: { value: MrmFindingStage; label: string }[] =
  FINDING_STAGE_ORDER.map((stage) => ({ value: stage, label: FINDING_STAGE_LABELS[stage] }));

export const findingStageChipVariant = (stage: MrmFindingStage): ChipVariant => {
  switch (stage) {
    case MrmFindingStage.OPEN:
      return "error";
    case MrmFindingStage.REMEDIATION_PLANNED:
      return "info";
    case MrmFindingStage.IN_PROGRESS:
      return "warning";
    case MrmFindingStage.RESOLVED:
      return "success";
    default:
      return "default";
  }
};

// ---- Per-model roles ----

export const ROLE_DEFINITIONS: {
  role: MrmModelRole;
  label: string;
  does: string;
}[] = [
  {
    role: MrmModelRole.OWNER,
    label: "Owner",
    does: "Accountable for the model in production; responds to findings",
  },
  {
    role: MrmModelRole.DEVELOPER,
    label: "Developer",
    does: "Builds and changes the model",
  },
  {
    role: MrmModelRole.VALIDATOR,
    label: "Validator",
    does: "Independently reviews and signs off — must not be the developer",
  },
  {
    role: MrmModelRole.APPROVER,
    label: "Approver",
    does: "Grants use / conditional approval after validation",
  },
];

// ---- Monitoring: evaluation status ----

/**
 * Status labels for the Monitoring tab. `null` status (a point ingested with no
 * evaluation yet) is surfaced as "No data yet"; `no_threshold` as
 * "No threshold defined" — both are truthful first-class states, never dropped.
 */
export const evalStatusLabel = (status: MrmEvalStatus | null): string => {
  switch (status) {
    case MrmEvalStatus.OK:
      return "Within threshold";
    case MrmEvalStatus.WARN:
      return "Warning";
    case MrmEvalStatus.BREACH:
      return "Breach";
    case MrmEvalStatus.NO_THRESHOLD:
      return "No threshold defined";
    default:
      return "No data yet";
  }
};

export const evalStatusChipVariant = (status: MrmEvalStatus | null): ChipVariant => {
  switch (status) {
    case MrmEvalStatus.OK:
      return "success";
    case MrmEvalStatus.WARN:
      return "warning";
    case MrmEvalStatus.BREACH:
      return "error";
    default:
      return "default";
  }
};

// ---- Monitoring: threshold shapes ----

/**
 * The mockup's friendly threshold-shape vocabulary mapped to the enum op:
 *   floor (≥)   → gte    ceiling (≤) → lte
 *   above (>)   → gt     below (<)   → lt
 *   band        → outside (breach when the value falls OUTSIDE [lo, hi])
 * `outside` uses value_lo/value_hi; every other shape uses value_num.
 */
export const THRESHOLD_SHAPE_OPTIONS: { value: MrmThresholdOp; label: string }[] = [
  { value: MrmThresholdOp.GTE, label: "Floor (≥)" },
  { value: MrmThresholdOp.GT, label: "Above (>)" },
  { value: MrmThresholdOp.LTE, label: "Ceiling (≤)" },
  { value: MrmThresholdOp.LT, label: "Below (<)" },
  { value: MrmThresholdOp.OUTSIDE, label: "Band (min–max)" },
];

export const thresholdOpLabel = (op: MrmThresholdOp): string =>
  THRESHOLD_SHAPE_OPTIONS.find((o) => o.value === op)?.label ?? op;

export const thresholdOpSymbol = (op: MrmThresholdOp): string => {
  switch (op) {
    case MrmThresholdOp.GTE:
      return "≥";
    case MrmThresholdOp.GT:
      return ">";
    case MrmThresholdOp.LTE:
      return "≤";
    case MrmThresholdOp.LT:
      return "<";
    default:
      return "";
  }
};

/** A compact one-line description of a threshold, e.g. "≥ 0.68" or "outside 0.10–0.20". */
export const thresholdSummary = (t: {
  op: MrmThresholdOp;
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
}): string => {
  if (t.op === MrmThresholdOp.OUTSIDE) {
    if (t.value_lo == null || t.value_hi == null) return "band";
    return `outside ${t.value_lo}–${t.value_hi}`;
  }
  if (t.value_num == null) return thresholdOpSymbol(t.op);
  return `${thresholdOpSymbol(t.op)} ${t.value_num}`;
};

// ---- Monitoring: threshold severity ----

export const THRESHOLD_SEVERITY_OPTIONS: { value: MrmThresholdSeverity; label: string }[] = [
  { value: MrmThresholdSeverity.WARN, label: "Warning" },
  { value: MrmThresholdSeverity.HIGH, label: "High" },
  { value: MrmThresholdSeverity.CRITICAL, label: "Critical" },
];

export const thresholdSeverityLabel = (severity: MrmThresholdSeverity): string =>
  THRESHOLD_SEVERITY_OPTIONS.find((o) => o.value === severity)?.label ?? severity;

export const thresholdSeverityChipVariant = (severity: MrmThresholdSeverity): ChipVariant => {
  switch (severity) {
    case MrmThresholdSeverity.CRITICAL:
      return "critical";
    case MrmThresholdSeverity.HIGH:
      return "high";
    default:
      return "warning";
  }
};

// ---- Monitoring: breach action ----

export const BREACH_ACTION_OPTIONS: { value: MrmBreachAction; label: string }[] = [
  { value: MrmBreachAction.NOTIFY, label: "Notify only" },
  {
    value: MrmBreachAction.NOTIFY_FLAG_REVALIDATION,
    label: "Notify and flag for revalidation",
  },
];

export const breachActionLabel = (action: MrmBreachAction): string =>
  BREACH_ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;

/** Match the latest monitoring row to its active threshold (by metric + segment + window). */
export const findMatchingThreshold = (
  thresholds: IMrmThreshold[],
  metric: string,
  segment: string,
  window: string,
): IMrmThreshold | undefined =>
  thresholds.find(
    (t) =>
      t.active &&
      t.metric === metric &&
      (t.segment == null || t.segment === "" || t.segment === segment) &&
      (t.window == null || t.window === "" || t.window === window),
  );

// ---- Helpers ----

/** Extract a friendly message from a repository/axios error (e.g. the 409). */
export const mrmErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as { response?: { data?: { message?: string; error?: string } } };
  return err?.response?.data?.message ?? err?.response?.data?.error ?? fallback;
};

/** Model display name for a fleet row (provider + model, gracefully degrading). */
export const fleetModelName = (row: {
  provider: string | null;
  model: string | null;
  version?: string | null;
}): string => {
  const base = [row.provider, row.model].filter(Boolean).join(" · ");
  if (!base) return "Unnamed model";
  return row.version ? `${base} (v${row.version})` : base;
};
