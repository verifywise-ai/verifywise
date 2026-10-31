import { Request, Response } from "express";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  getAllIntakeFormsQuery,
  getIntakeFormByIdQuery,
  getActivePublicFormQuery,
  getFormByPublicIdQuery,
  createIntakeFormQuery,
  updateIntakeFormQuery,
  deleteIntakeFormQuery,
  archiveIntakeFormQuery,
  getPendingSubmissionsQuery,
  getSubmissionByIdQuery,
  getSubmissionsByFormIdQuery,
  createSubmissionQuery,
  approveSubmissionQuery,
  rejectSubmissionQuery,
  getSubmissionStatsQuery,
  checkRateLimitQuery,
  getTenantHashBySlug,
  getTenantSlugById,
  updateSubmissionRiskOverrideQuery,
  claimSubmissionNotificationQuery,
  updateSuggestedRiskItemQuery,
  setAllSuggestionStatesQuery,
  updateSubmissionAssessmentV2Query,
  updateSubmissionSuggestionsQuery,
  getTenantByPublicId,
  getSubmissionByEntityQuery,
  getEligibleReviewersQuery,
  getEligibleReviewerIdsQuery,
  setDecisionRecordQuery,
  updateSubmissionRoutingQuery,
  updateSecondReviewQuery,
} from "../utils/intakeForm.utils";
import { createNewModelInventoryQuery } from "../utils/modelInventory.utils";
import { createNewProjectQuery } from "../utils/project.utils";
import { createEUFrameworkQuery } from "../utils/eu.utils";
import { EU_AI_ACT_FRAMEWORK_ID } from "../utils/validations/projectValidation.utils";
import { IntakeFormStatus } from "../domain.layer/enums/intake-form-status.enum";
import { IntakeSubmissionStatus } from "../domain.layer/enums/intake-submission-status.enum";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import { ModelInventoryStatus } from "../domain.layer/enums/model-inventory-status.enum";
import { ProjectStatus } from "../domain.layer/enums/project-status.enum";
import { AiRiskClassification } from "../domain.layer/enums/ai-risk-classification.enum";
import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import { IIntakeFormSchema } from "../domain.layer/interfaces/i.intakeForm";
import {
  validateIntakeFormSchemaLabels,
  validateIntakeFormSchemaLogic,
  resolveEuAiActRiskStep,
  defaultEuAiActRiskStepEnabled,
} from "../utils/intakeFormSchema.validation";
import {
  getQuestionnaire,
  CURRENT_QUESTIONNAIRE_VERSION,
  prepareIntakeRiskStep,
  validateAnswers,
  type Answers,
  type ClassificationResult,
  type PreparedRun,
  type Questionnaire,
} from "../services/euAiActClassification";
import {
  getLatestRunForSubmissionQuery,
  insertClassificationRunQuery,
} from "../utils/euAiActClassification.utils";
import { recordMultipleFieldChanges } from "../utils/useCaseChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { NotFoundException } from "../domain.layer/exceptions/custom.exception";
import { llmKeyExistsQuery } from "../utils/llmKey.utils";
import { sanitizeUserHtml } from "../utils/sanitization.utils";
import logger from "../utils/logger/fileLogger";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  sendNewSubmissionAdminNotification,
  sendSubmissionApprovedEmail,
  sendSubmissionRejectedEmail,
  sendSecondReviewRequestEmail,
} from "../services/intakeFormEmail.service";
import { enqueueIntakeAssessment } from "../services/intakeScoring/enqueue";
import {
  reviewTimeAtSubmit,
  trySendSubmitterConfirmation,
} from "../services/intakeConfirmation/confirmation";
import { notificationAudience } from "../services/intakeScoring/assessmentJob";
import { cleanSubmission, isEmptyAnswer, parseFormula } from "../services/intakeFormLogic";
import { generateSuggestedQuestions, generateFieldGuidance } from "../services/intakeLLM.service";
import { getCompanyLogoQuery } from "../utils/aiTrustCentre.utils";

import { translateError } from "../utils/i18n.utils";
import { highRiskRolesFromEntityData, sameHighRiskRoles } from "../utils/highRiskRoles.utils";
import {
  buildEntityDataFromSubmission,
  rescoreStoredRun,
} from "../utils/intakeSubmissionData.utils";
import { toId } from "../utils/validations/validation.utils";
import { isEmail } from "../utils/validations/email.utils";
import { isWebUrl } from "../utils/validations/url.utils";
import {
  isAssessmentV2,
  type IIntakeSubmission,
  type IRiskAssessmentV2,
  type ISubmissionRouting,
  type ReviewLane,
  type RoutingReason,
} from "../domain.layer/interfaces/i.intakeSubmission";
import { ModelRiskCategory } from "../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../domain.layer/enums/model-risk-level.enum";
import {
  asBand,
  isBandAllowed,
  ruleMinimumFor,
  SCORE_BANDS,
  type ClassificationLevel,
  type ScoreBand,
} from "../services/intakeScoring/scoreMath";
import {
  buildModelRiskFromSuggestion,
  buildUseCaseRiskFromSuggestion,
  recomputeAssessmentForLevel,
} from "../services/intakeScoring/approvalRisks";
import { createRiskService } from "../services/risk.service";
import { createNewModelRiskQuery } from "../utils/modelRisk.utils";
import { LIKELIHOODS, SEVERITIES } from "../services/intakeScoring/riskMappers";
import type { IntakeSuggestedRisk } from "../services/intakeScoring/intakeSuggestions";
import { selectRetryStages } from "../services/intakeScoring/retry";
import {
  canDecideLane,
  DEFAULT_ROUTING,
  laneReviewerIdsFor,
  validateRoutingSettings,
} from "../services/intakeRouting/routingRules";
import {
  buildDecisionRecord,
  laneAtDecision,
  pickSecondReview,
  laneOnRecord,
} from "../services/intakeRouting/decisionGate";
import { raiseForOverride, rerouteFormPending } from "../services/intakeRouting/routingService";
import { getIntakeOversightQuery, OVERSIGHT_WEEKS } from "../services/intakeRouting/oversight";
import type {
  IFormRouting,
  IIntakeForm,
  IPublicIntakeForm,
} from "../domain.layer/interfaces/i.intakeForm";
import { createSignedToken, verifySignedToken } from "../utils/signedToken.utils";
import { formAiAvailable } from "../services/intakeLiveChecks/availability";
import { recordSubmitLiveChecks } from "../services/intakeLiveChecks/submit";

/** Safely extract a single string from req.params (which may be string | string[]). */
const paramStr = (val: string | string[]): string => (Array.isArray(val) ? val[0] : val);

/** Map lowercase form option values to valid AiRiskClassification enum values. */
function mapToAiRiskClassification(value: string): AiRiskClassification | string {
  const map: Record<string, AiRiskClassification> = {
    minimal: AiRiskClassification.MINIMAL_RISK,
    limited: AiRiskClassification.LIMITED_RISK,
    high: AiRiskClassification.HIGH_RISK,
    unacceptable: AiRiskClassification.PROHIBITED,
    // Also accept display values directly
    "minimal risk": AiRiskClassification.MINIMAL_RISK,
    "limited risk": AiRiskClassification.LIMITED_RISK,
    "high risk": AiRiskClassification.HIGH_RISK,
    prohibited: AiRiskClassification.PROHIBITED,
    "out of scope": AiRiskClassification.OUT_OF_SCOPE,
  };
  return map[value?.toLowerCase()?.trim()] || value || "";
}

/** Parse and validate an integer ID parameter. Returns NaN for invalid values. */
function parseId(param: string | string[]): number {
  return toId(paramStr(param));
}

/** A positive integer LLM key id, or NaN. */
function parseLlmKeyId(value: unknown): number {
  const id = toId(value);
  return id > 0 ? id : NaN;
}

/**
 * Checks the llmKeyId of a form write. null/absent stays as is; anything else
 * must be one of the caller's organization's keys (intake_forms.llm_key_id has
 * a foreign key, but that alone would accept another organization's key).
 * The check runs in the write's transaction and locks the key row, so the key
 * cannot be deleted before the write commits.
 */
async function resolveFormLlmKeyId(
  req: Request,
  llmKeyId: unknown,
  transaction: Transaction,
): Promise<{ llmKeyId: number | null | undefined } | { error: string }> {
  if (llmKeyId === undefined || llmKeyId === null) return { llmKeyId };
  const id = parseLlmKeyId(llmKeyId);
  if (isNaN(id)) return { error: req.t!("LLM key ID must be a positive integer") };
  if (!(await llmKeyExistsQuery(id, req.organizationId!, transaction))) {
    return { error: req.t!("LLM key not found") };
  }
  return { llmKeyId: id };
}

/**
 * Shared shell of the LLM endpoints, run once the caller has checked its
 * required input: answers 400 for an invalid key id, 404 when the key is not
 * one of the organization's, and 500 for anything else.
 */
