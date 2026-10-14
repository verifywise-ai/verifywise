/**
 * @fileoverview Shared helpers for mapping risk suggestions and risk catalog entries
 * into risk register form values.
 *
 * Covers two prefill flows for AddNewRiskForm:
 * - AI-suggested risks (e.g. AI scan results, free-form LLM output) mapped to
 *   RiskFormValues / MitigationFormValues.
 * - Risk catalog entries (MIT / IBM AI risk databases) mapped from string
 *   severity/likelihood/category values to their enum/id counterparts.
 *
 * @module components/AddNewRiskForm/riskSuggestionMappers
 */

import { SuggestedRisk } from "../../../domain/ai-detection/riskScoringTypes";
import type { RiskFormValues, MitigationFormValues } from "../../../domain/types/riskForm.types";
import type {
  MatchedCatalogRisk,
  RiskSuggestionSource,
  SuggestedFreeformRisk,
} from "../../../domain/types/riskSuggestion.types";
import { Likelihood, Severity } from "../RiskLevel/constants";
import { DEFAULT_VALUES } from "../RiskDatabaseModal/types";
import { riskCategoryItems, aiLifecyclePhase } from "./projectRiskValue";
import { riskInitialState } from "./hooks/useRiskForm";
import { palette } from "../../themes/palette";

export function mapCategoryNamesToIds(names: string[]): number[] {
  return names
    .map((name) => riskCategoryItems.find((item) => item.name === name)?._id)
    .filter((id): id is number => id !== undefined);
}

export function mapPhaseNameToId(name: string): number {
  return aiLifecyclePhase.find((item) => item.name === name)?._id ?? 0;
}

export function getRiskLevelLabel(
  likelihood: number,
  severity: number,
): { text: string; color: string } {
  const score = likelihood * severity;
  if (score >= 20) return { text: "Very high risk", color: palette.risk.critical.text };
  if (score >= 12) return { text: "High risk", color: palette.risk.high.text };
  if (score >= 6) return { text: "Medium risk", color: palette.risk.medium.text };
  if (score >= 3) return { text: "Low risk", color: palette.risk.low.text };
  return { text: "Very low risk", color: palette.status.success.text };
}

export interface RiskSuggestionMappingOptions {
  /**
   * Label for the suggestion source, used in the review notes
   * (e.g. "AI scan analysis"). Defaults to "AI scan analysis".
   */
  sourceLabel?: string;
}

export function mapSuggestionToRiskForm(
  s: SuggestedRisk,
  options: RiskSuggestionMappingOptions = {},
): RiskFormValues {
  const sourceLabel = options.sourceLabel ?? "AI scan analysis";
  return {
    riskName: s.risk_name,
    actionOwner: 0,
    aiLifecyclePhase: mapPhaseNameToId(s.ai_lifecycle_phase),
    riskDescription: s.risk_description,
    riskCategory: mapCategoryNamesToIds(s.risk_category),
    potentialImpact: s.impact,
    assessmentMapping: "",
    controlsMapping: "",
    likelihood: s.likelihood,
    riskSeverity: s.severity,
    riskLevel: 0,
    reviewNotes:
      s.finding_refs.length > 0
        ? `Suggested by ${sourceLabel}. Related findings: ${s.finding_refs.join(", ")}`
        : `Suggested by ${sourceLabel}.`,
    applicableProjects: [],
    applicableFrameworks: [],
  };
}

export function mapSuggestionToMitigationForm(s: SuggestedRisk): Partial<MitigationFormValues> {
  return {
    mitigationPlan: s.mitigation_plan,
  };
}

/**
 * Maps MIT severity strings to Severity enum.
 * MIT uses Negligible/Minor/Moderate/Major/Catastrophic severity scale.
 */
export const mapSeverityMIT = (severity: string): Severity => {
  switch (severity.toLowerCase()) {
    case "negligible":
      return Severity.Negligible;
    case "minor":
      return Severity.Minor;
    case "moderate":
      return Severity.Moderate;
    case "major":
      return Severity.Major;
    case "catastrophic":
      return Severity.Catastrophic;
    default:
      return Severity.Moderate;
  }
};

/**
 * Maps MIT likelihood strings to Likelihood enum.
 * MIT uses Rare/Unlikely/Possible/Likely/Almost Certain likelihood scale.
 */
export const mapLikelihoodMIT = (likelihood: string): Likelihood => {
  switch (likelihood.toLowerCase()) {
    case "rare":
      return Likelihood.Rare;
    case "unlikely":
      return Likelihood.Unlikely;
    case "possible":
      return Likelihood.Possible;
    case "likely":
      return Likelihood.Likely;
    case "almost certain":
      return Likelihood.AlmostCertain;
    default:
      return Likelihood.Possible;
  }
};

/**
 * Maps IBM severity strings to Severity enum.
 * IBM uses Minor/Moderate/Major severity scale.
 */
