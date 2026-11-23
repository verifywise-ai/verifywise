/**
 * @fileoverview The one place that decides which risk level a risk shows.
 *
 * The effective level is the current (residual) level when set, else the
 * inherent level (`risk_level_autocalculated`). Cards, filters, sorting and
 * dashboards all read it through here so they cannot disagree.
 *
 * @module application/utils/riskLevel
 */

export type RiskLevelBucket = "veryLow" | "low" | "medium" | "high" | "veryHigh";

type RiskLevelFields = {
  current_risk_level?: string | null;
  risk_level_autocalculated?: string | null;
};

/** Levels lowest to highest, without the trailing " risk". "No risk" and "Very low risk" share a card bucket. */
const LEVELS: { key: string; bucket: RiskLevelBucket }[] = [
  { key: "no", bucket: "veryLow" },
  { key: "very low", bucket: "veryLow" },
  { key: "low", bucket: "low" },
  { key: "medium", bucket: "medium" },
  { key: "high", bucket: "high" },
  { key: "very high", bucket: "veryHigh" },
];

/** Case-insensitive key: "Very Low risk" and "very low" both give "very low". */
const levelKey = (level: string | null | undefined): string =>
  (level ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+risk$/, "");

/**
 * The vendor risk level labels lowest to highest, as cards and the level
 * filter show them. The server computes vendor risk levels with the same
 * formula as project risks, so "No risk" is the lowest (no formula gives
 * "Very low"; an older stored "Very low" counts as "No risk").
 */
export const VENDOR_RISK_LEVEL_LABELS = ["No risk", "Low", "Medium", "High", "Very high"] as const;
export type VendorRiskLevelLabel = (typeof VENDOR_RISK_LEVEL_LABELS)[number];

const VENDOR_LABEL_BY_BUCKET: Record<RiskLevelBucket, VendorRiskLevelLabel> = {
  veryLow: "No risk",
  low: "Low",
  medium: "Medium",
  high: "High",
  veryHigh: "Very high",
};

/** The card and filter label of a stored vendor risk level, or null when unknown. */
export function vendorRiskLevelLabel(
  level: string | null | undefined,
): VendorRiskLevelLabel | null {
  const bucket = riskLevelBucket(level);
  return bucket ? VENDOR_LABEL_BY_BUCKET[bucket] : null;
}

/**
 * Sort rank of a vendor risk level: 0 when not assessed (empty or unknown),
 * then 1 (No risk, and an older "Very low") to 5 (Very high), so the order
 * matches the cards.
 */
export function vendorRiskLevelRank(level: string | null | undefined): number {
  const label = vendorRiskLevelLabel(level);
  return label ? VENDOR_RISK_LEVEL_LABELS.indexOf(label) + 1 : 0;
}

/** The level a risk shows: current level when set, else the inherent level. */
export function getEffectiveRiskLevel(risk: RiskLevelFields): string {
  return risk.current_risk_level || risk.risk_level_autocalculated || "";
}

/** The summary card bucket for a level (case-insensitive), or null when unknown. */
export function riskLevelBucket(level: string | null | undefined): RiskLevelBucket | null {
  const key = levelKey(level);
  return LEVELS.find((l) => l.key === key)?.bucket ?? null;
}

/** Sort rank for a level (case-insensitive): 1 (No risk) to 6 (Very high risk); 0 when unknown. */
export function riskLevelRank(level: string | null | undefined): number {
  const key = levelKey(level);
  return LEVELS.findIndex((l) => l.key === key) + 1;
}
