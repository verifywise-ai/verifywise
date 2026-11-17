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

/** Likelihood label to 1-5 score. */
export const LIKELIHOOD_SCALE = {
  Rare: 1,
  Unlikely: 2,
  Possible: 3,
  Likely: 4,
  "Almost Certain": 5,
} as const;

/** Severity label to 1-5 score. */
export const SEVERITY_SCALE = {
  Negligible: 1,
  Minor: 2,
  Moderate: 3,
  Major: 4,
  Catastrophic: 5,
} as const;

/** score = LIKELIHOOD_WEIGHT * likelihood + SEVERITY_WEIGHT * severity. */
export const RISK_CALCULATION_WEIGHTS = {
  LIKELIHOOD_WEIGHT: 1,
  SEVERITY_WEIGHT: 3,
} as const;

const lowerKeys = (scale: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(scale).map(([k, v]) => [k.toLowerCase(), v]));

const LIKELIHOOD_SCORE = lowerKeys(LIKELIHOOD_SCALE);

// "Critical" is the label residual severity is stored under; it scores like
// "Catastrophic".
const SEVERITY_SCORE: Record<string, number> = {
  ...lowerKeys(SEVERITY_SCALE),
  critical: SEVERITY_SCALE.Catastrophic,
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
  const score =
    l * RISK_CALCULATION_WEIGHTS.LIKELIHOOD_WEIGHT + s * RISK_CALCULATION_WEIGHTS.SEVERITY_WEIGHT;
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

/**
 * Effective level of a risk row: the current level when set (an empty string
 * counts as unset), otherwise the inherent level. Null when neither is set.
 */
export function getEffectiveRiskLevel(row: {
  current_risk_level?: string | null;
  risk_level_autocalculated?: string | null;
}): string | null {
  return row.current_risk_level || row.risk_level_autocalculated || null;
}

type LevelInputs = {
  likelihood?: unknown;
  severity?: unknown;
  likelihood_mitigation?: unknown;
  risk_severity?: unknown;
};

const isCleared = (v: unknown) => v === null || v === undefined || v === "";

function levelFor(
  sentLikelihood: unknown,
  sentSeverity: unknown,
  storedLikelihood: unknown,
  storedSeverity: unknown,
): { write: boolean; level: string | null } {
  if (sentLikelihood === undefined && sentSeverity === undefined) {
    return { write: false, level: null };
  }
  const likelihood = sentLikelihood !== undefined ? sentLikelihood : storedLikelihood;
  const severity = sentSeverity !== undefined ? sentSeverity : storedSeverity;
  const level = calculateRiskLevel(likelihood as string, severity as string);
  if (level) return { write: true, level };
  // An explicit clear clears the level; an unrecognised label leaves it as stored.
  if (isCleared(likelihood) || isCleared(severity)) return { write: true, level: null };
  return { write: false, level: null };
}

/**
 * The level columns to write for an update. A pair's level is recomputed only
 * when one of that pair's inputs is sent, from sent-else-stored values; it is
 * null when an input is cleared and absent when a label is unrecognised.
 */
export function computeRiskLevelUpdates(
  updateData: LevelInputs,
  storedRisk: LevelInputs,
): { risk_level_autocalculated?: string | null; final_risk_level?: string | null } {
  const out: { risk_level_autocalculated?: string | null; final_risk_level?: string | null } = {};
  const inherent = levelFor(
    updateData.likelihood,
    updateData.severity,
    storedRisk.likelihood,
    storedRisk.severity,
  );
  if (inherent.write) out.risk_level_autocalculated = inherent.level;
  const residual = levelFor(
    updateData.likelihood_mitigation,
    updateData.risk_severity,
    storedRisk.likelihood_mitigation,
    storedRisk.risk_severity,
  );
  if (residual.write) out.final_risk_level = residual.level;
  return out;
}
