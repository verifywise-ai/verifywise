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
