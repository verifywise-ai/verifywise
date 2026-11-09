// Servers/services/intakeScoring/riskMappers.ts
// Pure mappers between the catalog / LLM vocabularies and the risk register
// enums. The catalog tables must match Clients mapLikelihoodMIT/IBM and
// mapSeverityMIT/IBM exactly (pinned by catalogMapperParity.test.ts).
import { ModelRiskCategory } from "../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../domain.layer/enums/model-risk-level.enum";
import {
  calculateRiskLevel,
  LIKELIHOOD_SCALE,
  SEVERITY_SCALE,
  RISK_CALCULATION_WEIGHTS,
} from "../../utils/validations/riskValidation.utils";

export type Likelihood = "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
export type Severity = "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";

export const LIKELIHOODS: Likelihood[] = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost Certain",
];
export const SEVERITIES: Severity[] = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];

const clampIndex = (n: number): number => Math.min(5, Math.max(1, Math.round(n))) - 1;

export const likelihoodFromScale = (n: number): Likelihood => LIKELIHOODS[clampIndex(n)];
export const severityFromScale = (n: number): Severity => SEVERITIES[clampIndex(n)];

// IBM's scales are subsets of MIT's; anything outside a source's own scale
// (or unknown) falls back to Possible / Moderate, as the client does.
const CATALOG_LIKELIHOODS: Record<"mit" | "ibm", Likelihood[]> = {
  mit: LIKELIHOODS,
  ibm: ["Unlikely", "Possible", "Likely"],
};
const CATALOG_SEVERITIES: Record<"mit" | "ibm", Severity[]> = {
  mit: SEVERITIES,
  ibm: ["Minor", "Moderate", "Major"],
};

export function likelihoodFromCatalog(source: "mit" | "ibm", s: string): Likelihood {
  const key = s.toLowerCase();
  return CATALOG_LIKELIHOODS[source].find((l) => l.toLowerCase() === key) ?? "Possible";
}

export function severityFromCatalog(source: "mit" | "ibm", s: string): Severity {
  const key = s.toLowerCase();
  return CATALOG_SEVERITIES[source].find((v) => v.toLowerCase() === key) ?? "Moderate";
}

export const weightedRiskScore = (l: Likelihood, s: Severity): number =>
  LIKELIHOOD_SCALE[l] * RISK_CALCULATION_WEIGHTS.LIKELIHOOD_WEIGHT +
  SEVERITY_SCALE[s] * RISK_CALCULATION_WEIGHTS.SEVERITY_WEIGHT;

export function modelRiskLevelFor(l: Likelihood, s: Severity): ModelRiskLevel {
  switch (calculateRiskLevel(s, l)) {
    case "Very high risk":
      return ModelRiskLevel.CRITICAL;
    case "High risk":
      return ModelRiskLevel.HIGH;
    case "Medium risk":
      return ModelRiskLevel.MEDIUM;
    default:
      return ModelRiskLevel.LOW;
  }
}

// Keyword -> model risk category, first match wins (in this order), matched
// case-insensitively against the register categories of a suggestion.
// Nothing matched, or no categories -> Compliance.
const MODEL_CATEGORY_KEYWORDS: Array<[RegExp, ModelRiskCategory]> = [
  [/bias|discriminat|fair|toxic/, ModelRiskCategory.BIAS],
  [/secur|cyber|fraud/, ModelRiskCategory.SECURITY],
  [/privacy|data/, ModelRiskCategory.DATA_QUALITY],
  [/technolog|operational|safety|performance|reliab/, ModelRiskCategory.PERFORMANCE],
  [/complian|legal|regulat/, ModelRiskCategory.COMPLIANCE],
];

export function modelRiskCategoryFor(categories: string[]): ModelRiskCategory {
  for (const [pattern, category] of MODEL_CATEGORY_KEYWORDS) {
    if (categories.some((c) => pattern.test(c.toLowerCase()))) return category;
  }
  return ModelRiskCategory.COMPLIANCE;
}