async function handleLlmKeyRequest(
  req: Request,
  res: Response,
  functionName: string,
  llmKeyId: unknown,
  generate: (keyId: number) => Promise<Response>,
): Promise<Response> {
  const keyId = parseLlmKeyId(llmKeyId);
  if (isNaN(keyId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("LLM key ID must be a positive integer")));
  }
  try {
    return await generate(keyId);
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404]({ message: req.t!("LLM key not found") }));
    }
    logger.error(`Error in ${functionName}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * What the public page needs to know about live checks before making any call.
 * Reads the full form row for llmKeyId; the key id and provider are never sent.
 */
async function buildPublicLiveChecks(
  form: IPublicIntakeForm,
  organizationId: number,
): Promise<{ enabled: boolean; aiAvailable: boolean }> {
  const enabled = Boolean(form.liveChecksEnabled);
  if (!enabled) return { enabled, aiAvailable: false };
  try {
    const full = await getIntakeFormByIdQuery(form.id, organizationId);
    return { enabled, aiAvailable: full ? await formAiAvailable(full, organizationId) : false };
  } catch (error) {
    // Rules still run; only AI is withheld.
    logger.error(`Error reading the LLM key of form ${form.id}`, error);
    return { enabled, aiAvailable: false };
  }
}

// ============================================================================
// EU AI ACT RISK STEP HELPERS
// ============================================================================

/** Stores the scored EU AI Act answers of a public submission as its classification run. */
async function persistIntakeRiskRun(
  submissionId: number,
  prepared: PreparedRun,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  await insertClassificationRunQuery(
    {
      useCaseId: null,
      intakeSubmissionId: submissionId,
      questionnaireVersion: prepared.questionnaireVersion,
      roles: prepared.result.roles,
      answers: prepared.answers,
      result: prepared.result,
      reviewerLevel: null,
      reviewerJustification: null,
      reviewedBy: null,
      source: "intake",
      createdBy: null,
    },
    organizationId,
    transaction,
  );
}

/**
 * The public form's EU AI Act step: the current questionnaire when the form has
 * the step on, plus the answers of the submission being resubmitted, if any.
 * Previous answers are returned only when they were given to the current
 * questionnaire and still validate; otherwise the submitter starts afresh.
 */
async function buildPublicRiskStep(
  form: { euAiActRiskStepEnabled?: boolean | null },
  previousSubmissionId: number | undefined,
  organizationId: number,
): Promise<{
  euAiActRiskStep: { questionnaire: Questionnaire | null } | null;
  previousRiskAnswers: Answers | undefined;
}> {
  if (!form.euAiActRiskStepEnabled) {
    return { euAiActRiskStep: null, previousRiskAnswers: undefined };
  }
  const questionnaire = getQuestionnaire(CURRENT_QUESTIONNAIRE_VERSION);
  const previousRun =
    previousSubmissionId !== undefined
      ? await getLatestRunForSubmissionQuery(previousSubmissionId, organizationId)
      : null;
  let previousRiskAnswers: Answers | undefined;
  if (questionnaire && previousRun?.questionnaireVersion === CURRENT_QUESTIONNAIRE_VERSION) {
    const { errors, answers } = validateAnswers(questionnaire, previousRun.answers);
    if (errors.length === 0) previousRiskAnswers = answers;
  }
  return {
    euAiActRiskStep: { questionnaire },
    previousRiskAnswers,
  };
}

/**
 * Queue a new public submission's AI assessment. The job emails the reviewers
 * once results are in, or after two minutes. If it cannot be queued, they are
 * emailed now without results, so a submission is never silent; the claim
 * keeps it to one email even if part of the job did get queued. Not awaited by
 * the handlers: a slow or unavailable queue never delays the submitter.
 */
function startIntakeAssessment(params: {
  organizationId: number;
  submissionId: number;
  lang?: string;
  /** The form as saved; its recipients and routing lanes decide who is emailed. */
  form: IIntakeForm | null;
  /** Email the organization's admins when the form has no recipients. */
  adminFallback: boolean;
  /** Also run the AI live checks (stored pending at submit). */
  liveChecks: boolean;
  formId: number;
  formName: string;
  submitterName: string;
  submitterEmail: string;
  entityType: IntakeEntityType;
}): Promise<void> {
  const { organizationId, submissionId, lang, form, adminFallback } = params;
  return enqueueIntakeAssessment({
    organizationId,
    submissionId,
    stages: params.liveChecks
      ? ["scoring", "suggestions", "liveChecks"]
      : ["scoring", "suggestions"],
    notify: true,
    lang,
    adminFallback,
  }).catch(async (error) => {
    logger.error(
      `Could not queue the assessment for submission ${submissionId}; emailing reviewers now:`,
      error,
    );
    // No job will route it, so the submitter is told now: the governance team.
    await trySendSubmitterConfirmation(organizationId, submissionId, lang, { fallback: true });
    try {
      // Same audience as the job's email: recipients plus the lane reviewers
      // (no lane is stored yet, so both lanes while routing is on). If that
      // lookup fails, still email the form's recipients.
      let recipients: number[] = form?.recipients ?? [];
      let laneText: string | undefined;
      if (form) {
        try {
          ({ recipients, laneText } = await notificationAudience(
            form,
            { routing: null },
            lang,
            organizationId,
          ));
        } catch (err) {
          logger.error(`Could not resolve reviewers for submission ${submissionId}:`, err);
        }
      }
      if (recipients.length === 0 && !adminFallback) {
        logger.warn(
          `No recipients configured for form ${params.formId}, skipping admin notification`,
        );
        return;
      }
      if (!(await claimSubmissionNotificationQuery(submissionId, organizationId))) return;
      await sendNewSubmissionAdminNotification(
        recipients.length > 0 ? recipients : organizationId,
        params.formName,
        params.submitterName,
        params.submitterEmail,
        submissionId,
        params.entityType,
        lang,
        undefined,
        laneText,
      );
    } catch (err) {
      logger.error("Failed to send admin notification:", err);
    }
  });
}

/**
 * The EU AI Act level under the current questionnaire: the submission's stored
 * run re-scored. Null when it has no run (step off, or a model).
 */
async function currentRulesLevel(
  submissionId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<ClassificationLevel | null> {
  const run = await getLatestRunForSubmissionQuery(submissionId, organizationId, transaction);
  const rescored = run ? rescoreStoredRun(run) : null;
  return (rescored?.result.level ?? null) as ClassificationLevel | null;
}

/** The rule minimum under the current questionnaire. */
async function currentRuleMinimum(
  submissionId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number | null> {
  return ruleMinimumFor(await currentRulesLevel(submissionId, organizationId, transaction));
}

/**
 * On approve or reject, inside the decision's transaction: the job's writes
 * are ignored once a submission is decided, so a stage still running is
 * closed here (the score keeps the rule minimum, suggestions are marked
 * failed). With `refloor`, a finished score is also re-floored under `level`.
 * Returns the AI-assisted assessment as it now stands (null when there is none).
 */
async function settleAssessmentOnDecision(
  submission: IIntakeSubmission,
  level: ClassificationLevel | null,
  organizationId: number,
  transaction: Transaction,
  opts: { refloor: boolean },
): Promise<IRiskAssessmentV2 | null> {
  let assessment = isAssessmentV2(submission.riskAssessment) ? submission.riskAssessment : null;
  if (assessment && (opts.refloor || assessment.status === "pending")) {
    const settled: IRiskAssessmentV2 =
      assessment.status === "pending"
        ? { ...assessment, status: "ai_failed", error: "Decided before AI scoring finished" }
        : assessment;
    assessment = recomputeAssessmentForLevel(settled, level);
    await updateSubmissionAssessmentV2Query(submission.id, assessment, organizationId, transaction);
  }
  if (submission.suggestedRisks?.status === "pending") {
    await updateSubmissionSuggestionsQuery(
      submission.id,
      {
        ...submission.suggestedRisks,
        status: "ai_failed",
        error: "Decided before risk suggestions finished",
      },
      organizationId,
      transaction,
    );
  }
  return assessment;
}

/**
 * Null when `tier` is a score band at or above the band of `ruleMinimum`;
 * otherwise the (translated) reason it is refused. The risk override and
 * approve, the two places a reviewer sets a band, both go through this.
 */
function bandFloorError(req: Request, tier: unknown, ruleMinimum: number | null): string | null {
  if (!isScoreBand(tier)) {
    return req.t!("Invalid risk band");
  }
  if (!isBandAllowed(tier, ruleMinimum)) {
    return req.t!("The band can't be lower than the rule minimum allows");
  }
  return null;
}

function isScoreBand(tier: unknown): tier is ScoreBand {
  return SCORE_BANDS.some((b) => b.band === tier);
}

/** A v2 score, or none yet: either way the reviewer sets a score band. */
function usesScoreBands(submission: IIntakeSubmission): boolean {
  return !submission.riskAssessment || isAssessmentV2(submission.riskAssessment);
}

/** bandFloorError against the rule minimum under the current rules. */
async function checkBandAgainstFloor(
  req: Request,
  tier: unknown,
  submissionId: number,
): Promise<string | null> {
  return bandFloorError(req, tier, await currentRuleMinimum(submissionId, req.organizationId!));
}

// ============================================================================
// REVIEW LANES
// ============================================================================

function isAdminRequest(req: Request): boolean {
  return req.role === "Admin";
}

/** Why a submission sits in its lane, as words for an error message. */
function routingReasonText(req: Request, reason: RoutingReason | null): string {
  switch (reason) {
    case "prohibited":
      return req.t!("prohibited practice");
    case "no_score":
      return req.t!("no usable score");
    case "close_call":
      return req.t!("the score is close to the threshold");
    case "at_or_above_threshold":
      return req.t!("the score is at or above the threshold");
    case "override_raised":
      return req.t!("a reviewer raised the band");
    case "escalated":
      return req.t!("a reviewer requested expert review");
    default:
      return req.t!("the score is below the threshold");
  }
}

/**
 * The EU AI Act level the approved entity will carry: the stored run's level
 * (after a reviewer's change) when there is one, else the mapped level of a
 * use case. Models carry none.
 */
function entityLevel(
  entityType: IntakeEntityType,
  runLevel: string | null,
  entityData: Record<string, unknown>,
): string | null {
  if (runLevel !== null) return runLevel;
  const mapped = entityData.ai_risk_classification;
  if (entityType !== IntakeEntityType.USE_CASE || typeof mapped !== "string") return null;
  return mapToAiRiskClassification(mapped) || null;
}

/**
 * An Admin may decide in any lane; when the lane alone would not have let them,
 * that is logged.
 */
async function logIfOutsideLane(
  req: Request,
  submissionId: number,
  lane: ReviewLane | null,
  cfg: IFormRouting | null,
  functionName: string,
): Promise<void> {
  if (!isAdminRequest(req) || canDecideLane(lane, req.userId!, false, cfg)) return;
  await logSuccess({
    eventType: "Update",
    description: `submission ${submissionId} decided outside their lane by an Admin (${lane} review)`,
    functionName,
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
}

// ============================================================================
// SUGGESTED RISK EDIT VALIDATION
// ============================================================================

const SUGGESTION_STATES: IntakeSuggestedRisk["state"][] = ["suggested", "accepted", "dismissed"];
const SUGGESTION_TEXT_FIELDS = ["description", "mitigationPlan", "implementationStrategy"] as const;
const MODEL_RISK_CATEGORIES = Object.values(ModelRiskCategory) as string[];
const MODEL_RISK_LEVELS = Object.values(ModelRiskLevel) as string[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The reviewer-editable part of a suggested risk, validated. Only these keys
 * are read from the body, so ids, sources and audit stamps can't be patched.
 * Returns the field that failed when the body is invalid.
 */
export function parseSuggestionPatch(
  body: Record<string, unknown>,
  today: string,
): { patch: Partial<IntakeSuggestedRisk> } | { invalid: string } {
  const patch: Partial<IntakeSuggestedRisk> = {};

  if (body.state !== undefined) {
    if (!SUGGESTION_STATES.includes(body.state as IntakeSuggestedRisk["state"])) {
      return { invalid: "state" };
    }
    patch.state = body.state as IntakeSuggestedRisk["state"];
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) {
      return { invalid: "name" };
    }
    patch.name = body.name.trim();
  }
  for (const field of SUGGESTION_TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim().length > 1000) return { invalid: field };
    patch[field] = value.trim();
  }
  if (body.likelihood !== undefined) {
    if (!LIKELIHOODS.includes(body.likelihood as IntakeSuggestedRisk["likelihood"])) {
      return { invalid: "likelihood" };
    }
    patch.likelihood = body.likelihood as IntakeSuggestedRisk["likelihood"];
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity as IntakeSuggestedRisk["severity"])) {
      return { invalid: "severity" };
    }
    patch.severity = body.severity as IntakeSuggestedRisk["severity"];
  }
  if (body.deadline !== undefined) {
    const d = body.deadline;
    const valid =
      d === null ||
      (typeof d === "string" &&
        ISO_DATE.test(d) &&
        !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
        new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d &&
        d >= today);
    if (!valid) return { invalid: "deadline" };
    patch.deadline = d as string | null;
  }
  if (body.modelRiskCategory !== undefined) {
    if (!MODEL_RISK_CATEGORIES.includes(body.modelRiskCategory as string)) {
      return { invalid: "modelRiskCategory" };
    }
    patch.modelRiskCategory = body.modelRiskCategory as ModelRiskCategory;
  }
  if (body.modelRiskLevel !== undefined) {
    if (!MODEL_RISK_LEVELS.includes(body.modelRiskLevel as string)) {
      return { invalid: "modelRiskLevel" };
    }
    patch.modelRiskLevel = body.modelRiskLevel as ModelRiskLevel;
  }
  return { patch };
}

// ============================================================================
// SERVER-SIDE FORM DATA VALIDATION
// ============================================================================

/**
 * Validate submitted form data against the form schema.
 * Returns an array of error messages (empty if valid).
 */
function validateFormData(
  formData: Record<string, unknown>,
  schema: IIntakeFormSchema,
  visibleIds?: Set<string>,
): string[] {
  const errors: string[] = [];

  for (const field of schema.fields) {
    // Hidden fields are never required; calculated values come from the server.
    if (visibleIds && !visibleIds.has(field.id)) continue;
    if (field.type === "calculated") continue;
    const value = formData[field.id];
    // Same notion of blank as the show/hide rules: whitespace and [] are empty.
    const isEmpty = isEmptyAnswer(value);

    // Required check — field.required (backend interface) or field.validation.required (frontend schema)
    const isRequired = field.required || field.validation?.required;
    // A required checkbox must be checked, as the public form enforces.
    if (isRequired && (isEmpty || (field.type === "checkbox" && value !== true))) {
      errors.push(`"${field.label}" is required`);
      continue;
    }

    // Skip validation for empty optional fields
    if (isEmpty) continue;

    // Type-specific validation
    switch (field.type) {
      case "email": {
        if (!isEmail(value)) {
          errors.push(`"${field.label}" must be a valid email address`);
        }
        break;
      }
      case "url": {
        if (!isWebUrl(value)) {
          errors.push(`"${field.label}" must be a valid URL`);
        }
        break;
      }
      case "number": {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`"${field.label}" must be a number`);
        } else if (field.validation) {
          if (field.validation.min !== undefined && num < field.validation.min) {
            errors.push(`"${field.label}" must be at least ${field.validation.min}`);
          }
          if (field.validation.max !== undefined && num > field.validation.max) {
            errors.push(`"${field.label}" must be at most ${field.validation.max}`);
          }
        }
        break;
      }
      case "text":
      case "textarea": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be text`);
        } else if (field.validation) {
          if (
            field.validation.minLength !== undefined &&
            value.length < field.validation.minLength
          ) {
            errors.push(
              `"${field.label}" must be at least ${field.validation.minLength} characters`,
            );
          }
          if (
            field.validation.maxLength !== undefined &&
            value.length > field.validation.maxLength
          ) {
            errors.push(
              `"${field.label}" must be at most ${field.validation.maxLength} characters`,
            );
          }
        }
        break;
      }
      case "select": {
        if (typeof value !== "string") {
          errors.push(`"${field.label}" must be a single selection`);
        } else if (field.options && field.options.length > 0) {
          const validValues = field.options.map((o) => o.value);
          if (!validValues.includes(value)) {
            errors.push(`"${field.label}" has an invalid selection`);
          }
        }
        break;
      }
      case "multiselect": {
        if (!Array.isArray(value)) {
          errors.push(`"${field.label}" must be an array of selections`);
        } else if (field.options && field.options.length > 0) {
          const validValues = field.options.map((o) => o.value);
          for (const v of value) {
            if (!validValues.includes(v as string)) {
              errors.push(`"${field.label}" contains an invalid selection`);
              break;
            }
          }
        }
        break;
      }
      case "checkbox": {
        if (typeof value !== "boolean") {
          errors.push(`"${field.label}" must be true or false`);
        }
        break;
      }
      case "date": {
        if (typeof value !== "string" || isNaN(Date.parse(value))) {
          errors.push(`"${field.label}" must be a valid date`);
        }
        break;
      }
    }
  }

  return errors;
}

