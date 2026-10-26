// Servers/services/intakeScoring/approvalRisks.ts
// What approving an intake submission writes: the risks reviewers accepted,
// in register form, and the score re-floored under the final EU AI Act level.
// Pure functions; the approve handler does the writes in its transaction.
import type { IModelRisk } from "../../domain.layer/interfaces/i.modelRisk";
import { ModelRiskStatus } from "../../domain.layer/enums/model-risk-status.enum";
import type { IRiskAssessmentV2 } from "../../domain.layer/interfaces/i.intakeSubmission";
import type { CreateRiskServiceInput } from "../risk.service";
import { calculateRiskLevel } from "../../utils/validations/riskValidation.utils";
import type { IntakeSuggestedRisk } from "./intakeSuggestions";
import { modelRiskCategoryFor, modelRiskLevelFor } from "./riskMappers";
import { bandFor, ClassificationLevel, combineScore, ruleMinimumFor } from "./scoreMath";

/** When a suggestion has no deadline, the risk is due this long after approval. */
export const DEFAULT_DEADLINE_DAYS = 90;

/**
 * The register form's default category ("Strategic risk", id 1 on the client)
 * for a suggestion with none the register knows.
 */
export const DEFAULT_RISK_CATEGORY = "Strategic risk";

const SOURCE_LABELS: Record<IntakeSuggestedRisk["source"], string> = {
  mit: "MIT AI Risk Repository",
  ibm: "IBM AI Risk Atlas",
  ai: "AI suggestion",
};

export interface ApprovalContext {
  approverId: number;
  approvedAt: Date;
  submissionId: number;
}

/** The suggestion's deadline, or approval + 90 days, as an ISO date. */
export function deadlineFor(s: IntakeSuggestedRisk, approvedAt: Date): string {
  if (s.deadline) return s.deadline;
  const due = new Date(approvedAt.getTime());
  due.setUTCDate(due.getUTCDate() + DEFAULT_DEADLINE_DAYS);
  return due.toISOString().slice(0, 10);
}

const reviewNote = (s: IntakeSuggestedRisk, submissionId: number) =>
  `Accepted from intake submission #${submissionId} (${SOURCE_LABELS[s.source]}).`;

export function buildUseCaseRiskFromSuggestion(
  s: IntakeSuggestedRisk,
  ctx: ApprovalContext & { useCaseId: number },
): CreateRiskServiceInput {
  return {
    risk_name: s.name,
    risk_description: s.description,
    risk_category: s.categories.length > 0 ? s.categories : [DEFAULT_RISK_CATEGORY],
    ai_lifecycle_phase: (s.lifecyclePhase ?? null) as CreateRiskServiceInput["ai_lifecycle_phase"],
    likelihood: s.likelihood as CreateRiskServiceInput["likelihood"],
    severity: s.severity as CreateRiskServiceInput["severity"],
    risk_level_autocalculated: calculateRiskLevel(
      s.severity,
      s.likelihood,
    ) as CreateRiskServiceInput["risk_level_autocalculated"],
    impact: s.impact,
    mitigation_plan: s.mitigationPlan,
    implementation_strategy: s.implementationStrategy,
    risk_owner: ctx.approverId,
    deadline: deadlineFor(s, ctx.approvedAt) as unknown as Date,
    mitigation_status: "Not Started" as CreateRiskServiceInput["mitigation_status"],
    review_notes: reviewNote(s, ctx.submissionId),
    projects: [ctx.useCaseId],
    frameworks: [],
  };
}

export function buildModelRiskFromSuggestion(
  s: IntakeSuggestedRisk,
  ctx: ApprovalContext & { modelId: number },
): Partial<IModelRisk> {
  return {
    risk_name: s.name,
    description: s.description,
    risk_category: s.modelRiskCategory ?? modelRiskCategoryFor(s.categories),
    risk_level: s.modelRiskLevel ?? modelRiskLevelFor(s.likelihood, s.severity),
    status: ModelRiskStatus.OPEN,
    owner: String(ctx.approverId),
    target_date: deadlineFor(s, ctx.approvedAt),
    likelihood: s.likelihood,
    impact: s.impact,
    mitigation_plan: s.mitigationPlan,
    model_id: ctx.modelId,
  };
}

/**
 * The stored score re-floored under the level the submission is approved at
 * (the reviewer may have changed it). The AI median only counts when scoring
 * completed.
 */
export function recomputeAssessmentForLevel(
  a: IRiskAssessmentV2,
  level: ClassificationLevel | null,
): IRiskAssessmentV2 {
  const ruleMinimum = ruleMinimumFor(level);
  const aiMedian = a.status === "complete" ? (a.ai?.median ?? null) : null;
  const combined = combineScore({ ruleMinimum, aiMedian });
  return {
    ...a,
    classificationLevel: level,
    notRuleChecked: level === null,
    ruleMinimum,
    finalScore: combined.finalScore,
    source: combined.source,
    rulesOnly: combined.rulesOnly,
    overallScore: combined.finalScore,
    tier: combined.finalScore === null ? null : bandFor(combined.finalScore),
  };
}
