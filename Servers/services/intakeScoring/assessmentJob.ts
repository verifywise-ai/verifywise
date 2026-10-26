// Servers/services/intakeScoring/assessmentJob.ts
// The background job behind an intake submission's AI assessment: scoring and
// suggested risks, each stored as its own stage, then the new-submission email
// sent at most once. Every dependency is injectable so tests run without a DB,
// Redis or an LLM.
import type { GenerateObjectImpl } from "../../advisor/llmSelfCorrect";
import { createModelFromKey, LLMKeyRow } from "../../advisor/llmModelFactory";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";
import { IntakeSubmissionStatus } from "../../domain.layer/enums/intake-submission-status.enum";
import type { IIntakeForm } from "../../domain.layer/interfaces/i.intakeForm";
import {
  isAssessmentV2,
  IIntakeSubmission,
  IRiskAssessmentV2,
  ISuggestedRisksBlock,
  RoutingReason,
} from "../../domain.layer/interfaces/i.intakeSubmission";
import { getLatestRunForSubmissionQuery } from "../../utils/euAiActClassification.utils";
import { translate } from "../../utils/i18n.utils";
import {
  claimSubmissionNotificationQuery,
  getEligibleReviewerIdsQuery,
  getIntakeFormByIdQuery,
  getSubmissionByIdQuery,
  getSubmissionsNeedingAssessmentQuery,
  updateSubmissionAssessmentV2Query,
  updateSubmissionSuggestionsQuery,
} from "../../utils/intakeForm.utils";
import {
  buildEntityDataFromSubmission,
  rescoreStoredRun,
} from "../../utils/intakeSubmissionData.utils";
import { getLLMKeyWithKeyByIdQuery } from "../../utils/llmKey.utils";
import logger from "../../utils/logger/fileLogger";
import {
  IntakeNotificationResults,
  sendNewSubmissionAdminNotification,
} from "../intakeFormEmail.service";
import type { UseCaseInput } from "../riskSuggestions/riskSuggestions.service";
import { routeSubmission } from "../intakeRouting/routingService";
import { ClassificationContext, runAiScoring } from "./aiScoring";
import { AssessmentStage, enqueueIntakeAssessment, IntakeAssessmentJobData } from "./enqueue";
import { generateIntakeSuggestions } from "./intakeSuggestions";
import { recomputeAssessmentForLevel } from "./approvalRisks";
import { bandFor, combineScore, ruleMinimumFor } from "./scoreMath";
import { buildScoringAnswers } from "./scoringInput";

export type { AssessmentStage, IntakeAssessmentJobData };

type Model = ReturnType<typeof createModelFromKey>;

export interface AssessmentDeps {
  getSubmission: (id: number, organizationId: number) => Promise<IIntakeSubmission | null>;
  getForm: (id: number, organizationId: number) => Promise<IIntakeForm | null>;
  /** The rules classification, or null when the submission was not rule-checked. */
  getClassification: (
    submission: IIntakeSubmission,
    organizationId: number,
  ) => Promise<ClassificationContext | null>;
  /** The form's LLM key as a model, or null when the organization has no such key. */
  getModel: (llmKeyId: number, organizationId: number) => Promise<Model | null>;
  saveAssessment: typeof updateSubmissionAssessmentV2Query;
  saveSuggestions: typeof updateSubmissionSuggestionsQuery;
  claimNotification: typeof claimSubmissionNotificationQuery;
  getEligibleIds: typeof getEligibleReviewerIdsQuery;
  sendNotification: typeof sendNewSubmissionAdminNotification;
  listNeedingAssessment: typeof getSubmissionsNeedingAssessmentQuery;
  enqueue: typeof enqueueIntakeAssessment;
  routeSubmission: typeof routeSubmission;
  generateImpl?: GenerateObjectImpl;
  now: () => Date;
}

