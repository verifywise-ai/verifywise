/**
 * Shared risk-level rules for the risk register.
 *
 * One formula, one spelling:
 *   score = 1 * likelihood + 3 * severity (each 1-5)
 *   <= 4 "No risk", <= 8 "Low risk", <= 12 "Medium risk", <= 16 "High risk",
 *   otherwise "Very high risk".
 * Mirrors Clients/src/presentation/tools/riskCalculator.ts. "Very low risk"
 * stays a valid stored value (for the current level) but no formula produces it.
 *
 * Effective level = current_risk_level when set, else risk_level_autocalculated.
 */

const LIKELIHOOD_SCORE: Record<string, number> = {
  rare: 1,
  unlikely: 2,
  possible: 3,
  likely: 4,
  "almost certain": 5,
};

// "Critical" is the label residual severity is stored under; it scores like
// "Catastrophic".
const SEVERITY_SCORE: Record<string, number> = {
  negligible: 1,
  minor: 2,
  moderate: 3,
  major: 4,
  catastrophic: 5,
  critical: 5,
};

/**
 * Risk level for a likelihood and severity label (case-insensitive).
 * Returns null when either is missing or not a known label.
 */
export function calculateRiskLevel(
  likelihood: string | null | undefined,
  severity: string | null | undefined,
): string | null {
  if (!likelihood || !severity) return null;
  const l = LIKELIHOOD_SCORE[likelihood.trim().toLowerCase()];
  const s = SEVERITY_SCORE[severity.trim().toLowerCase()];
  if (!l || !s) return null;
  const score = l * 1 + s * 3;
  if (score <= 4) return "No risk";
  if (score <= 8) return "Low risk";
  if (score <= 12) return "Medium risk";
  if (score <= 16) return "High risk";
  return "Very high risk";
}

/**
 * The current level used to be stored as "Very Low risk". Every input that
 * accepts a current level takes both spellings and stores "Very low risk".
 */
export type NormalizedRiskLevel<T> = T extends "Very Low risk" ? "Very low risk" : T;

export function normalizeCurrentRiskLevel<T>(value: T): NormalizedRiskLevel<T> {
  return (value === "Very Low risk" ? "Very low risk" : value) as NormalizedRiskLevel<T>;
}

/** SQL for the effective level of a project_risks row: current, else inherent. */
export function effectiveRiskLevelSql(alias: string): string {
  return `COALESCE(${alias}.current_risk_level::text, ${alias}.risk_level_autocalculated::text)`;
}

/** SQL CASE ranking a level expression: No risk 0 ... Very high risk 5. */
export function riskLevelRankSql(expr: string): string {
  return `CASE lower(${expr})
    WHEN 'no risk' THEN 0
    WHEN 'very low risk' THEN 1
    WHEN 'low risk' THEN 2
    WHEN 'medium risk' THEN 3
    WHEN 'high risk' THEN 4
    WHEN 'very high risk' THEN 5
  END`;
}
