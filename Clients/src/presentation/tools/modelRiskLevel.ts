/**
 * A model risk's level from its likelihood and severity (decision 10).
 *
 * The level comes from the shared formula (`RiskCalculator`), mapped onto
 * the four stored model risk levels as the server does
 * (`calculateModelRiskLevel` in Servers/utils/riskLevel.utils.ts): "No risk"
 * and "Low risk" are Low, "Very high risk" is Critical.
 */
import { RiskCalculator } from "./riskCalculator";
import { RiskLikelihood, RiskSeverity } from "../components/RiskLevel/riskValues";
import { ModelRiskLevel } from "../../domain/interfaces/i.modelRisk";

export const MODEL_RISK_LIKELIHOODS = Object.values(RiskLikelihood);
export const MODEL_RISK_SEVERITIES = Object.values(RiskSeverity);

/**
 * Select options: the stored value is the canonical label ("Almost Certain"),
 * the text shown is in sentence case ("Almost certain"), which the i18n
 * dictionaries translate.
 */
// Written out so the i18n audit sees each text.
const LIKELIHOOD_TEXT: Record<RiskLikelihood, string> = {
  [RiskLikelihood.Rare]: "Rare",
  [RiskLikelihood.Unlikely]: "Unlikely",
  [RiskLikelihood.Possible]: "Possible",
  [RiskLikelihood.Likely]: "Likely",
  [RiskLikelihood.AlmostCertain]: "Almost certain",
};
const SEVERITY_TEXT: Record<RiskSeverity, string> = {
  [RiskSeverity.Negligible]: "Negligible",
  [RiskSeverity.Minor]: "Minor",
  [RiskSeverity.Moderate]: "Moderate",
  [RiskSeverity.Major]: "Major",
  [RiskSeverity.Catastrophic]: "Catastrophic",
};

export const MODEL_RISK_LIKELIHOOD_OPTIONS = MODEL_RISK_LIKELIHOODS.map((l) => ({
  _id: l,
  name: LIKELIHOOD_TEXT[l],
}));
export const MODEL_RISK_SEVERITY_OPTIONS = MODEL_RISK_SEVERITIES.map((s) => ({
  _id: s,
  name: SEVERITY_TEXT[s],
}));

const LEVEL_FOR: Record<string, ModelRiskLevel> = {
  "No risk": ModelRiskLevel.LOW,
  "Low risk": ModelRiskLevel.LOW,
  "Medium risk": ModelRiskLevel.MEDIUM,
  "High risk": ModelRiskLevel.HIGH,
  "Very high risk": ModelRiskLevel.CRITICAL,
};

const isLikelihood = (value: unknown): value is RiskLikelihood =>
  MODEL_RISK_LIKELIHOODS.includes(value as RiskLikelihood);
const isSeverity = (value: unknown): value is RiskSeverity =>
  MODEL_RISK_SEVERITIES.includes(value as RiskSeverity);

/** The level the server stores for this pair, or null when either is missing or not a label. */
export function computeModelRiskLevel(
  likelihood: string | null | undefined,
  severity: string | null | undefined,
): ModelRiskLevel | null {
  if (!isLikelihood(likelihood) || !isSeverity(severity)) return null;
  return LEVEL_FOR[RiskCalculator.getRiskLevel(likelihood, severity).level] ?? null;
}

type LevelFields = {
  likelihood?: string | null;
  severity?: string | null;
  risk_level?: ModelRiskLevel;
};

/**
 * Whether the form still asks for a hand-picked level: only when editing an
 * older risk that lacks a likelihood or severity. A new risk needs both.
 */
export const picksModelRiskLevel = (values: LevelFields, isEdit: boolean): boolean =>
  isEdit && !computeModelRiskLevel(values.likelihood, values.severity);

/**
 * The body to save: no empty likelihood or severity, and no level unless it
 * is still hand-picked (the server computes it when both are set).
 */
export function modelRiskSaveBody<T extends LevelFields>(values: T, isEdit: boolean): T {
  const { risk_level, likelihood, severity, ...rest } = values;
  return {
    ...rest,
    ...(likelihood ? { likelihood } : {}),
    ...(severity ? { severity } : {}),
    ...(picksModelRiskLevel(values, isEdit) && risk_level ? { risk_level } : {}),
  } as T;
}