const defaultDeps: AssessmentDeps = {
  getSubmission: (id, organizationId) => getSubmissionByIdQuery(id, organizationId),
  getForm: getIntakeFormByIdQuery,
  getClassification: (submission, organizationId) => loadClassification(submission, organizationId),
  getModel: async (llmKeyId, organizationId) => {
    const row = await getLLMKeyWithKeyByIdQuery(llmKeyId, organizationId);
    return row ? createModelFromKey(row as unknown as LLMKeyRow) : null;
  },
  saveAssessment: updateSubmissionAssessmentV2Query,
  saveSuggestions: updateSubmissionSuggestionsQuery,
  claimNotification: claimSubmissionNotificationQuery,
  getEligibleIds: getEligibleReviewerIdsQuery,
  sendNotification: sendNewSubmissionAdminNotification,
  listNeedingAssessment: getSubmissionsNeedingAssessmentQuery,
  enqueue: enqueueIntakeAssessment,
  routeSubmission,
  now: () => new Date(),
};

const withDefaults = (deps?: Partial<AssessmentDeps>): AssessmentDeps => ({
  ...defaultDeps,
  ...deps,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function pendingAssessment(startedAt: string): IRiskAssessmentV2 {
  return {
    version: 2,
    status: "pending",
    notRuleChecked: false,
    classificationLevel: null,
    ruleMinimum: null,
    ai: null,
    finalScore: null,
    source: null,
    rulesOnly: false,
    overallScore: null,
    tier: null,
    stageStartedAt: startedAt,
    scoredAt: null,
  };
}

/** A scoring stage that ended without an AI score: the rule minimum alone. */
function failedAssessment(
  startedAt: string,
  classification: ClassificationContext | null,
  error: string,
  now: Date,
): IRiskAssessmentV2 {
  return recomputeAssessmentForLevel(
    { ...pendingAssessment(startedAt), status: "ai_failed", scoredAt: now.toISOString(), error },
    classification?.level ?? null,
  );
}

function pendingSuggestions(startedAt: string): ISuggestedRisksBlock {
  return {
    status: "pending",
    items: [],
    droppedCount: 0,
    stageStartedAt: startedAt,
    generatedAt: null,
  };
}

/** The rules classification from the submission's stored EU AI Act run, use cases only. */
async function loadClassification(
  submission: IIntakeSubmission,
  organizationId: number,
): Promise<ClassificationContext | null> {
  if (submission.entityType !== IntakeEntityType.USE_CASE) return null;
  const run = await getLatestRunForSubmissionQuery(submission.id, organizationId);
  const rescored = run ? rescoreStoredRun(run) : null;
  if (!rescored) return null;
  return {
    level: rescored.result.level,
    reasons: rescored.result.reasons.map((r) => ({ article: r.article, text: r.text })),
  };
}

/** What the suggester is told the submission is about, from its mapped fields. */
function useCaseInputFor(submission: IIntakeSubmission, form: IIntakeForm): UseCaseInput {
  const data = buildEntityDataFromSubmission(
    submission.data as Record<string, unknown>,
    form.schema,
  );
  const text = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
  };
  if (submission.entityType === IntakeEntityType.MODEL) {
    const technology = [text("provider"), text("hosting_provider", "modelType")]
      .filter(Boolean)
      .join(", ");
    return {
      name: text("name", "model") ?? form.name,
      purpose: text("description"),
      technology: technology || undefined,
    };
  }
  return {
    name: text("project_title") ?? form.name,
    purpose: text("goal", "description"),
  };
}

async function runScoringStage(
  ctx: StageContext,
  startedAt: string,
  deps: AssessmentDeps,
): Promise<void> {
  const { classification, model, answers, submissionId, organizationId } = ctx;
  const ruleMinimum = ruleMinimumFor(classification?.level ?? null);
  const base = {
    ...pendingAssessment(startedAt),
    notRuleChecked: classification === null,
    classificationLevel: classification?.level ?? null,
    ruleMinimum,
  };

  let status: IRiskAssessmentV2["status"] = "ai_not_configured";
  let ai: IRiskAssessmentV2["ai"] = null;
  let error: string | undefined = ctx.modelError;
  if (model) {
    const result = await runAiScoring({
      model,
      answers,
      classification,
      generateImpl: deps.generateImpl,
    });
    status = result.ok ? "complete" : "ai_failed";
    ai = {
      runs: result.runs,
      failedRuns: result.failedRuns,
      validRuns: result.validRuns,
      median: result.median,
      min: result.min,
      max: result.max,
      reasons: result.reasons,
    };
    error = result.error;
  }

  const combined = combineScore({
    ruleMinimum,
    aiMedian: status === "complete" ? (ai?.median ?? null) : null,
  });
  const assessment: IRiskAssessmentV2 = {
    ...base,
    status,
    ai,
    finalScore: combined.finalScore,
    source: combined.source,
    rulesOnly: combined.rulesOnly,
    overallScore: combined.finalScore,
    tier: combined.finalScore === null ? null : bandFor(combined.finalScore),
    scoredAt: deps.now().toISOString(),
    ...(error ? { error } : {}),
  };
  await deps.saveAssessment(submissionId, assessment, organizationId);
}

async function runSuggestionsStage(
  ctx: StageContext,
  startedAt: string,
  deps: AssessmentDeps,
): Promise<void> {
  const { model, submission, form, answers, classification, submissionId, organizationId } = ctx;
  if (!model) {
    await deps.saveSuggestions(
      submissionId,
      {
        ...pendingSuggestions(startedAt),
        status: "ai_not_configured",
        ...(ctx.modelError ? { error: ctx.modelError } : {}),
      },
      organizationId,
    );
    return;
  }
  const { items, droppedCount } = await generateIntakeSuggestions({
    model,
    entityType: submission.entityType,
    useCase: useCaseInputFor(submission, form),
    answers,
    classification,
    generateImpl: deps.generateImpl,
  });
  await deps.saveSuggestions(
    submissionId,
    {
      status: "complete",
      items,
      droppedCount,
      stageStartedAt: startedAt,
      generatedAt: deps.now().toISOString(),
    },
    organizationId,
  );
}

interface StageContext {
  organizationId: number;
  submissionId: number;
  submission: IIntakeSubmission;
  form: IIntakeForm;
  classification: ClassificationContext | null;
  answers: ReturnType<typeof buildScoringAnswers>;
  model: Model | null;
  /** Why there is no model when the form names a key that is gone. */
  modelError?: string;
}

export async function runIntakeAssessment(
  data: IntakeAssessmentJobData,
  deps?: Partial<AssessmentDeps>,
): Promise<void> {
  const d = withDefaults(deps);
  const { organizationId, submissionId, stages } = data;

  const submission = await d.getSubmission(submissionId, organizationId);
  if (!submission || submission.status !== IntakeSubmissionStatus.PENDING) return;
  const form = await d.getForm(submission.formId, organizationId);
  if (!form) return;

  const startedAt = d.now().toISOString();
  const wants = (stage: AssessmentStage) => stages.includes(stage);
  if (wants("scoring")) {
    await d.saveAssessment(submissionId, pendingAssessment(startedAt), organizationId);
  }
  if (wants("suggestions")) {
    await d.saveSuggestions(submissionId, pendingSuggestions(startedAt), organizationId);
  }

  const failScoring = (classification: ClassificationContext | null, error: unknown) =>
    d.saveAssessment(
      submissionId,
      failedAssessment(startedAt, classification, errorMessage(error), d.now()),
      organizationId,
    );
  const failSuggestions = (error: unknown) =>
    d.saveSuggestions(
      submissionId,
      { ...pendingSuggestions(startedAt), status: "ai_failed", error: errorMessage(error) },
      organizationId,
    );

  // Loading the classification, the key or the answers can fail too; record
  // it on the stages so they don't sit at "pending" until a retry. The
  // classification loads first so a later failure still keeps the floor.
  let classification: ClassificationContext | null = null;
  let ctx: StageContext;
  try {
    classification = await d.getClassification(submission, organizationId);
    let model: Model | null = null;
    let modelError: string | undefined;
    if (form.llmKeyId) {
      model = await d.getModel(form.llmKeyId, organizationId);
      if (!model) modelError = "The form's LLM key no longer exists";
    }
    ctx = {
      organizationId,
      submissionId,
      submission,
      form,
      classification,
      answers: buildScoringAnswers(submission.data as Record<string, unknown>, form.schema),
      model,
      modelError,
    };
  } catch (error) {
    logger.error(
      `Intake assessment setup failed for submission ${submissionId}: ${errorMessage(error)}`,
    );
    await settleAll([
      wants("scoring")
        ? failScoring(classification, error).then(() =>
            routeSettled(d, submissionId, organizationId),
          )
        : undefined,
      wants("suggestions") ? failSuggestions(error) : undefined,
    ]);
    await notifyWhenSettled(data, deps);
    return;
  }

  // The stages are independent and run side by side: one failing is recorded
  // and the other still completes. Both settle before the job ends, so a
  // BullMQ retry never overlaps a stage still running.
  await settleAll([
    wants("scoring")
      ? runScoringStage(ctx, startedAt, d)
          .catch((error) => {
            logger.error(
              `Intake scoring failed for submission ${submissionId}: ${errorMessage(error)}`,
            );
            return failScoring(ctx.classification, error);
          })
          .then(() => routeSettled(d, submissionId, organizationId))
      : undefined,
    wants("suggestions")
      ? runSuggestionsStage(ctx, startedAt, d).catch((error) => {
          logger.error(
            `Intake risk suggestions failed for submission ${submissionId}: ${errorMessage(error)}`,
          );
          return failSuggestions(error);
        })
      : undefined,
  ]);

  await notifyWhenSettled(data, deps);
}

/**
 * Route the submission from its stored, settled score. A routing failure is
 * logged and never fails the job: the lane can be set by the next re-route.
 */
async function routeSettled(
  d: AssessmentDeps,
  submissionId: number,
  organizationId: number,
): Promise<void> {
  try {
    const submission = await d.getSubmission(submissionId, organizationId);
    if (!submission) return;
    const form = await d.getForm(submission.formId, organizationId);
    if (!form) return;
    await d.routeSubmission(submission, form, organizationId);
  } catch (error) {
    logger.error(`Intake routing failed for submission ${submissionId}: ${errorMessage(error)}`);
  }
}

/** Waits for every promise, then rethrows the first failure, if any. */
async function settleAll(promises: Array<Promise<unknown> | undefined>): Promise<void> {
  const results = await Promise.allSettled(promises);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
}

/** The email, when the job was asked to send it and both stages have settled. */
async function notifyWhenSettled(
  data: IntakeAssessmentJobData,
  deps: Partial<AssessmentDeps> | undefined,
): Promise<void> {
  if (!data.notify) return;
  await sendIntakeNotificationOnce(
    data.organizationId,
    data.submissionId,
    data.lang,
    { capReached: false, adminFallback: data.adminFallback, onlyWhenSettled: true },
    deps,
  );
}

/** A stage not yet stored as v2, or stored but still running. */
function hasPendingStage(submission: IIntakeSubmission): boolean {
  const assessment = submission.riskAssessment;
  return (
    !isAssessmentV2(assessment) ||
    assessment.status === "pending" ||
    !submission.suggestedRisks ||
    submission.suggestedRisks.status === "pending"
  );
}

/** "64 (High)", "at least 70 (rules only)" or "No score yet", in the email's language. */
export function scoreTextFor(assessment: IRiskAssessmentV2 | null, lang?: string): string {
  if (!assessment || assessment.finalScore === null) return translate(lang, "No score yet");
  if (assessment.rulesOnly) {
    return translate(lang, "at least {score} (rules only)", { score: assessment.finalScore });
  }
  return translate(lang, "{score} ({band})", {
    score: assessment.finalScore,
    band: translate(lang, bandFor(assessment.finalScore)),
  });
}

const SENIOR_LANE_TEXT: Record<RoutingReason, string> = {
  prohibited: "Senior review: prohibited practice",
  no_score: "Senior review: no usable score",
  close_call: "Senior review: close call",
  at_or_above_threshold: "Senior review: score at or above the threshold",
  below_threshold: "Senior review: score below the threshold",
  override_raised: "Senior review: a reviewer raised the band",
  escalated: "Senior review: sent by a reviewer",
};

/**
 * Who gets the new-submission email and the lane line it shows. With routing
 * on, the form's recipients plus the assigned lane's reviewers (both lanes
 * while no lane is stored yet); with routing off, the recipients alone.
 */
export async function notificationAudience(
  form: IIntakeForm,
  submission: Pick<IIntakeSubmission, "routing">,
  lang: string | undefined,
  organizationId: number,
  d: AssessmentDeps = defaultDeps,
): Promise<{ recipients: number[]; laneText?: string }> {
  const base = form.recipients ?? [];
  const cfg = form.routing;
  if (!cfg?.enabled) return { recipients: base };
  const lane = submission.routing?.lane;
  const laneIds =
    lane === "senior"
      ? cfg.seniorReviewerIds
      : lane === "standard"
        ? cfg.standardReviewerIds
        : [...cfg.seniorReviewerIds, ...cfg.standardReviewerIds];
  // Saved ids can go stale (user deleted, role lost intakeForm.edit); the
  // form's own recipients are left as configured.
  const reviewers = await d.getEligibleIds(organizationId, laneIds);
  const laneText = !lane
    ? "Not routed yet: scoring is still running"
    : lane === "senior"
      ? SENIOR_LANE_TEXT[submission.routing!.reason]
      : "Standard review";
  return {
    recipients: [...new Set([...base, ...reviewers])],
    laneText: translate(lang, laneText),
  };
}

/**
 * Send the new-submission email unless it has gone already. Called when both
 * stages settle and again by the 2-minute cap job; the atomic claim makes the
 * second call a no-op. A cap that fires with a stage still pending sends the
 * email with a "still running" note instead of numbers.
 */
export async function sendIntakeNotificationOnce(
  organizationId: number,
  submissionId: number,
  lang: string | undefined,
  opts: { capReached: boolean; adminFallback?: boolean; onlyWhenSettled?: boolean },
  deps?: Partial<AssessmentDeps>,
): Promise<void> {
  const d = withDefaults(deps);
  const submission = await d.getSubmission(submissionId, organizationId);
  // A decided submission needs no "awaiting review" email.
  if (!submission || submission.status !== IntakeSubmissionStatus.PENDING) return;
  if (opts.onlyWhenSettled && hasPendingStage(submission)) return;
  const form = await d.getForm(submission.formId, organizationId);
  if (!form) return;

  const { recipients, laneText } = await notificationAudience(
    form,
    submission,
    lang,
    organizationId,
    d,
  );
  if (recipients.length === 0 && !opts.adminFallback) {
    logger.warn(`No recipients configured for form ${form.id}, skipping admin notification`);
    return;
  }
  if (!(await d.claimNotification(submissionId, organizationId))) return;

  const assessment = isAssessmentV2(submission.riskAssessment) ? submission.riskAssessment : null;
  const results: IntakeNotificationResults = {
    level: assessment?.classificationLevel ?? null,
    scoreText: scoreTextFor(assessment, lang),
    suggestionCount: submission.suggestedRisks?.items.length ?? 0,
    capReached: opts.capReached && hasPendingStage(submission),
  };

  await d.sendNotification(
    recipients.length > 0 ? recipients : organizationId,
    form.name,
    submission.submitterName || "Anonymous",
    submission.submitterEmail || "No email provided",
    submissionId,
    form.entityType,
    lang,
    results,
    laneText,
  );
}

/**
 * Queue the stages each pending submission still needs: legacy submissions
 * and jobs lost while pending. Never re-runs a settled stage. A lost email
 * goes out with the re-run, or at once when both stages have settled. The
 * submitter's language and the route's admin fallback are not stored, so it
 * is in the default language and a form without recipients stays silent.
 * Returns how many submissions were queued.
 */
export async function backfillIntakeAssessments(deps?: Partial<AssessmentDeps>): Promise<number> {
  const d = withDefaults(deps);
  const rows = await d.listNeedingAssessment();
  let queued = 0;
  for (const row of rows) {
    const stages: AssessmentStage[] = [
      ...(row.needsScoring ? (["scoring"] as const) : []),
      ...(row.needsSuggestions ? (["suggestions"] as const) : []),
    ];
    if (stages.length === 0) {
      if (!row.needsNotification) continue;
      try {
        await sendIntakeNotificationOnce(
          row.organizationId,
          row.id,
          undefined,
          { capReached: false, onlyWhenSettled: true },
          deps,
        );
      } catch (error) {
        logger.error(
          `Intake backfill could not email submission ${row.id}: ${errorMessage(error)}`,
        );
      }
      continue;
    }
    try {
      await d.enqueue({
        organizationId: row.organizationId,
        submissionId: row.id,
        stages,
        notify: row.emailUnclaimed,
      });
      queued += 1;
    } catch (error) {
      logger.error(`Intake backfill could not queue submission ${row.id}: ${errorMessage(error)}`);
    }
  }
  return queued;
}
