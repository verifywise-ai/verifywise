import { AiAppStatus } from "../../../domain/enums/aiApp.enum";
import { palette } from "../../themes/palette";

/**
 * Status options shared across the AI apps filter, the create modal and the
 * approval center. The "all" option is only relevant to the list filter, so it
 * is exposed separately rather than baked into the base list.
 */
export const STATUS_OPTIONS: ReadonlyArray<{ _id: AiAppStatus; name: string }> = [
  { _id: AiAppStatus.DRAFT, name: "Draft" },
  { _id: AiAppStatus.UNDER_REVIEW, name: "Under review" },
  { _id: AiAppStatus.APPROVED, name: "Approved" },
  { _id: AiAppStatus.RESTRICTED, name: "Restricted" },
  { _id: AiAppStatus.BANNED, name: "Banned" },
];

/** Status options including the "All statuses" entry used by the list filter. */
export const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  _id: AiAppStatus | "all";
  name: string;
}> = [{ _id: "all", name: "All statuses" }, ...STATUS_OPTIONS];

export interface StatusChipProps {
  label: string;
  backgroundColor: string;
  textColor: string;
}

/** Maps an AI app status to the chip styling used to render it. */
export function statusToChipProps(status: AiAppStatus): StatusChipProps {
  switch (status) {
    case AiAppStatus.APPROVED:
      return {
        label: "Approved",
        backgroundColor: palette.status.success.bg,
        textColor: palette.status.success.text,
      };
    case AiAppStatus.UNDER_REVIEW:
      return {
        label: "Under review",
        backgroundColor: palette.status.warning.bg,
        textColor: palette.status.warning.text,
      };
    case AiAppStatus.RESTRICTED:
      return {
        label: "Restricted",
        backgroundColor: palette.accent.orange.bg,
        textColor: palette.accent.orange.text,
      };
    case AiAppStatus.BANNED:
      return {
        label: "Banned",
        backgroundColor: palette.status.error.bg,
        textColor: palette.status.error.text,
      };
    default:
      return {
        label: "Draft",
        backgroundColor: palette.status.default.bg,
        textColor: palette.status.default.text,
      };
  }
}

/**
 * Turns a discovered-source enum value (e.g. "shadow_ai") into a human-readable
 * label (e.g. "shadow ai") by replacing underscores with spaces.
 */
export function formatDiscoveredSource(source: string): string {
  // Sentence case with the "AI"/"SSO" acronyms kept uppercase
  // (e.g. shadow_ai → "Shadow AI", employee_report → "Employee report", sso → "SSO").
  const words = source.split("_").map((word, index) => {
    if (word === "ai" || word === "sso") return word.toUpperCase();
    if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
    return word;
  });
  return words.join(" ");
}

// ---------------------------------------------------------------------------
// Risk assessment
// ---------------------------------------------------------------------------

export interface RiskCriterion {
  key: string;
  label: string;
  description: string;
  weight: number;
}

export const RISK_CRITERIA: ReadonlyArray<RiskCriterion> = [
  {
    key: "data_sensitivity",
    label: "Data sensitivity",
    description: "Sensitivity of data the app can access or process",
    weight: 1,
  },
  {
    key: "user_exposure",
    label: "User exposure",
    description: "Number of employees, departments or external users with access",
    weight: 1,
  },
  {
    key: "business_criticality",
    label: "Business criticality",
    description: "Impact on operations if the app becomes unavailable or wrong",
    weight: 1,
  },
  {
    key: "vendor_maturity",
    label: "Vendor maturity",
    description: "Vendor security posture, review status and track record",
    weight: 1,
  },
  {
    key: "regulatory_scope",
    label: "Regulatory scope",
    description: "Applicable regulations such as GDPR, HIPAA or sector rules",
    weight: 1,
  },
  {
    key: "output_impact",
    label: "Output impact",
    description: "Consequences of incorrect or biased outputs on customers or IP",
    weight: 1,
  },
];

/** Slider marks for each 1-5 criterion score. */
/** Options for the per-criterion score dropdowns (1 lowest to 5 highest). */
export const RISK_SCORE_OPTIONS: ReadonlyArray<{ _id: number; name: string }> = [
  { _id: 1, name: "1 - Very low" },
  { _id: 2, name: "2 - Low" },
  { _id: 3, name: "3 - Moderate" },
  { _id: 4, name: "4 - High" },
  { _id: 5, name: "5 - Very high" },
];

/** Default per-criterion score used before any score exists. */
export const DEFAULT_CRITERION_SCORE = 3;

export interface RiskLevel {
  label: string;
  color: string;
}

/** Maps a 0-100 risk score to a qualitative level and colour. */
export function getRiskLevel(score: number): RiskLevel {
  if (score <= 20) return { label: "Low", color: palette.status.success.text };
  if (score <= 40) return { label: "Medium", color: palette.status.warning.text };
  if (score <= 60) return { label: "High", color: palette.accent.orange.text };
  return { label: "Critical", color: palette.status.error.text };
}

/** Builds the initial per-criterion scores map, all set to the default value. */
export function buildDefaultScores(): Record<string, number> {
  const initial: Record<string, number> = {};
  RISK_CRITERIA.forEach((c) => {
    initial[c.key] = DEFAULT_CRITERION_SCORE;
  });
  return initial;
}

/**
 * Back-calculates per-criterion 1-5 scores from a stored 0-100 risk score so
 * the sliders can be pre-populated when re-opening an assessed app.
 */
export function scoresFromRiskScore(riskScore: number | null | undefined): Record<string, number> {
  if (riskScore === null || riskScore === undefined) {
    return buildDefaultScores();
  }
  const clamped = Math.max(0, Math.min(100, riskScore));
  const average = clamped / 20;
  const initial: Record<string, number> = {};
  RISK_CRITERIA.forEach((c) => {
    initial[c.key] = Math.max(1, Math.min(5, Math.round(average)));
  });
  return initial;
}

/**
 * Computes a weighted 0-100 risk score from the per-criterion 1-5 scores.
 */
export function calculateRiskScore(scores: Record<string, number>): number {
  let weightedSum = 0;
  let totalWeight = 0;
  RISK_CRITERIA.forEach((criterion) => {
    weightedSum += (scores[criterion.key] ?? DEFAULT_CRITERION_SCORE) * criterion.weight;
    totalWeight += criterion.weight;
  });
  if (totalWeight === 0) return 0;
  const average = weightedSum / totalWeight;
  return Math.max(0, Math.min(100, Math.round(average * 20)));
}