export const mapSeverityIBM = (severity: string): Severity => {
  switch (severity.toLowerCase()) {
    case "minor":
      return Severity.Minor;
    case "moderate":
      return Severity.Moderate;
    case "major":
      return Severity.Major;
    default:
      return Severity.Moderate;
  }
};

/**
 * Maps IBM likelihood strings to Likelihood enum.
 * IBM uses Unlikely/Possible/Likely likelihood scale.
 */
export const mapLikelihoodIBM = (likelihood: string): Likelihood => {
  switch (likelihood.toLowerCase()) {
    case "unlikely":
      return Likelihood.Unlikely;
    case "possible":
      return Likelihood.Possible;
    case "likely":
      return Likelihood.Likely;
    default:
      return Likelihood.Possible;
  }
};

/**
 * Maps risk category strings to their corresponding IDs
 * Categories are separated by semicolons in the source data
 *
 * @param riskCategories - Semicolon-separated category string
 * @returns Array of category IDs, defaults to [DEFAULT_CATEGORY_ID] if no matches found
 */
export const mapRiskCategories = (riskCategories: string): number[] => {
  const categories = riskCategories.split(";").map((cat) => cat.trim());
  const mappedCategories: number[] = [];

  categories.forEach((category) => {
    const matchedCategory = riskCategoryItems.find(
      (item) => item.name.toLowerCase() === category.toLowerCase(),
    );
    if (matchedCategory) {
      mappedCategories.push(matchedCategory._id);
    }
  });

  return mappedCategories.length > 0 ? mappedCategories : [DEFAULT_VALUES.DEFAULT_CATEGORY_ID];
};

// ============================================================================
// POST /api/projectRisks/suggest-ai prefill mappers
// ============================================================================

/**
 * Display labels for the risk catalogs a matched entry can come from.
 */
export const RISK_SUGGESTION_SOURCE_LABELS: Record<RiskSuggestionSource, string> = {
  mit: "MIT AI Risk Repository",
  ibm: "IBM AI Risk Atlas",
};

const CATALOG_SEVERITY_MAPPERS: Record<RiskSuggestionSource, (severity: string) => Severity> = {
  mit: mapSeverityMIT,
  ibm: mapSeverityIBM,
};

const CATALOG_LIKELIHOOD_MAPPERS: Record<RiskSuggestionSource, (likelihood: string) => Likelihood> =
  {
    mit: mapLikelihoodMIT,
    ibm: mapLikelihoodIBM,
  };

/**
 * Category names → form ids, falling back to the initial-state default ([1])
 * when nothing matches, so the form's required category field stays valid.
 */
function mapCategoryNamesWithFallback(names: string[]): number[] {
  const ids = mapCategoryNamesToIds(names);
  return ids.length > 0 ? ids : riskInitialState.riskCategory;
}

/**
 * Maps a matched MIT/IBM catalog entry from POST /projectRisks/suggest-ai into
 * risk form values. Severity/likelihood catalog strings are converted with the
 * per-source string→enum mappers (the enums are the 1-5 ids the form stores).
 */
export function mapMatchedCatalogEntryToRiskForm(entry: MatchedCatalogRisk): RiskFormValues {
  const sourceLabel = RISK_SUGGESTION_SOURCE_LABELS[entry.source];
  return {
    ...riskInitialState,
    riskName: entry.summary,
    riskDescription: entry.description,
    riskCategory: mapCategoryNamesWithFallback(entry.risk_category),
    aiLifecyclePhase: entry.ai_lifecycle_phase
      ? mapPhaseNameToId(entry.ai_lifecycle_phase)
      : riskInitialState.aiLifecyclePhase,
    likelihood: CATALOG_LIKELIHOOD_MAPPERS[entry.source](entry.likelihood),
    riskSeverity: CATALOG_SEVERITY_MAPPERS[entry.source](entry.severity),
    reviewNotes: `Imported from ${sourceLabel} — AI suggestion for this use case. ${entry.reason}`,
  };
}

/**
 * Maps a free-form LLM suggestion from POST /projectRisks/suggest-ai into risk
 * form values. Likelihood/severity arrive as 1-5 ints and pass straight through.
 */
export function mapFreeformSuggestionToRiskForm(s: SuggestedFreeformRisk): RiskFormValues {
  return {
    ...riskInitialState,
    riskName: s.risk_name,
    riskDescription: s.risk_description,
    riskCategory: mapCategoryNamesWithFallback(s.risk_category),
    aiLifecyclePhase: s.ai_lifecycle_phase
      ? mapPhaseNameToId(s.ai_lifecycle_phase)
      : riskInitialState.aiLifecyclePhase,
    likelihood: s.likelihood,
    riskSeverity: s.severity,
    potentialImpact: s.impact,
    reviewNotes: "Suggested by AI based on the use case description.",
  };
}

export function mapFreeformSuggestionToMitigationForm(
  s: SuggestedFreeformRisk,
): Partial<MitigationFormValues> {
  return {
    mitigationPlan: s.mitigation_plan,
    likelihood: s.likelihood,
    riskSeverity: s.severity,
  };
}
