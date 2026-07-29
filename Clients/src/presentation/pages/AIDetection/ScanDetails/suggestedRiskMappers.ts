/**
 * @fileoverview Helpers for mapping AI-suggested risks into risk register form values.
 *
 * @module pages/AIDetection/ScanDetails/suggestedRiskMappers
 */

import { SuggestedRisk } from "../../../../domain/ai-detection/riskScoringTypes";
import type { RiskFormValues, MitigationFormValues } from "../../../../domain/types/riskForm.types";
import {
  riskCategoryItems,
  aiLifecyclePhase,
} from "../../../components/AddNewRiskForm/projectRiskValue";
import { palette } from "../../../themes/palette";

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

export function mapSuggestionToRiskForm(s: SuggestedRisk): RiskFormValues {
  return {
    riskName: s.risk_name,
    actionOwner: 0,
    aiLifecyclePhase: mapPhaseNameToId(s.ai_lifecycle_phase),
    riskDescription: s.risk_description,
    riskCategory: mapCategoryNamesToIds(s.risk_category),
    potentialImpact: s.impact,
    assessmentMapping: 0,
    controlsMapping: 0,
    likelihood: s.likelihood,
    riskSeverity: s.severity,
    riskLevel: 0,
    reviewNotes:
      s.finding_refs.length > 0
        ? `Suggested by AI scan analysis. Related findings: ${s.finding_refs.join(", ")}`
        : "Suggested by AI scan analysis.",
    applicableProjects: [],
    applicableFrameworks: [],
  };
}

export function mapSuggestionToMitigationForm(s: SuggestedRisk): Partial<MitigationFormValues> {
  return {
    mitigationPlan: s.mitigation_plan,
  };
}