/**
 * The schema as the public form gets it: risk dimension tags are internal
 * scoring hints, so they are left out (a submitter could otherwise see which
 * answers feed which risk score).
 */
function publicSchema(schema: IIntakeFormSchema): IIntakeFormSchema {
  if (!schema || !Array.isArray(schema.fields)) return schema;
  return {
    ...schema,
    fields: schema.fields.map((field) => {
      const copy = { ...field };
      delete copy.riskDimension;
      return copy;
    }),
  };
}

/**
 * Applies the form's show/hide rules and formulas to submitted answers. The
 * browser is never trusted: answers to hidden fields and unknown keys are
 * dropped and calculated values are recomputed here.
 */
function prepareSubmissionData(
  formData: Record<string, unknown>,
  schema: IIntakeFormSchema,
): { data: Record<string, unknown>; visibleIds: Set<string> } {
  for (const field of schema.fields ?? []) {
    if (field.type === "calculated" && !parseFormula(field.formula ?? "").ok) {
      logger.warn(
        `Intake form field ${field.id} has a formula that does not parse; storing no value`,
      );
    }
  }
  return cleanSubmission(schema, formData);
}

// ============================================================================
// ENTITY DATA MAPPING (fixes hardcoded mapper bug)
// ============================================================================

// ============================================================================
// INTAKE FORM CONTROLLERS (Admin - Authenticated)
// ============================================================================

/**
 * Get all intake forms for the tenant
 */
