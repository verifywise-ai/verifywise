// Servers/services/intakeScoring/intakeSuggestions.ts
// Up to MAX_SUGGESTIONS suggested risks for an intake submission, in register
// vocabulary. Pure service code: no DB, no routes. Nothing here becomes a real
// risk until a reviewer accepts it and the submission is approved.
import { randomUUID } from "crypto";
import type { GenerateObjectImpl } from "../../advisor/llmSelfCorrect";
import type { createModelFromKey } from "../../advisor/llmModelFactory";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";
import type { ModelRiskCategory } from "../../domain.layer/enums/model-risk-category.enum";
import type { ModelRiskLevel } from "../../domain.layer/enums/model-risk-level.enum";
import { SEVERITY_SCALE } from "../../utils/validations/riskValidation.utils";
import { suggestRisksForUseCase } from "../riskSuggestions/riskSuggestions.service";
import type { UseCaseInput } from "../riskSuggestions/riskSuggestions.service";
import type { ClassificationContext } from "./aiScoring";
import type { ScoringAnswer } from "./scoringInput";
import {
  Likelihood,
  Severity,
  likelihoodFromCatalog,
  likelihoodFromScale,
  modelRiskCategoryFor,
  modelRiskLevelFor,
  severityFromCatalog,
  severityFromScale,
  weightedRiskScore,
} from "./riskMappers";

export type { Likelihood, Severity };

export type SuggestionState = "suggested" | "accepted" | "dismissed";

export interface IntakeSuggestedRisk {
  id: string;
  source: "mit" | "ibm" | "ai";
  name: string;
  description: string;
  categories: string[];
  lifecyclePhase?: string;
  likelihood: Likelihood;
  severity: Severity;
  impact: string;
  /** The risk register requires one; "" only when the model omitted it. */
  mitigationPlan: string;
  implementationStrategy: string;
  /** ISO date; null means approval + 90 days. */
  deadline: string | null;
  /** Set for MODEL submissions. */
  modelRiskCategory?: ModelRiskCategory;
  modelRiskLevel?: ModelRiskLevel;
  state: SuggestionState;
  editedBy?: number;
  editedAt?: string;
  decidedBy?: number;
  decidedAt?: string;
}

export const MAX_SUGGESTIONS = 10;

/**
 * The text handed to the suggester as fenced context: the answers as
 * `label: text` lines plus the rules classification. Contact data never gets
 * here: buildScoringAnswers already drops email fields.
 */
function buildContext(
  answers: ScoringAnswer[],
  classification: ClassificationContext | null,
): string {
  const lines = answers.map((a) => `${a.label}: ${a.text}`);
  if (classification) {
    lines.push(`Rules classification: ${classification.level}`);
    for (const reason of classification.reasons) {
      lines.push(`${reason.article}: ${reason.text}`);
    }
  }
  return lines.join("\n");
}

export async function generateIntakeSuggestions(params: {
  model: ReturnType<typeof createModelFromKey>;
  entityType: IntakeEntityType;
  useCase: UseCaseInput;
  answers: ScoringAnswer[];
  classification: ClassificationContext | null;
  generateImpl?: GenerateObjectImpl;
}): Promise<{ items: IntakeSuggestedRisk[]; droppedCount: number }> {
  const { model, entityType, useCase, answers, classification, generateImpl } = params;
  const context = buildContext(answers, classification);

  const result = await suggestRisksForUseCase({
    model,
    useCase: context ? { ...useCase, context } : useCase,
    existingRiskNames: [],
    generateImpl,
  });

  const withModelFields = (
    item: Omit<IntakeSuggestedRisk, "modelRiskCategory" | "modelRiskLevel">,
  ): IntakeSuggestedRisk =>
    entityType === IntakeEntityType.MODEL
      ? {
          ...item,
          modelRiskCategory: modelRiskCategoryFor(item.categories),
          modelRiskLevel: modelRiskLevelFor(item.likelihood, item.severity),
        }
      : item;

  const all: IntakeSuggestedRisk[] = [
    ...result.matched.map((m) =>
      withModelFields({
        id: randomUUID(),
        source: m.source,
        name: m.summary,
        description: m.description,
        categories: m.risk_category,
        ...(m.ai_lifecycle_phase ? { lifecyclePhase: m.ai_lifecycle_phase } : {}),
        likelihood: likelihoodFromCatalog(m.source, m.likelihood),
        severity: severityFromCatalog(m.source, m.severity),
        // Catalog entries carry no impact text of their own; the model drafts
        // one for this use case, and its match reason stands in if it didn't.
        impact: m.impact || m.reason,
        mitigationPlan: m.mitigation_plan,
        implementationStrategy: m.implementation_strategy,
        deadline: null,
        state: "suggested",
      }),
    ),
    ...result.suggested.map((s) =>
      withModelFields({
        id: randomUUID(),
        source: "ai",
        name: s.risk_name,
        description: s.risk_description,
        categories: s.risk_category,
        ...(s.ai_lifecycle_phase ? { lifecyclePhase: s.ai_lifecycle_phase } : {}),
        likelihood: likelihoodFromScale(s.likelihood),
        severity: severityFromScale(s.severity),
        impact: s.impact,
        mitigationPlan: s.mitigation_plan,
        implementationStrategy: s.implementation_strategy,
        deadline: null,
        state: "suggested",
      }),
    ),
  ];

  // Array.prototype.sort is stable, so ties keep matched-before-suggested order.
  all.sort(
    (a, b) =>
      weightedRiskScore(b.likelihood, b.severity) - weightedRiskScore(a.likelihood, a.severity) ||
      SEVERITY_SCALE[b.severity] - SEVERITY_SCALE[a.severity],
  );

  return {
    items: all.slice(0, MAX_SUGGESTIONS),
    droppedCount: Math.max(0, all.length - MAX_SUGGESTIONS),
  };
}