export async function getAllIntakeForms(req: Request, res: Response) {
  logProcessing({
    description: "starting getAllIntakeForms",
    functionName: "getAllIntakeForms",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const forms = await getAllIntakeFormsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](forms));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve intake forms",
      functionName: "getAllIntakeForms",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get intake form by ID
 */
export async function getIntakeFormById(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  logProcessing({
    description: `fetching intake form by id: ${formId}`,
    functionName: "getIntakeFormById",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const form = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }

    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve intake form: ${formId}`,
      functionName: "getIntakeFormById",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

const INELIGIBLE_REVIEWERS_MESSAGE = "Reviewers must be users who can review intake submissions";
const EMPTY_LANE_MESSAGE =
  "Each reviewer list needs at least one user who can currently review intake submissions";

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

const ROUTING_FORBIDDEN_MESSAGE = "Only an Admin can change reviewer assignment";

/**
 * Whether saving `next` changes the stored routing. Compared by value: id
 * order does not matter, and a missing stored block is routing off with the
 * default numbers. Null clears the block, which is a change only when one
 * is stored.
 */
function routingChanged(next: IFormRouting | null, stored: IFormRouting | null | undefined) {
  if (next === null) return !!stored;
  const before: IFormRouting = stored ?? {
    enabled: false,
    seniorReviewerIds: [],
    standardReviewerIds: [],
    ...DEFAULT_ROUTING,
  };
  return (
    before.enabled !== next.enabled ||
    !sameIds(before.seniorReviewerIds, next.seniorReviewerIds) ||
    !sameIds(before.standardReviewerIds, next.standardReviewerIds) ||
    before.threshold !== next.threshold ||
    before.closeCallMargin !== next.closeCallMargin ||
    before.secondReviewRate !== next.secondReviewRate
  );
}

/** Audit trail for a routing change: user ids and numbers only. */
async function logRoutingChange(
  req: Request,
  formId: number | undefined,
  before: IFormRouting | null | undefined,
  after: IFormRouting | null,
  functionName: string,
) {
  const brief = (r: IFormRouting | null | undefined) =>
    r
      ? {
          enabled: r.enabled,
          seniorReviewerIds: r.seniorReviewerIds,
          standardReviewerIds: r.standardReviewerIds,
          threshold: r.threshold,
          closeCallMargin: r.closeCallMargin,
          secondReviewRate: r.secondReviewRate,
        }
      : null;
  await logSuccess({
    eventType: "Update",
    description: `review routing changed on intake form ${formId}: before ${JSON.stringify(brief(before))}, after ${JSON.stringify(brief(after))}`,
    functionName,
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
}

/**
 * Validate the routing block of a form body. `raw` is undefined when the
 * body leaves routing alone and null when it clears it.
 *
 * `stored` is the form's current routing (null on create). A reviewer who
 * has since lost the right to review stays in the stored lists and can
 * still be kept on a save, because the editor cannot always show or remove
 * them; only ids added by this request must be eligible. A list that
 * changed, or any list when routing is being switched on, must keep at
 * least one currently eligible reviewer so a lane is never left with
 * nobody who can act.
 */
async function resolveFormRouting(
  raw: unknown,
  organizationId: number,
  stored: IFormRouting | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
  isAdmin: boolean,
): Promise<
  { value: IFormRouting | null | undefined; changed: boolean } | { error: string; status?: number }
> {
  if (raw === undefined) return { value: raw, changed: false };
  if (raw === null) {
    const changed = routingChanged(null, stored);
    if (changed && !isAdmin) return { error: t(ROUTING_FORBIDDEN_MESSAGE), status: 403 };
    return { value: raw, changed };
  }
  const parsed = validateRoutingSettings(raw);
  if (!parsed.ok) return { error: t(parsed.i18nKey, parsed.i18nVars) };
  const next = parsed.value;
  const changed = routingChanged(next, stored);
  if (changed && !isAdmin) return { error: t(ROUTING_FORBIDDEN_MESSAGE), status: 403 };

  const ids = [...new Set([...next.seniorReviewerIds, ...next.standardReviewerIds])];
  const storedIds = new Set([
    ...(stored?.seniorReviewerIds ?? []),
    ...(stored?.standardReviewerIds ?? []),
  ]);
  const eligible = new Set(await getEligibleReviewerIdsQuery(organizationId, ids));
  if (ids.some((id) => !storedIds.has(id) && !eligible.has(id))) {
    return { error: t(INELIGIBLE_REVIEWERS_MESSAGE) };
  }

  if (next.enabled) {
    const turnedOn = !stored?.enabled;
    const lanes: Array<[number[], number[] | undefined]> = [
      [next.seniorReviewerIds, stored?.seniorReviewerIds],
      [next.standardReviewerIds, stored?.standardReviewerIds],
    ];
    const emptyLane = lanes.some(
      ([list, before]) =>
        (turnedOn || !before || !sameIds(list, before)) && !list.some((id) => eligible.has(id)),
    );
    if (emptyLane) return { error: t(EMPTY_LANE_MESSAGE) };
  }
  return { value: next, changed };
}

/** The 403 (not allowed to change routing) or 400 (invalid settings) for a refused routing block. */
function sendRoutingError(res: Response, routing: { error: string; status?: number }) {
  return res
    .status(routing.status ?? 400)
    .json(
      routing.status === 403 ? STATUS_CODE[403](routing.error) : STATUS_CODE[400](routing.error),
    );
}

/**
 * Users who can be picked as reviewers in a form's routing settings
 */
export async function getEligibleReviewers(req: Request, res: Response) {
  try {
    const reviewers = await getEligibleReviewersQuery(req.organizationId!);
    return res.status(200).json(reviewers);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to list eligible intake reviewers",
      functionName: "getEligibleReviewers",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Create new intake form
 */
export async function createIntakeForm(req: Request, res: Response) {
  logProcessing({
    description: "creating new intake form",
    functionName: "createIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      description,
      slug,
      entityType,
      schema,
      submitButtonText,
      status,
      ttlExpiresAt,
      recipients,
      riskTierSystem,
      riskAssessmentConfig,
      llmKeyId,
      suggestedQuestionsEnabled,
      euAiActRiskStepEnabled,
      liveChecksEnabled,
      designSettings,
    } = req.body;

    if (!name || !entityType) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Name and entity type are required")));
    }

    if (!Object.values(IntakeEntityType).includes(entityType)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid entity type")));
    }

    if (status && !Object.values(IntakeFormStatus).includes(status)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form status")));
    }

    // The rendered intake form is built entirely from this schema, so a field
    // with no label produces an input with no accessible name. Reject it here
    // rather than letting it reach the public page.
    const schemaErrors = validateIntakeFormSchemaLabels(schema);
    if (schemaErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](schemaErrors.join("; ")));
    }

    // Drafts may hold unfinished logic (a new calculated field starts with an
    // empty formula); only a form that will be live must be valid.
    const logicErrors =
      (status ?? IntakeFormStatus.DRAFT) === IntakeFormStatus.ACTIVE
        ? validateIntakeFormSchemaLogic(schema, entityType)
        : [];
    if (logicErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](logicErrors.join("; ")));
    }

    const riskStep = resolveEuAiActRiskStep({
      entityType: entityType,
      enabled:
        euAiActRiskStepEnabled == null
          ? defaultEuAiActRiskStepEnabled(entityType, schema)
          : Boolean(euAiActRiskStepEnabled),
      schema: schema,
    });
    if (riskStep.errors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!(riskStep.errors[0])));
    }

    const llmKey = await resolveFormLlmKeyId(req, llmKeyId, transaction);
    if ("error" in llmKey) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](llmKey.error));
    }

    const routing = await resolveFormRouting(
      req.body.routing,
      req.organizationId!,
      null,
      req.t!,
      isAdminRequest(req),
    );
    if ("error" in routing) {
      await transaction.rollback();
      return sendRoutingError(res, routing);
    }

    const form = await createIntakeFormQuery(
      {
        name,
        description: sanitizeUserHtml(description),
        slug,
        entityType,
        schema,
        submitButtonText,
        status,
        ttlExpiresAt: ttlExpiresAt ? new Date(ttlExpiresAt) : null,
        recipients,
        riskTierSystem,
        riskAssessmentConfig,
        llmKeyId: llmKey.llmKeyId,
        suggestedQuestionsEnabled,
        euAiActRiskStepEnabled: riskStep.enabled,
        liveChecksEnabled: liveChecksEnabled == null ? true : Boolean(liveChecksEnabled),
        designSettings,
        routing: routing.value,
        createdBy: req.userId!,
      },
      req.organizationId!,
      transaction,
    );

    await transaction.commit();

    if (routing.changed) {
      await logRoutingChange(req, form.id, null, routing.value ?? null, "createIntakeForm");
    }

    await logSuccess({
      eventType: "Create",
      description: `intake form created: ${form.id}`,
      functionName: "createIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "failed to create intake form",
      functionName: "createIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Update intake form
 */
export async function updateIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  logProcessing({
    description: `updating intake form: ${formId}`,
    functionName: "updateIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }

    const {
      name,
      description,
      slug,
      entityType,
      schema,
      submitButtonText,
      status,
      ttlExpiresAt,
      recipients,
      riskTierSystem,
      riskAssessmentConfig,
      llmKeyId,
      suggestedQuestionsEnabled,
      euAiActRiskStepEnabled,
      liveChecksEnabled,
      designSettings,
    } = req.body;

    if (status && !Object.values(IntakeFormStatus).includes(status)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form status")));
    }

    if (entityType && !Object.values(IntakeEntityType).includes(entityType)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid entity type")));
    }

    // The rendered intake form is built entirely from this schema, so a field
    // with no label produces an input with no accessible name. Reject it here
    // rather than letting it reach the public page.
    const schemaErrors = validateIntakeFormSchemaLabels(schema);
    if (schemaErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](schemaErrors.join("; ")));
    }

    // Drafts may hold unfinished logic; only a form that will be live after
    // this update must be valid (publishing a draft sends status "active").
    // An update that leaves the schema, entity type and status alone (e.g.
    // recipients only) is not blocked by a problem it did not touch.
    const touchesLogic = schema !== undefined || entityType !== undefined || status !== undefined;
    const logicErrors =
      touchesLogic && (status ?? existingForm.status) === IntakeFormStatus.ACTIVE
        ? validateIntakeFormSchemaLogic(
            schema ?? existingForm.schema,
            entityType ?? existingForm.entityType,
          )
        : [];
    if (logicErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](logicErrors.join("; ")));
    }

    const riskStep = resolveEuAiActRiskStep({
      entityType: entityType ?? existingForm.entityType,
      enabled:
        euAiActRiskStepEnabled != null
          ? Boolean(euAiActRiskStepEnabled)
          : existingForm.euAiActRiskStepEnabled,
      schema: schema ?? existingForm.schema,
    });
    if (riskStep.errors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!(riskStep.errors[0])));
    }

    const llmKey = await resolveFormLlmKeyId(req, llmKeyId, transaction);
    if ("error" in llmKey) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](llmKey.error));
    }

    const routing = await resolveFormRouting(
      req.body.routing,
      req.organizationId!,
      existingForm.routing,
      req.t!,
      isAdminRequest(req),
    );
    if ("error" in routing) {
      await transaction.rollback();
      return sendRoutingError(res, routing);
    }

    const form = await updateIntakeFormQuery(
      formId,
      {
        name,
        description: sanitizeUserHtml(description),
        slug,
        entityType,
        schema,
        submitButtonText,
        status,
        ttlExpiresAt: ttlExpiresAt ? new Date(ttlExpiresAt) : undefined,
        recipients,
        riskTierSystem,
        riskAssessmentConfig,
        llmKeyId: llmKey.llmKeyId,
        suggestedQuestionsEnabled,
        euAiActRiskStepEnabled: riskStep.enabled,
        liveChecksEnabled: liveChecksEnabled == null ? undefined : Boolean(liveChecksEnabled),
        designSettings,
        routing: routing.value,
      },
      req.organizationId!,
      transaction,
    );

    await transaction.commit();

    if (routing.changed) {
      await logRoutingChange(
        req,
        formId,
        existingForm.routing,
        routing.value ?? null,
        "updateIntakeForm",
      );
    }

    await logSuccess({
      eventType: "Update",
      description: `intake form updated: ${formId}`,
      functionName: "updateIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    // The save is committed; a failed re-route must not turn it into a 500.
    // Switching routing off needs no pass: routeSubmission writes nothing then.
    if (form && routing.changed && routing.value?.enabled) {
      try {
        await rerouteFormPending(form, req.organizationId!);
      } catch (error) {
        await logFailure({
          eventType: "Update",
          description: `failed to re-route pending submissions of intake form: ${formId}`,
          functionName: "updateIntakeForm",
          fileName: "intakeForm.ctrl.ts",
          error: error as Error,
          userId: req.userId!,
          organizationId: req.organizationId!,
        });
      }
    }

    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to update intake form: ${formId}`,
      functionName: "updateIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Delete intake form (only drafts)
 */
export async function deleteIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  logProcessing({
    description: `deleting intake form: ${formId}`,
    functionName: "deleteIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }

    if (existingForm.status === IntakeFormStatus.ACTIVE) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Active forms cannot be deleted. Archive the form first.")));
    }

    await deleteIntakeFormQuery(formId, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Delete",
      description: `intake form deleted: ${formId}`,
      functionName: "deleteIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ message: req.t!("Form deleted successfully") }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `failed to delete intake form: ${formId}`,
      functionName: "deleteIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Archive intake form
 */
export async function archiveIntakeForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  logProcessing({
    description: `archiving intake form: ${formId}`,
    functionName: "archiveIntakeForm",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const existingForm = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Intake form not found")));
    }

    const form = await archiveIntakeFormQuery(formId, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `intake form archived: ${formId}`,
      functionName: "archiveIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](form));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to archive intake form: ${formId}`,
      functionName: "archiveIntakeForm",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ============================================================================
// SUBMISSION CONTROLLERS (Admin - Authenticated)
// ============================================================================

/**
 * Get all pending submissions (dashboard)
 */
export async function getPendingSubmissions(req: Request, res: Response) {
  logProcessing({
    description: "fetching pending submissions",
    functionName: "getPendingSubmissions",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const status = req.query.status as IntakeSubmissionStatus | undefined;
    const rows = await getPendingSubmissionsQuery(req.organizationId!, status);
    // The list shows who can decide each row's stored lane, not the form's whole routing.
    // Senior reviewers who can still act on a second review that is open, or
    // missed and not yet resolved, other than the approver. They stay senior
    // reviewers of the form even when routing has since been turned off.
    const needsSecondReview = (r: { routing?: ISubmissionRouting | null }) => {
      const second = r.routing?.secondReview;
      return (
        !!second && (second.status === "open" || (second.status === "missed" && !second.resolvedAt))
      );
    };
    const seniorIds = [
      ...new Set(
        rows.filter(needsSecondReview).flatMap((r) => r.formRouting?.seniorReviewerIds ?? []),
      ),
    ];
    const eligible = new Set(
      seniorIds.length > 0 ? await getEligibleReviewerIdsQuery(req.organizationId!, seniorIds) : [],
    );
    const submissions = rows.map(({ formRouting, ...row }) => ({
      ...row,
      routingEnabled: formRouting?.enabled ?? false,
      laneReviewerIds: laneReviewerIdsFor(row.routing?.lane ?? null, formRouting ?? null),
      secondReviewerIds: needsSecondReview(row)
        ? (formRouting?.seniorReviewerIds ?? []).filter(
            (id) => eligible.has(id) && id !== row.reviewedBy,
          )
        : [],
    }));
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve pending submissions",
      functionName: "getPendingSubmissions",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get submissions for a specific form
 */
export async function getFormSubmissions(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }
  const status = req.query.status as IntakeSubmissionStatus | undefined;

  logProcessing({
    description: `fetching submissions for form: ${formId}`,
    functionName: "getFormSubmissions",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const submissions = await getSubmissionsByFormIdQuery(formId, req.organizationId!, status);
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve submissions for form: ${formId}`,
      functionName: "getFormSubmissions",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get submission by ID
 */
export async function getSubmissionById(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  logProcessing({
    description: `fetching submission: ${submissionId}`,
    functionName: "getSubmissionById",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);

    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }

    return res.status(200).json(STATUS_CODE[200](submission));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve submission: ${submissionId}`,
      functionName: "getSubmissionById",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get submission stats (dashboard)
 */
export async function getSubmissionStats(req: Request, res: Response) {
  logProcessing({
    description: "fetching submission stats",
    functionName: "getSubmissionStats",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const stats = await getSubmissionStatsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve submission stats",
      functionName: "getSubmissionStats",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Oversight figures for the intake page: lanes, decision times, reviewers,
 * second reviews and what needs attention over the last 4, 8 or 12 weeks.
 */
export async function getIntakeOversight(req: Request, res: Response) {
  const weeksParam = req.query.weeks;
  const weeks = weeksParam === undefined ? 8 : toId(weeksParam);
  if (!OVERSIGHT_WEEKS.includes(weeks)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Weeks must be 4, 8 or 12")));
  }
  const formIdParam = req.query.formId;
  const hasFormId = formIdParam !== undefined && formIdParam !== "";
  const formId = hasFormId ? toId(formIdParam) : undefined;
  if (hasFormId && (formId === undefined || isNaN(formId) || formId <= 0)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  logProcessing({
    description: "fetching intake oversight figures",
    functionName: "getIntakeOversight",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (formId !== undefined) {
      const form = await getIntakeFormByIdQuery(formId, req.organizationId!);
      if (!form) {
        return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
      }
    }
    const oversight = await getIntakeOversightQuery(req.organizationId!, weeks, formId);
    return res.status(200).json(STATUS_CODE[200](oversight));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve intake oversight figures",
      functionName: "getIntakeOversight",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get submission preview for approval flow
 */
export async function getSubmissionPreview(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }

    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    // Build entity preview from submission data using field mappings
    const entityData = buildEntityDataFromSubmission(
      submission.data as Record<string, unknown>,
      form.schema,
    );

    const storedRun = await getLatestRunForSubmissionQuery(submission.id!, req.organizationId!);
    // A run that can no longer be scored shows no panel rather than failing the
    // whole preview.
    const rescored = storedRun ? rescoreStoredRun(storedRun) : null;
    const euAiActClassification = rescored
      ? {
          questionnaire: rescored.questionnaire,
          answers: rescored.run.answers,
          role: rescored.result.role,
          roles: rescored.result.roles,
          current: rescored.result,
          changedSinceSubmission:
            rescored.result.level !== rescored.run.result.level ||
            !sameHighRiskRoles(
              rescored.result.roles,
              rescored.run.result.roles ??
                (rescored.run.result.role ? [rescored.run.result.role] : []),
            ),
          submittedAt: rescored.run.createdAt,
        }
      : null;

    const assessment = isAssessmentV2(submission.riskAssessment) ? submission.riskAssessment : null;

    // Who may decide, by the stored lane (or, with none yet, the current
    // values); approve re-checks it on what the decision would make true.
    const routingCfg = form.routing ?? null;
    const previewBand = asBand(submission.riskOverride?.tier);
    const { lane } = laneOnRecord(submission.routing ?? null, routingCfg, {
      level: entityLevel(submission.entityType, rescored?.result.level ?? null, entityData),
      finalScore: assessment?.finalScore ?? null,
      scoringStatus: assessment?.status ?? null,
      bandInForce: usesScoreBands(submission) && isScoreBand(previewBand) ? previewBand : null,
    });
    const canDecide = canDecideLane(lane, req.userId!, isAdminRequest(req), routingCfg);
    const laneReviewerIds = laneReviewerIdsFor(lane, routingCfg);
    const laneReviewers =
      laneReviewerIds.length > 0
        ? (await getEligibleReviewersQuery(req.organizationId!, laneReviewerIds)).map((u) => ({
            id: u.id,
            name: [u.name, u.surname].filter(Boolean).join(" "),
          }))
        : [];
    const decideBlockedReason = canDecide
      ? null
      : lane === "senior"
        ? req.t!("This submission is assigned to expert reviewers")
        : req.t!("This submission is assigned to the form's reviewers");

    return res.status(200).json(
      STATUS_CODE[200]({
        submission,
        form: {
          id: form.id,
          name: form.name,
          entityType: form.entityType,
          schema: form.schema,
          riskTierSystem: form.riskTierSystem,
        },
        riskAssessment: submission.riskAssessment,
        riskTier: submission.riskTier,
        riskOverride: submission.riskOverride,
        liveChecks: submission.liveChecks ?? null,
        entityPreview: entityData,
        euAiActClassification,
        assessment,
        suggestedRisks: submission.suggestedRisks,
        // The floor under the current rules; it differs from assessedLevel's
        // when the questionnaire changed after scoring.
        ruleMinimumPreview: ruleMinimumFor(rescored?.result.level ?? null),
        assessedLevel: assessment?.classificationLevel ?? null,
        routing: submission.routing ?? null,
        routingEnabled: routingCfg?.enabled ?? false,
        canDecide,
        decideBlockedReason,
        laneReviewers,
        isSeniorReviewer: routingCfg?.seniorReviewerIds.includes(req.userId!) ?? false,
      }),
    );
  } catch (error) {
    logger.error("Error in getSubmissionPreview:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get the original intake submission for a given entity (project/model).
 * Returns the full submission data with form schema so the frontend
 * can render all fields with labels, including unmapped ones.
 * GET /intake/submissions/by-entity/:entityType/:entityId
 */
export async function getSubmissionByEntity(req: Request, res: Response) {
  const entityType = paramStr(req.params.entityType);
  const entityId = parseId(req.params.entityId);

  if (!entityType || isNaN(entityId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid entity type or ID")));
  }

  const validEntityTypes = ["use_case", "model"];
  if (!validEntityTypes.includes(entityType)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Unsupported entity type")));
  }

  logProcessing({
    description: `fetching submission for ${entityType}:${entityId}`,
    functionName: "getSubmissionByEntity",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const result = await getSubmissionByEntityQuery(entityType, entityId, req.organizationId!);

    if (!result) {
      return res
        .status(404)
        .json(STATUS_CODE[404](req.t!("No intake submission found for this entity")));
    }

    const { submission, formName, formSchema } = result;
    const submissionData = (submission.data ?? {}) as Record<string, unknown>;

    // Build a structured fields array using the form schema for labels/types
    const schemaFields = (formSchema as any)?.fields || [];
    const fields = schemaFields
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((field: any) => ({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        value: submissionData[field.id] ?? null,
        // A visible calculated field without a result is stored as null; a
        // hidden one, or a submission from before the field existed, has no key.
        answered: Object.prototype.hasOwnProperty.call(submissionData, field.id),
        options: field.options || null,
        decimals: field.decimals ?? null,
        prefix: field.prefix ?? null,
        suffix: field.suffix ?? null,
        entityFieldMapping: field.entityFieldMapping || null,
        isMapped: Boolean(field.entityFieldMapping),
      }));

    return res.status(200).json(
      STATUS_CODE[200]({
        submissionId: submission.id,
        formName,
        submitterName: submission.submitterName,
        submitterEmail: submission.submitterEmail,
        submittedAt: submission.createdAt,
        reviewedAt: submission.reviewedAt,
        riskTier: submission.riskTier,
        // The AI-scored (v2) number behind riskTier, so the use case page can
        // show "64 (High)" rather than a bare band.
        riskScore: isAssessmentV2(submission.riskAssessment)
          ? {
              finalScore: submission.riskAssessment.finalScore,
              rulesOnly: submission.riskAssessment.rulesOnly,
              // the score's own band; riskTier holds an override's band if set
              band: submission.riskAssessment.tier,
            }
          : null,
        riskOverrideTier: submission.riskOverride?.tier ?? null,
        fields,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to fetch submission for ${entityType}:${entityId}`,
      functionName: "getSubmissionByEntity",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Override submission risk assessment
 */
export async function overrideSubmissionRisk(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  try {
    const { dimensionOverrides, justification } = req.body;
    // A pre-v2 tier name is stored as its band, so every override is a band.
    const tier = asBand(req.body.tier);

    if (!tier || !justification) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Tier and justification are required")));
    }

    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("Only pending submissions can be changed")));
    }

    // A v2 score has bands, not dimensions, and a floor no reviewer goes below.
    // A submission not scored yet will be scored as v2.
    const isV2 = usesScoreBands(submission);
    if (isV2) {
      const floorError = await checkBandAgainstFloor(req, tier, submissionId);
      if (floorError) return res.status(400).json(STATUS_CODE[400](floorError));
    }

    const override = {
      tier,
      dimensionOverrides: isV2 ? {} : dimensionOverrides || {},
      justification,
      overriddenBy: req.userId!,
      overriddenAt: new Date().toISOString(),
    };

    await updateSubmissionRiskOverrideQuery(submissionId, override, req.organizationId!);

    await logSuccess({
      eventType: "Update",
      description: `risk override applied to submission: ${submissionId}`,
      functionName: "overrideSubmissionRisk",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    // The override is saved; a failure to raise the lane must not undo that.
    try {
      const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
      if (form) await raiseForOverride(submission, form, tier, req.organizationId!);
    } catch (error) {
      logger.error(`Error raising the lane after override of submission ${submissionId}:`, error);
    }

    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: req.t!("Risk override applied"), override }));
  } catch (error) {
    logger.error("Error in overrideSubmissionRisk:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Re-run the assessment stages that failed or were lost (pending for over 10
 * minutes). Finished stages are never re-run. No email.
 * POST /intake/submissions/:id/assessment/retry
 */
export async function retrySubmissionAssessment(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("Only pending submissions can be changed")));
    }

    // The live checks stage reads the submitter's stored language, not this request's.
    const stages = selectRetryStages(
      submission.riskAssessment,
      submission.suggestedRisks,
      new Date(),
      submission.liveChecks,
    );
    if (stages.length === 0) {
      return res.status(409).json(STATUS_CODE[409](req.t!("Nothing to retry")));
    }

    await enqueueIntakeAssessment({
      organizationId: req.organizationId!,
      submissionId,
      stages,
      notify: false,
      lang: req.lang,
    });

    await logSuccess({
      eventType: "Update",
      description: `assessment retry queued for submission ${submissionId}: ${stages.join(", ")}`,
      functionName: "retrySubmissionAssessment",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202]({ stages }));
  } catch (error) {
    logger.error("Error in retrySubmissionAssessment:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Edit, accept, dismiss or restore one suggested risk.
 * PATCH /intake/submissions/:id/suggested-risks/:suggestionId
 */
export async function updateSuggestedRisk(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  const suggestionId = paramStr(req.params.suggestionId);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }
  if (!suggestionId || suggestionId.length > 100) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid suggestion ID")));
  }

  const parsed = parseSuggestionPatch(
    (req.body ?? {}) as Record<string, unknown>,
    new Date().toISOString().slice(0, 10),
  );
  if ("invalid" in parsed) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("Invalid value for {field}", { field: parsed.invalid })));
  }
  const { state, ...content } = parsed.patch;
  if (state === undefined && Object.keys(content).length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Nothing to update")));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("Only pending submissions can be changed")));
    }
    const current = submission.suggestedRisks?.items.find((i) => i.id === suggestionId);
    if (!current) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Suggested risk not found")));
    }
    // The risk register requires a mitigation plan, so nothing is accepted
    // without one, and an accepted risk can't have its plan cleared.
    const resultingState = state ?? current.state;
    if (
      resultingState === "accepted" &&
      !(content.mitigationPlan ?? current.mitigationPlan)?.trim()
    ) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Add a mitigation plan before accepting this risk")));
    }

    const now = new Date().toISOString();
    const patch: Partial<IntakeSuggestedRisk> = {
      ...content,
      ...(Object.keys(content).length > 0 ? { editedBy: req.userId!, editedAt: now } : {}),
      ...(state !== undefined ? { state, decidedBy: req.userId!, decidedAt: now } : {}),
    };
    const item = await updateSuggestedRiskItemQuery(
      submissionId,
      suggestionId,
      patch,
      req.organizationId!,
    );
    if (!item) {
      // Decided, or changed by someone else (e.g. its plan cleared), between
      // the read and the atomic write. Say which.
      const latest = await getSubmissionByIdQuery(submissionId, req.organizationId!);
      const message =
        latest && latest.status !== IntakeSubmissionStatus.PENDING
          ? "Only pending submissions can be changed"
          : "This suggestion changed. Reload and try again.";
      return res.status(409).json(STATUS_CODE[409](req.t!(message)));
    }

    return res.status(200).json(STATUS_CODE[200](item));
  } catch (error) {
    logger.error("Error in updateSuggestedRisk:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Accept every suggestion still in "suggested". Dismissed ones stay dismissed;
 * ones without a mitigation plan are skipped and counted.
 * POST /intake/submissions/:id/suggested-risks/accept-all
 */
export async function acceptAllSuggestedRisks(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("Only pending submissions can be changed")));
    }

    const suggested = (submission.suggestedRisks?.items ?? []).filter(
      (i) => i.state === "suggested",
    ).length;
    const accepted = await setAllSuggestionStatesQuery(
      submissionId,
      "suggested",
      "accepted",
      req.userId!,
      req.organizationId!,
      { requireMitigationPlan: true },
    );
    // The items as stored, so the client shows the server's states. A
    // submission decided meanwhile accepted nothing, which is not "skipped".
    const after = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!after) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    if (after.status !== IntakeSubmissionStatus.PENDING) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("Only pending submissions can be changed")));
    }

    return res.status(200).json(
      STATUS_CODE[200]({
        accepted,
        skipped: Math.max(0, suggested - accepted),
        items: after.suggestedRisks?.items ?? [],
      }),
    );
  } catch (error) {
    logger.error("Error in acceptAllSuggestedRisks:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Approve submission — now accepts optional confirmedEntityData and riskOverride
 */
export async function approveSubmission(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  logProcessing({
    description: `approving submission: ${submissionId}`,
    functionName: "approveSubmission",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const submission = await getSubmissionByIdQuery(
      submissionId,
      req.organizationId!,
      transaction,
      true,
    );

    if (!submission) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }

    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Only pending submissions can be approved")));
    }

    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    if (!form) {
      await transaction.rollback();
      return res
        .status(404)
        .json(
          STATUS_CODE[404](
            req.t!(
              "The form associated with this submission no longer exists. Cannot create entity.",
            ),
          ),
        );
    }
    const formName = form.name;

    // Use confirmed entity data from admin if provided, otherwise build from mapping
    const { confirmedEntityData, riskOverride, euAiActOverride } = req.body;
    let entityData: Record<string, unknown> =
      confirmedEntityData ||
      buildEntityDataFromSubmission(submission.data as Record<string, unknown>, form.schema);

    // The EU AI Act step owns the use case's level: score the stored answers
    // again and apply a justified reviewer change; the dialog's level is
    // ignored. The computed roles replace the dialog's roles, which stay only
    // when the result has no role (Out of scope). A run that can no longer be
    // scored is treated as no run.
    const storedRun =
      submission.entityType === IntakeEntityType.USE_CASE
        ? await getLatestRunForSubmissionQuery(submissionId, req.organizationId!, transaction)
        : null;
    const rescored = storedRun ? rescoreStoredRun(storedRun) : null;
    let classification: {
      questionnaireVersion: number;
      answers: Answers;
      computed: ClassificationResult;
      finalLevel: string;
      justification: string | null;
    } | null = null;
    if (rescored) {
      const computed = rescored.result;
      const finalLevel = euAiActOverride?.level ?? computed.level;
      // The levels the questionnaire can produce; GPAI and General Risk are not
      // offered here.
      const ALLOWED_LEVELS: string[] = [
        AiRiskClassification.PROHIBITED,
        AiRiskClassification.HIGH_RISK,
        AiRiskClassification.LIMITED_RISK,
        AiRiskClassification.MINIMAL_RISK,
        AiRiskClassification.OUT_OF_SCOPE,
      ];
      if (!ALLOWED_LEVELS.includes(finalLevel)) {
        await transaction.rollback();
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Invalid EU AI Act classification level")));
      }
      const justification =
        typeof euAiActOverride?.justification === "string"
          ? euAiActOverride.justification.trim()
          : "";
      if (finalLevel !== computed.level && justification.length < 10) {
        await transaction.rollback();
        return res
          .status(400)
          .json(
            STATUS_CODE[400](
              req.t!(
                "A justification of at least 10 characters is required when changing the computed EU AI Act classification",
              ),
            ),
          );
      }
      classification = {
        questionnaireVersion: rescored.run.questionnaireVersion,
        answers: rescored.run.answers,
        computed,
        finalLevel,
        justification: finalLevel !== computed.level ? justification : null,
      };
      entityData = {
        ...entityData,
        ai_risk_classification: finalLevel,
        ...(computed.roles.length > 0 ? { high_risk_roles: computed.roles } : {}),
      };
    }

    // An AI-scored submission's score is re-floored under the level it is
    // approved at, which a reviewer may have changed; running stages are
    // closed. Risk_tier keeps an override's band (see the query).
    const approvedLevel = (classification?.finalLevel ?? null) as ClassificationLevel | null;
    const settledAssessment = await settleAssessmentOnDecision(
      submission,
      approvedLevel,
      req.organizationId!,
      transaction,
      { refloor: true },
    );

    // The band override, from this request or saved earlier through
    // PATCH /risk-override: on an AI-scored (or not yet scored) submission
    // neither may sit below the approved level's rule minimum.
    // A pre-v2 tier name counts as its band and is stored as it, on every
    // submission, as PATCH /risk-override stores it.
    const requestOverride = riskOverride && riskOverride.tier && riskOverride.justification;
    const storedOverride = submission.riskOverride;
    const bandToCheck = asBand(requestOverride ? riskOverride.tier : storedOverride?.tier);
    const bandsApply = usesScoreBands(submission);
    if (bandsApply && bandToCheck) {
      const floorError = bandFloorError(req, bandToCheck, ruleMinimumFor(approvedLevel));
      if (floorError) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400](floorError));
      }
    }
    if (requestOverride) {
      await updateSubmissionRiskOverrideQuery(
        submissionId,
        {
          tier: bandToCheck,
          dimensionOverrides: bandsApply ? {} : riskOverride.dimensionOverrides || {},
          justification: riskOverride.justification,
          overriddenBy: req.userId!,
          overriddenAt: new Date().toISOString(),
        },
        req.organizationId!,
        transaction,
      );
    } else if (storedOverride?.tier && bandToCheck !== storedOverride.tier) {
      await updateSubmissionRiskOverrideQuery(
        submissionId,
        { ...storedOverride, tier: bandToCheck },
        req.organizationId!,
        transaction,
      );
    }

    // Who may approve depends on the lane this approval would make true: a
    // standard reviewer can't approve while setting a Prohibited level or a
    // band that routes to senior review.
    const routingCfg = form.routing ?? null;
    const storedRouting = submission.routing ?? null;
    // Without a scorable run, the level is the one the entity gets.
    const decidedLevel = entityLevel(submission.entityType, approvedLevel, entityData);
    const decision = laneAtDecision(storedRouting, routingCfg, {
      level: decidedLevel,
      finalScore: settledAssessment?.finalScore ?? null,
      scoringStatus: settledAssessment?.status ?? null,
      bandInForce: bandsApply && isScoreBand(bandToCheck) ? bandToCheck : null,
    });
    if (!canDecideLane(decision.lane, req.userId!, isAdminRequest(req), routingCfg)) {
      await transaction.rollback();
      return res.status(403).json(
        STATUS_CODE[403](
          decision.lane === "senior"
            ? req.t!("An expert reviewer has to decide this: {reason}", {
                reason: routingReasonText(req, decision.reason),
              })
            : req.t!("This submission is assigned to the form's reviewers"),
        ),
      );
    }

    const overrideInForce = requestOverride
      ? { tier: bandToCheck, overriddenBy: req.userId! }
      : storedOverride?.tier
        ? { tier: bandToCheck, overriddenBy: storedOverride.overriddenBy }
        : null;
    await setDecisionRecordQuery(
      submissionId,
      buildDecisionRecord({
        level: decidedLevel,
        assessment: settledAssessment,
        override: overrideInForce,
        lane: decision.lane,
      }),
      req.organizationId!,
      transaction,
    );

    // A share of standard-lane approvals by non-seniors is sampled for a
    // second review. The write only lands on the routing read above.
    const pickedForSecondReview =
      decision.lane === "standard" &&
      storedRouting !== null &&
      routingCfg !== null &&
      !routingCfg.seniorReviewerIds.includes(req.userId!) &&
      pickSecondReview(routingCfg.secondReviewRate);
    if (pickedForSecondReview) {
      const written = await updateSubmissionRoutingQuery(
        submissionId,
        {
          ...storedRouting,
          secondReview: { status: "open", selectedAt: new Date().toISOString() },
        },
        req.organizationId!,
        transaction,
        storedRouting,
      );
      if (!written) {
        await transaction.rollback();
        return res
          .status(409)
          .json(STATUS_CODE[409](req.t!("This submission changed. Reload and try again.")));
      }
    }

    // Create the entity based on entity type
    let entityId: number;
    const aiRiskClassification = mapToAiRiskClassification(
      entityData.ai_risk_classification as string,
    );

    if (submission.entityType === IntakeEntityType.MODEL) {
      const model = ModelInventoryModel.createNewModelInventory({
        provider: (entityData.provider as string) || "",
        model: (entityData.name as string) || (entityData.model as string) || "",
        version: (entityData.modelVersion as string) || (entityData.version as string) || "",
        approver: entityData.approver ? Number(entityData.approver) : undefined,
        capabilities:
          (entityData.capabilities as string) || (entityData.intendedUse as string) || "",
        security_assessment: (entityData.security_assessment as boolean) || false,
        reference_link: (entityData.reference_link as string) || "",
        biases: (entityData.biases as string) || "",
        limitations: (entityData.limitations as string) || "",
        hosting_provider:
          (entityData.hosting_provider as string) || (entityData.modelType as string) || "",
        status: ModelInventoryStatus.PENDING,
      });

      const createdModel = await createNewModelInventoryQuery(
        model,
        req.organizationId!,
        [],
        [],
        transaction,
      );
      entityId = createdModel.id!;
    } else if (submission.entityType === IntakeEntityType.USE_CASE) {
      const createdProject = await createNewProjectQuery(
        {
          project_title: (entityData.project_title as string) || "",
          description: (entityData.description as string) || "",
          start_date: entityData.start_date
            ? new Date(entityData.start_date as string)
            : new Date(),
          goal: (entityData.goal as string) || (entityData.description as string) || "",
          owner: req.userId!,
          ai_risk_classification: aiRiskClassification as any,
          high_risk_roles: highRiskRolesFromEntityData(entityData),
          geography: entityData.geography ? Number(entityData.geography) : 1,
          status: ProjectStatus.UNDER_REVIEW,
        },
        [],
        // Only a level that comes from the EU AI Act step (a scorable run)
        // brings the EU AI Act framework along. Submissions without a run keep
        // their mapped or reviewer level and get no framework.
        classification ? [EU_AI_ACT_FRAMEWORK_ID] : [],
        req.organizationId!,
        req.userId!,
        transaction,
      );
      entityId = createdProject.id!;
      if (classification) {
        await createEUFrameworkQuery(entityId, false, req.organizationId!, transaction);
        await insertClassificationRunQuery(
          {
            useCaseId: entityId,
            intakeSubmissionId: null,
            questionnaireVersion: classification.questionnaireVersion,
            roles: classification.computed.roles,
            answers: classification.answers,
            result: classification.computed,
            reviewerLevel: classification.justification ? classification.finalLevel : null,
            reviewerJustification: classification.justification,
            reviewedBy: classification.justification ? req.userId! : null,
            source: "intake",
            createdBy: req.userId!,
          },
          req.organizationId!,
          transaction,
        );
        await recordMultipleFieldChanges(
          entityId,
          req.userId!,
          req.organizationId!,
          [
            {
              fieldName: "AI risk classification",
              oldValue: "-",
              newValue: classification.justification
                ? `${classification.finalLevel} (computed ${classification.computed.level}; changed by reviewer: ${classification.justification})`
                : `${classification.finalLevel} (from the intake EU AI Act classification)`,
            },
          ],
          transaction,
        );
      }
    } else {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Unsupported entity type")));
    }

    // The suggested risks reviewers accepted become real risks on the new
    // entity, in this transaction: any failure rolls the approval back. The
    // submission row is locked above, so no suggestion changes underneath.
    const approval = { approverId: req.userId!, approvedAt: new Date(), submissionId };
    for (const s of submission.suggestedRisks?.items ?? []) {
      if (s.state !== "accepted") continue;
      if (submission.entityType === IntakeEntityType.MODEL) {
        await createNewModelRiskQuery(
          buildModelRiskFromSuggestion(s, { ...approval, modelId: entityId }),
          req.organizationId!,
          transaction,
        );
      } else {
        await createRiskService(
          buildUseCaseRiskFromSuggestion(s, { ...approval, useCaseId: entityId }),
          { userId: req.userId!, organizationId: req.organizationId! },
          transaction,
        );
      }
    }

    const updatedSubmission = await approveSubmissionQuery(
      submissionId,
      entityId,
      req.userId!,
      req.organizationId!,
      transaction,
    );

    await transaction.commit();

    if (submission.submitterEmail) {
      sendSubmissionApprovedEmail(
        submission.submitterEmail,
        submission.submitterName || "Submitter",
        formName,
        submissionId,
        submission.entityType,
        req.lang,
      ).catch((err) => logger.error("Failed to send approval email:", err));
    }

    await logSuccess({
      eventType: "Update",
      description: `submission approved: ${submissionId}, entity created: ${entityId}`,
      functionName: "approveSubmission",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    await logIfOutsideLane(req, submissionId, decision.lane, routingCfg, "approveSubmission");
    if (pickedForSecondReview && routingCfg) {
      sendSecondReviewRequestEmail(
        req.organizationId!,
        submissionId,
        routingCfg.seniorReviewerIds,
        req.lang,
      ).catch((err) => logger.error("Failed to send second review request email:", err));
      await logSuccess({
        eventType: "Update",
        description: `submission ${submissionId} picked for second review`,
        functionName: "approveSubmission",
        fileName: "intakeForm.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
    }

    return res.status(200).json(STATUS_CODE[200](updatedSubmission));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to approve submission: ${submissionId}`,
      functionName: "approveSubmission",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Reject submission
 */
export async function rejectSubmission(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }

  logProcessing({
    description: `rejecting submission: ${submissionId}`,
    functionName: "rejectSubmission",
    fileName: "intakeForm.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const rejectionReason = req.body.rejectionReason || req.body.reason;

    if (!rejectionReason || !rejectionReason.trim()) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Rejection reason is required")));
    }

    const submission = await getSubmissionByIdQuery(
      submissionId,
      req.organizationId!,
      transaction,
      true,
    );

    if (!submission) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }

    if (submission.status !== IntakeSubmissionStatus.PENDING) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Only pending submissions can be rejected")));
    }

    // Fetch form and tenant info before commit so email data is available atomically
    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    const formName = form?.name || "Unknown Form";
    const formPublicId = form?.publicId;
    const tenantSlug = await getTenantSlugById(req.organizationId!);
    const formSlug = form?.slug || "";

    // Close any assessment stage still running; the job's later writes are
    // ignored once the submission is decided.
    const level = await currentRulesLevel(submissionId, req.organizationId!, transaction);
    const settledAssessment = await settleAssessmentOnDecision(
      submission,
      level,
      req.organizationId!,
      transaction,
      { refloor: false },
    );
    const storedOverride = submission.riskOverride;

    // Rejecting creates nothing, so a stored lane is not re-checked; without
    // one, the lane comes from the current values.
    const routingCfg = form?.routing ?? null;
    const storedBand = asBand(storedOverride?.tier);
    const { lane } = laneOnRecord(submission.routing ?? null, routingCfg, {
      level,
      finalScore: settledAssessment?.finalScore ?? null,
      scoringStatus: settledAssessment?.status ?? null,
      bandInForce: usesScoreBands(submission) && isScoreBand(storedBand) ? storedBand : null,
    });
    if (!canDecideLane(lane, req.userId!, isAdminRequest(req), routingCfg)) {
      await transaction.rollback();
      return res
        .status(403)
        .json(
          STATUS_CODE[403](
            lane === "senior"
              ? req.t!("This submission is assigned to expert reviewers")
              : req.t!("This submission is assigned to the form's reviewers"),
          ),
        );
    }
    await setDecisionRecordQuery(
      submissionId,
      buildDecisionRecord({
        level,
        assessment: settledAssessment,
        override: storedOverride?.tier
          ? { tier: asBand(storedOverride.tier), overriddenBy: storedOverride.overriddenBy }
          : null,
        lane,
      }),
      req.organizationId!,
      transaction,
    );

    const updatedSubmission = await rejectSubmissionQuery(
      submissionId,
      rejectionReason,
      req.userId!,
      req.organizationId!,
      transaction,
    );

    await transaction.commit();

    if (submission.submitterEmail) {
      // Generate HMAC-signed resubmission token
      const resubmissionToken = createSignedToken({
        submissionId: submission.id,
        formId: submission.formId,
        email: submission.submitterEmail,
        timestamp: Date.now(),
      });

      // Use new URL format if publicId available, fall back to old format
      if (formPublicId || (tenantSlug && formSlug)) {
        sendSubmissionRejectedEmail(
          submission.submitterEmail,
          submission.submitterName || "Submitter",
          formName,
          submissionId,
          rejectionReason,
          resubmissionToken,
          formPublicId || "",
          tenantSlug || "",
          formSlug,
          req.lang,
        ).catch((err) => logger.error("Failed to send rejection email:", err));
      } else {
        logger.warn(
          `Could not send rejection email for submission #${submissionId}: missing routing info`,
        );
      }
    }

    await logSuccess({
      eventType: "Update",
      description: `submission rejected: ${submissionId}`,
      functionName: "rejectSubmission",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    await logIfOutsideLane(req, submissionId, lane, routingCfg, "rejectSubmission");

    return res.status(200).json(STATUS_CODE[200](updatedSubmission));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to reject submission: ${submissionId}`,
      functionName: "rejectSubmission",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Send a standard-lane submission to senior review by hand. Automatic
 * re-routing leaves it alone afterwards.
 * POST /intake/submissions/:id/escalate
 */
export async function escalateSubmission(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason || reason.length > 1000) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("A reason of 1 to 1000 characters is required")));
  }

  try {
    const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
    if (!submission) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    }
    const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    const cfg = form.routing;
    const current = submission.routing;
    if (
      submission.status !== IntakeSubmissionStatus.PENDING ||
      !cfg?.enabled ||
      current?.lane !== "standard"
    ) {
      return res
        .status(409)
        .json(
          STATUS_CODE[409](
            req.t!("Expert review can only be requested for pending submissions in regular review"),
          ),
        );
    }
    const userId = req.userId!;
    if (
      !isAdminRequest(req) &&
      !cfg.standardReviewerIds.includes(userId) &&
      !cfg.seniorReviewerIds.includes(userId)
    ) {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Only this form's reviewers can request expert review")));
    }

    const at = new Date().toISOString();
    const routing: ISubmissionRouting = {
      ...current,
      lane: "senior",
      reason: "escalated",
      routedAt: at,
      escalation: { by: userId, at, reason },
    };
    const written = await updateSubmissionRoutingQuery(
      submissionId,
      routing,
      req.organizationId!,
      undefined,
      current,
    );
    if (!written) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("This submission changed. Reload and try again.")));
    }

    await logSuccess({
      eventType: "Update",
      description: `submission ${submissionId} escalated to expert review`,
      functionName: "escalateSubmission",
      fileName: "intakeForm.ctrl.ts",
      userId,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](routing));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `failed to escalate submission: ${submissionId}`,
      functionName: "escalateSubmission",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ============================================================================
// LLM FEATURE CONTROLLERS (Admin - Authenticated)
// ============================================================================

/**
 * Get LLM-suggested questions
 */
export async function getLLMSuggestedQuestions(req: Request, res: Response) {
  const { entityType, context, llmKeyId } = req.body ?? {};
  if (!llmKeyId) {
    return res.status(400).json(STATUS_CODE[400](req.t!("LLM key ID is required")));
  }
  return handleLlmKeyRequest(req, res, "getLLMSuggestedQuestions", llmKeyId, async (keyId) => {
    const questions = await generateSuggestedQuestions(
      entityType || "use_case",
      context || "",
      keyId,
      req.organizationId!,
    );
    if (!questions) {
      return res.status(500).json(STATUS_CODE[500](req.t!("Failed to generate questions")));
    }
    return res.status(200).json(STATUS_CODE[200](questions));
  });
}

/**
 * Generate field guidance text
 */
export async function getFieldGuidance(req: Request, res: Response) {
  const { fieldLabel, entityType, llmKeyId } = req.body ?? {};
  if (!fieldLabel || !llmKeyId) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("Field label and LLM key ID are required")));
  }
  return handleLlmKeyRequest(req, res, "getFieldGuidance", llmKeyId, async (keyId) => {
    const guidanceText = await generateFieldGuidance(
      fieldLabel,
      entityType || "use_case",
      keyId,
      req.organizationId!,
    );
    if (!guidanceText) {
      return res.status(500).json(STATUS_CODE[500](req.t!("Failed to generate guidance")));
    }
    return res.status(200).json(STATUS_CODE[200]({ guidanceText }));
  });
}

// ============================================================================
// PUBLIC CONTROLLERS (Unauthenticated)
// ============================================================================

/**
 * Preview form by ID (authenticated - admin only)
 */
export async function previewForm(req: Request, res: Response) {
  const formId = parseId(req.params.id);
  if (isNaN(formId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid form ID")));
  }

  try {
    const form = await getIntakeFormByIdQuery(formId, req.organizationId!);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    return res.status(200).json(
      STATUS_CODE[200]({
        form: {
          id: form.id,
          name: form.name,
          description: form.description,
          slug: form.slug,
          entityType: form.entityType,
          schema: form.schema,
          submitButtonText: form.submitButtonText,
          publicId: form.publicId,
          designSettings: form.designSettings ?? null,
        },
        isPreview: true,
      }),
    );
  } catch (error) {
    logger.error("Error in previewForm:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get public form by public ID (new URL format, unauthenticated)
 */
export async function getPublicFormByPublicId(req: Request, res: Response) {
  const publicId = paramStr(req.params.publicId);
  const resubmissionToken = req.query.token as string | undefined;

  try {
    // Resolve tenant from publicId
    const tenantInfo = await getTenantByPublicId(publicId);
    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    const form = await getFormByPublicIdQuery(publicId, tenantInfo.orgId);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found or not available")));
    }

    // Fetch org logo (non-blocking — null if missing)
    let organizationLogo: string | null = null;
    try {
      const logoRow = await getCompanyLogoQuery(tenantInfo.orgId);
      if (logoRow && (logoRow as any).content) {
        const buf = Buffer.isBuffer((logoRow as any).content)
          ? (logoRow as any).content
          : Buffer.from((logoRow as any).content);
        const mimeType = (logoRow as any).type || "image/png";
        organizationLogo = `data:${mimeType};base64,${buf.toString("base64")}`;
      }
    } catch {
      // Logo is optional — swallow errors silently
    }

    // Check for resubmission token
    let previousData: Record<string, unknown> | undefined;
    let previousSubmitterName: string | undefined;
    let previousSubmitterEmail: string | undefined;
    let previousSubmissionId: number | undefined;
    if (resubmissionToken) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId && decoded.formId === form.id) {
        // Check token expiry (7 days)
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge <= SEVEN_DAYS_MS) {
          const previousSubmission = await getSubmissionByIdQuery(
            decoded.submissionId,
            tenantInfo.orgId,
          );
          if (
            previousSubmission &&
            previousSubmission.status !== IntakeSubmissionStatus.APPROVED &&
            previousSubmission.submitterEmail === decoded.email
          ) {
            previousData = previousSubmission.data as Record<string, unknown>;
            previousSubmitterName = previousSubmission.submitterName ?? undefined;
            previousSubmitterEmail = previousSubmission.submitterEmail ?? undefined;
            previousSubmissionId = previousSubmission.id;
          }
        }
      }
    }

    return res.status(200).json(
      STATUS_CODE[200]({
        form: {
          id: form.id,
          name: form.name,
          description: form.description,
          slug: form.slug,
          entityType: form.entityType,
          schema: publicSchema(form.schema),
          submitButtonText: form.submitButtonText,
          publicId: form.publicId,
          designSettings: form.designSettings ?? null,
        },
        organizationLogo,
        previousData,
        previousSubmitterName,
        previousSubmitterEmail,
        ...(await buildPublicRiskStep(form, previousSubmissionId, tenantInfo.orgId)),
        liveChecks: await buildPublicLiveChecks(form, tenantInfo.orgId),
      }),
    );
  } catch (error) {
    logger.error(`Error in getPublicFormByPublicId: ${publicId}`, error);
    return res
      .status(500)
      .json(
        STATUS_CODE[500](req.t!("An error occurred while loading the form. Please try again.")),
      );
  }
}

/**
 * Submit public form by public ID (new URL format, unauthenticated)
 */
export async function submitPublicFormByPublicId(req: Request, res: Response) {
  const publicId = paramStr(req.params.publicId);

  try {
    const tenantInfo = await getTenantByPublicId(publicId);
    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found")));
    }

    const clientIp =
      req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0] || "unknown";
    const withinLimit = await checkRateLimitQuery(clientIp, tenantInfo.orgId);

    if (!withinLimit) {
      return res
        .status(429)
        .json(STATUS_CODE[429](req.t!("Too many submissions. Please try again later.")));
    }

    const form = await getFormByPublicIdQuery(publicId, tenantInfo.orgId);
    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found or not available")));
    }

    const {
      submitterEmail,
      submitterName,
      formData,
      captchaToken,
      captchaAnswer,
      resubmissionToken,
      euAiActRiskAnswers,
    } = req.body;

    // Validate contact info (always required)
    // With its review time, which the submission stores (#5189).
    const fullFormForValidation = await getIntakeFormByIdQuery(form.id, tenantInfo.orgId, {
      withReviewDays: true,
    });

    if (!submitterEmail) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Submitter email is required")));
    }
    if (!isEmail(submitterEmail)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid email format")));
    }

    if (!formData) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Form data is required")));
    }

    if (typeof formData !== "object" || Array.isArray(formData)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Form data must be an object")));
    }

    // Apply show/hide rules and formulas, then validate what will be stored
    let cleanedData: Record<string, unknown> = formData;
    if (fullFormForValidation?.schema) {
      const prepared = prepareSubmissionData(formData, fullFormForValidation.schema);
      cleanedData = prepared.data;
      const validationErrors = validateFormData(
        cleanedData,
        fullFormForValidation.schema,
        prepared.visibleIds,
      );
      if (validationErrors.length > 0) {
        return res.status(400).json(
          STATUS_CODE[400]({
            message: req.t!("Form validation failed"),
            errors: validationErrors,
          }),
        );
      }
    }

    // Score the EU AI Act step on the server when the form has it
    const riskStep = prepareIntakeRiskStep(
      Boolean(form.euAiActRiskStepEnabled),
      euAiActRiskAnswers,
    );
    if (!riskStep.ok) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!(riskStep.message),
          errors: riskStep.errors,
          step: "eu_ai_act_risk",
        }),
      );
    }

    // Validate CAPTCHA
    if (!captchaToken || captchaAnswer === undefined) {
      return res.status(400).json(STATUS_CODE[400](req.t!("CAPTCHA verification required")));
    }

    const captchaPayload = verifySignedToken<{ answer: number; timestamp: number }>(captchaToken);
    if (!captchaPayload) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid CAPTCHA token")));
    }

    const tokenAge = Date.now() - captchaPayload.timestamp;
    if (tokenAge > 5 * 60 * 1000) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("CAPTCHA expired. Please refresh and try again.")));
    }

    if (Number(captchaPayload.answer) !== Number(captchaAnswer)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Incorrect CAPTCHA answer")));
    }

    const resolvedEmail = submitterEmail;
    const resolvedName = submitterName || (submitterEmail ? submitterEmail.split("@")[0] : null);

    // Handle resubmission (7-day expiry on resubmission tokens)
    let originalSubmissionId: number | undefined;
    if (resubmissionToken && resolvedEmail) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId) {
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge > SEVEN_DAYS_MS) {
          return res
            .status(400)
            .json(
              STATUS_CODE[400](req.t!("Resubmission link has expired. Please request a new one.")),
            );
        }
        if (decoded.email !== resolvedEmail) {
          return res
            .status(400)
            .json(STATUS_CODE[400](req.t!("Email does not match the original submission.")));
        }
        originalSubmissionId = decoded.submissionId;
      }
    }

    // The review time in force now; the confirmation email uses this, not the
    // form's later setting.
    const reviewTime = reviewTimeAtSubmit(fullFormForValidation?.reviewDays);
    const transaction = await sequelize.transaction();

    try {
      const submission = await createSubmissionQuery(
        {
          formId: form.id,
          submitterEmail: resolvedEmail,
          submitterName: resolvedName,
          data: cleanedData,
          entityType: form.entityType,
          originalSubmissionId,
          ipAddress: clientIp,
          ...reviewTime,
        },
        tenantInfo.orgId,
        transaction,
      );

      if (riskStep.prepared) {
        await persistIntakeRiskRun(
          submission.id!,
          riskStep.prepared,
          tenantInfo.orgId,
          transaction,
        );
      }

      await transaction.commit();

      // Generate resubmission token only if email is present
      let newResubmissionToken: string | undefined;
      if (resolvedEmail) {
        newResubmissionToken = createSignedToken({
          submissionId: submission.id,
          formId: form.id,
          email: resolvedEmail,
          timestamp: Date.now(),
        });
      }

      const submissionName = resolvedName || "Anonymous";

      // The submitter's confirmation names the reviewers, so with routing on
      // it waits for the lane (the assessment job or its 2-minute cap sends
      // it); with nothing to wait for it goes now.
      void trySendSubmitterConfirmation(tenantInfo.orgId, submission.id!, req.lang, {
        fallback: false,
      });

      // Get full form with recipients to send notifications
      const fullForm = await getIntakeFormByIdQuery(form.id, tenantInfo.orgId);

      // After the commit and never thrown: a failed write leaves the submission as is.
      const liveChecks = await recordSubmitLiveChecks({
        form: fullFormForValidation,
        organizationId: tenantInfo.orgId,
        submissionId: submission.id!,
        data: cleanedData,
        prefill: req.body.prefill,
        language: req.lang,
      });

      void startIntakeAssessment({
        organizationId: tenantInfo.orgId,
        submissionId: submission.id!,
        lang: req.lang,
        liveChecks,
        form: fullForm,
        adminFallback: false,
        formId: form.id,
        formName: form.name,
        submitterName: submissionName,
        submitterEmail: resolvedEmail || "No email provided",
        entityType: form.entityType,
      });

      return res.status(201).json(
        STATUS_CODE[201]({
          message: resolvedEmail
            ? "Form submitted successfully. You will receive an email when your submission is reviewed."
            : "Form submitted successfully.",
          submissionId: submission.id,
          resubmissionToken: newResubmissionToken,
        }),
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Error in submitPublicFormByPublicId: ${publicId}`, error);
    return res
      .status(500)
      .json(
        STATUS_CODE[500](req.t!("An error occurred while submitting the form. Please try again.")),
      );
  }
}

/**
 * Get public form by slug (legacy URL format, unauthenticated)
 */
export async function getPublicForm(req: Request, res: Response) {
  const tenantSlug = paramStr(req.params.tenantSlug);
  const formSlug = paramStr(req.params.formSlug);
  const resubmissionToken = req.query.token as string | undefined;

  try {
    const tenantInfo = await getTenantHashBySlug(tenantSlug);

    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Organization not found")));
    }

    const form = await getActivePublicFormQuery(formSlug, tenantInfo.id);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found or not available")));
    }

    // Fetch org logo (non-blocking — null if missing)
    let organizationLogo: string | null = null;
    try {
      const logoRow = await getCompanyLogoQuery(tenantInfo.id);
      if (logoRow && (logoRow as any).content) {
        const buf = Buffer.isBuffer((logoRow as any).content)
          ? (logoRow as any).content
          : Buffer.from((logoRow as any).content);
        const mimeType = (logoRow as any).type || "image/png";
        organizationLogo = `data:${mimeType};base64,${buf.toString("base64")}`;
      }
    } catch {
      // Logo is optional — swallow errors silently
    }

    let previousData: Record<string, unknown> | undefined;
    let previousSubmitterName: string | undefined;
    let previousSubmitterEmail: string | undefined;
    let previousSubmissionId: number | undefined;
    if (resubmissionToken) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId && decoded.formId === form.id) {
        // Check token expiry (7 days)
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge <= SEVEN_DAYS_MS) {
          const previousSubmission = await getSubmissionByIdQuery(
            decoded.submissionId,
            tenantInfo.id,
          );
          if (
            previousSubmission &&
            previousSubmission.status !== IntakeSubmissionStatus.APPROVED &&
            previousSubmission.submitterEmail === decoded.email
          ) {
            previousData = previousSubmission.data as Record<string, unknown>;
            previousSubmitterName = previousSubmission.submitterName ?? undefined;
            previousSubmitterEmail = previousSubmission.submitterEmail ?? undefined;
            previousSubmissionId = previousSubmission.id;
          }
        }
      }
    }

    return res.status(200).json(
      STATUS_CODE[200]({
        form: {
          id: form.id,
          name: form.name,
          description: form.description,
          slug: form.slug,
          entityType: form.entityType,
          schema: publicSchema(form.schema),
          submitButtonText: form.submitButtonText,
          publicId: form.publicId,
          designSettings: form.designSettings ?? null,
        },
        organizationLogo,
        previousData,
        previousSubmitterName,
        previousSubmitterEmail,
        ...(await buildPublicRiskStep(form, previousSubmissionId, tenantInfo.id)),
        liveChecks: await buildPublicLiveChecks(form, tenantInfo.id),
      }),
    );
  } catch (error) {
    logger.error(`Error in getPublicForm: ${tenantSlug}/${formSlug}`, error);
    return res
      .status(500)
      .json(
        STATUS_CODE[500](req.t!("An error occurred while loading the form. Please try again.")),
      );
  }
}

/**
 * Submit public form (legacy URL format, unauthenticated)
 */
export async function submitPublicForm(req: Request, res: Response) {
  const tenantSlug = paramStr(req.params.tenantSlug);
  const formSlug = paramStr(req.params.formSlug);

  try {
    const tenantInfo = await getTenantHashBySlug(tenantSlug);

    if (!tenantInfo) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Organization not found")));
    }

    const clientIp =
      req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0] || "unknown";
    const withinLimit = await checkRateLimitQuery(clientIp, tenantInfo.id);

    if (!withinLimit) {
      return res
        .status(429)
        .json(STATUS_CODE[429](req.t!("Too many submissions. Please try again later.")));
    }

    const form = await getActivePublicFormQuery(formSlug, tenantInfo.id);

    if (!form) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Form not found or not available")));
    }

    const {
      submitterEmail,
      submitterName,
      formData,
      captchaToken,
      captchaAnswer,
      resubmissionToken,
      euAiActRiskAnswers,
    } = req.body;

    // Validate contact info (always required)
    // With its review time, which the submission stores (#5189).
    const fullFormForValidation = await getIntakeFormByIdQuery(form.id, tenantInfo.id, {
      withReviewDays: true,
    });

    if (!submitterEmail) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Submitter email is required")));
    }
    if (!isEmail(submitterEmail)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid email format")));
    }

    if (!formData) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Form data is required")));
    }

    if (typeof formData !== "object" || Array.isArray(formData)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Form data must be an object")));
    }

    // Apply show/hide rules and formulas, then validate what will be stored
    let cleanedData: Record<string, unknown> = formData;
    if (fullFormForValidation?.schema) {
      const prepared = prepareSubmissionData(formData, fullFormForValidation.schema);
      cleanedData = prepared.data;
      const validationErrors = validateFormData(
        cleanedData,
        fullFormForValidation.schema,
        prepared.visibleIds,
      );
      if (validationErrors.length > 0) {
        return res.status(400).json(
          STATUS_CODE[400]({
            message: req.t!("Form validation failed"),
            errors: validationErrors,
          }),
        );
      }
    }

    // Score the EU AI Act step on the server when the form has it
    const riskStep = prepareIntakeRiskStep(
      Boolean(form.euAiActRiskStepEnabled),
      euAiActRiskAnswers,
    );
    if (!riskStep.ok) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!(riskStep.message),
          errors: riskStep.errors,
          step: "eu_ai_act_risk",
        }),
      );
    }

    // Validate CAPTCHA
    if (!captchaToken || captchaAnswer === undefined) {
      return res.status(400).json(STATUS_CODE[400](req.t!("CAPTCHA verification required")));
    }

    const captchaPayload = verifySignedToken<{ answer: number; timestamp: number }>(captchaToken);
    if (!captchaPayload) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid CAPTCHA token")));
    }

    const tokenAge = Date.now() - captchaPayload.timestamp;
    if (tokenAge > 5 * 60 * 1000) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("CAPTCHA expired. Please refresh and try again.")));
    }

    if (Number(captchaPayload.answer) !== Number(captchaAnswer)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Incorrect CAPTCHA answer")));
    }

    const resolvedEmail = submitterEmail;
    const resolvedName = submitterName || (submitterEmail ? submitterEmail.split("@")[0] : null);

    // Handle resubmission (7-day expiry on resubmission tokens)
    let originalSubmissionId: number | undefined;
    if (resubmissionToken && resolvedEmail) {
      const decoded = verifySignedToken<{
        submissionId: number;
        formId: number;
        email: string;
        timestamp: number;
      }>(resubmissionToken);

      if (decoded && decoded.submissionId) {
        const tokenAge = Date.now() - (decoded.timestamp || 0);
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (tokenAge > SEVEN_DAYS_MS) {
          return res
            .status(400)
            .json(
              STATUS_CODE[400](req.t!("Resubmission link has expired. Please request a new one.")),
            );
        }
        if (decoded.email !== resolvedEmail) {
          return res
            .status(400)
            .json(STATUS_CODE[400](req.t!("Email does not match the original submission.")));
        }
        originalSubmissionId = decoded.submissionId;
      }
    }

    // The review time in force now; the confirmation email uses this, not the
    // form's later setting.
    const reviewTime = reviewTimeAtSubmit(fullFormForValidation?.reviewDays);
    const transaction = await sequelize.transaction();

    try {
      const submission = await createSubmissionQuery(
        {
          formId: form.id,
          submitterEmail: resolvedEmail,
          submitterName: resolvedName,
          data: cleanedData,
          entityType: form.entityType,
          originalSubmissionId,
          ipAddress: clientIp,
          ...reviewTime,
        },
        tenantInfo.id,
        transaction,
      );

      if (riskStep.prepared) {
        await persistIntakeRiskRun(submission.id!, riskStep.prepared, tenantInfo.id, transaction);
      }

      await transaction.commit();

      // Generate resubmission token only if email is present
      let newResubmissionToken: string | undefined;
      if (resolvedEmail) {
        newResubmissionToken = createSignedToken({
          submissionId: submission.id,
          formId: form.id,
          email: resolvedEmail,
          timestamp: Date.now(),
        });
      }

      const submissionName = resolvedName || "Anonymous";

      // The submitter's confirmation names the reviewers, so with routing on
      // it waits for the lane (the assessment job or its 2-minute cap sends
      // it); with nothing to wait for it goes now.
      void trySendSubmitterConfirmation(tenantInfo.id, submission.id!, req.lang, {
        fallback: false,
      });

      // Use per-form recipients; this route falls back to org admins without them
      const fullForm = await getIntakeFormByIdQuery(form.id, tenantInfo.id);

      // After the commit and never thrown: a failed write leaves the submission as is.
      const liveChecks = await recordSubmitLiveChecks({
        form: fullFormForValidation,
        organizationId: tenantInfo.id,
        submissionId: submission.id!,
        data: cleanedData,
        prefill: req.body.prefill,
        language: req.lang,
      });

      void startIntakeAssessment({
        organizationId: tenantInfo.id,
        submissionId: submission.id!,
        lang: req.lang,
        liveChecks,
        form: fullForm,
        adminFallback: true,
        formId: form.id,
        formName: form.name,
        submitterName: submissionName,
        submitterEmail: resolvedEmail || "No email provided",
        entityType: form.entityType,
      });

      return res.status(201).json(
        STATUS_CODE[201]({
          message: resolvedEmail
            ? "Form submitted successfully. You will receive an email when your submission is reviewed."
            : "Form submitted successfully.",
          submissionId: submission.id,
          resubmissionToken: newResubmissionToken,
        }),
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Error in submitPublicForm: ${tenantSlug}/${formSlug}`, error);
    return res
      .status(500)
      .json(
        STATUS_CODE[500](req.t!("An error occurred while submitting the form. Please try again.")),
      );
  }
}

/**
 * Get CAPTCHA question (unauthenticated)
 */
export async function getCaptcha(_req: Request, res: Response) {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operators = ["+", "-"] as const;
  const operator = operators[Math.floor(Math.random() * operators.length)];

  let answer: number;
  let question: string;

  if (operator === "+") {
    answer = num1 + num2;
    question = `${num1} + ${num2}`;
  } else {
    const larger = Math.max(num1, num2);
    const smaller = Math.min(num1, num2);
    answer = larger - smaller;
    question = `${larger} - ${smaller}`;
  }

  const token = createSignedToken({ answer, timestamp: Date.now() });

  return res.status(200).json(STATUS_CODE[200]({ question, token }));
}

const SECOND_REVIEW_NOTE_MAX = 2000;

/**
 * Load an approved submission with an open or missed second review and check
 * the caller may act on it: a senior reviewer of the form or an Admin, never
 * the person who approved it. Sends the error response and returns null when
 * not; the caller still checks the review's state.
 */
async function loadSecondReview(req: Request, res: Response, submissionId: number) {
  const submission = await getSubmissionByIdQuery(submissionId, req.organizationId!);
  if (!submission) {
    res.status(404).json(STATUS_CODE[404](req.t!("Submission not found")));
    return null;
  }
  const form = await getIntakeFormByIdQuery(submission.formId, req.organizationId!);
  const isSenior = form?.routing?.seniorReviewerIds.includes(req.userId!) ?? false;
  if (!isSenior && !isAdminRequest(req)) {
    res
      .status(403)
      .json(
        STATUS_CODE[403](req.t!("Only an expert reviewer of this form can do a second review")),
      );
    return null;
  }
  if (submission.reviewedBy === req.userId) {
    res.status(403).json(STATUS_CODE[403](req.t!("You can't second-review your own approval")));
    return null;
  }
  return submission;
}

function secondReviewConflict(req: Request, res: Response) {
  return res
    .status(409)
    .json(STATUS_CODE[409](req.t!("This second review changed. Reload and try again.")));
}

/** The trimmed note ("" when blank), or null when it is not a string or is too long. */
function parseSecondReviewNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.trim();
  return note.length <= SECOND_REVIEW_NOTE_MAX ? note : null;
}

/**
 * A senior reviewer records the outcome of a sampled second review.
 * Changes nothing about the approval itself.
 * POST /intake/submissions/:id/second-review
 */
export async function recordSecondReview(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }
  const outcome = req.body?.outcome;
  if (outcome !== "agreed" && outcome !== "missed") {
    return res.status(400).json(STATUS_CODE[400](req.t!("Outcome must be agreed or missed")));
  }
  const rawNote = req.body?.note;
  const note = rawNote === undefined || rawNote === null ? "" : parseSecondReviewNote(rawNote);
  if (note === null || (outcome === "missed" && note === "")) {
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          outcome === "missed"
            ? req.t!("A note of 1 to 2000 characters is required when something was missed")
            : req.t!("A note can be at most 2000 characters"),
        ),
      );
  }

  try {
    const submission = await loadSecondReview(req, res, submissionId);
    if (!submission) return;
    if (submission.routing?.secondReview?.status !== "open") {
      return secondReviewConflict(req, res);
    }

    const routing = await updateSecondReviewQuery(
      submissionId,
      req.organizationId!,
      { status: "open" },
      {
        status: outcome,
        reviewedBy: req.userId!,
        reviewedAt: new Date().toISOString(),
        ...(note ? { note } : {}),
      },
    );
    if (!routing) return secondReviewConflict(req, res);

    await logSuccess({
      eventType: "Update",
      description: `submission ${submissionId} second review: ${outcome}`,
      functionName: "recordSecondReview",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](routing));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `failed to record second review: ${submissionId}`,
      functionName: "recordSecondReview",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Close a missed second review once the follow-up is done. Changes nothing
 * about the approval or the entity it created.
 * POST /intake/submissions/:id/second-review/resolve
 */
export async function resolveSecondReviewMiss(req: Request, res: Response) {
  const submissionId = parseId(req.params.id);
  if (isNaN(submissionId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid submission ID")));
  }
  const note = parseSecondReviewNote(req.body?.note);
  if (!note) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("A note of 1 to 2000 characters is required")));
  }

  try {
    const submission = await loadSecondReview(req, res, submissionId);
    if (!submission) return;
    const current = submission.routing?.secondReview;
    if (current?.status !== "missed" || current.resolvedAt) {
      return secondReviewConflict(req, res);
    }

    const routing = await updateSecondReviewQuery(
      submissionId,
      req.organizationId!,
      { status: "missed", unresolved: true },
      { resolvedBy: req.userId!, resolvedAt: new Date().toISOString(), resolutionNote: note },
    );
    if (!routing) return secondReviewConflict(req, res);

    await logSuccess({
      eventType: "Update",
      description: `submission ${submissionId} missed second review resolved`,
      functionName: "resolveSecondReviewMiss",
      fileName: "intakeForm.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](routing));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `failed to resolve second review: ${submissionId}`,
      functionName: "resolveSecondReviewMiss",
      fileName: "intakeForm.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
