import { apiServices } from "../../infrastructure/api/networkServices";
import {
  IntakeFormStatus,
  IntakeEntityType,
  IntakeSubmissionStatus,
} from "../../domain/intake/enums";
import type {
  Answers,
  ClassificationResult,
  ClassificationRole,
  Questionnaire,
} from "../../domain/types/euAiActClassification";
import type {
  FieldType,
  FormDesignSettings,
  FormRouting,
  IntakeOversight,
  SubmissionRouting,
} from "../../presentation/pages/IntakeFormBuilder/types";
import type {
  ILiveChecks,
  LiveCheckHint,
  PrefillSuggestion,
  PrefillSubmitEntry,
} from "../../domain/types/intakeLiveChecks";
import CustomAxios from "../../infrastructure/api/customAxios";
import type { Visibility } from "../utils/intakeFormLogic";
import type { ClassificationLevel, ScoreBand, ScoreSource } from "../utils/intakeScoring/scoreMath";

// Re-export enums for convenience
export { IntakeFormStatus, IntakeEntityType, IntakeSubmissionStatus };

/** EU AI Act classification returned with a submission preview (null when the form had no risk step). */
export interface EuAiActClassificationPreview {
  questionnaire: Questionnaire;
  answers: Answers;
  role: ClassificationRole | null;
  roles?: ClassificationRole[];
  current: ClassificationResult;
  changedSinceSubmission: boolean;
  submittedAt: string;
}

/**
 * Base URL for intake form API
 */
const BASE_URL = "/intake";

/**
 * Field option interface
 */
export interface FieldOption {
  label: string;
  value: string;
}

/**
 * Field validation interface
 */
export interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
}

/**
 * Form field interface
 */
export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  guidanceText?: string;
  validation?: FieldValidation;
  options?: FieldOption[];
  defaultValue?: string | number | boolean | string[];
  entityFieldMapping?: string;
  /** Calculated fields: arithmetic over earlier number/calculated fields, e.g. "{cost} * 12". */
  formula?: string;
  /** Calculated fields: decimals to round and show, 0–6, default 2. */
  decimals?: number;
  /** Calculated fields: display-only text before / after the value, at most 10 characters. */
  prefix?: string;
  suffix?: string;
  /** Show the field only when these conditions on earlier fields match. */
  visibility?: Visibility;
  /** The risk dimension this field's answer feeds. */
  riskDimension?: string;
  order: number;
}

/**
 * Form schema interface
 */
export interface FormSchema {
  version: string;
  fields: FormField[];
}

/**
 * Intake form interface
 */
export interface IntakeForm {
  id: number;
  name: string;
  description: string;
  slug: string;
  entityType: IntakeEntityType;
  schema: FormSchema;
  submitButtonText: string;
  status: IntakeFormStatus;
  ttlExpiresAt?: Date | null;
  publicId?: string | null;
  recipients?: number[];
  riskTierSystem?: string;
  riskAssessmentConfig?: Record<string, unknown> | null;
  llmKeyId?: number | null;
  suggestedQuestionsEnabled?: boolean;
  euAiActRiskStepEnabled?: boolean;
  liveChecksEnabled?: boolean;
  designSettings?: FormDesignSettings | null;
  routing?: FormRouting | null;
  /** Agreed review time in business days (1–30). */
  reviewDays?: number;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Risk dimension scores
 */
export interface RiskDimensionScore {
  key: string;
  label: string;
  name?: string;
  score: number;
  weight: number;
  signals: string[];
}

/**
 * Risk assessment result
 */
export interface RiskAssessment {
  overallScore: number;
  tier: string;
  dimensions: RiskDimensionScore[];
  llmEnhanced: boolean;
  scoredAt: string;
}

/** A stage of the AI assessment (scoring, suggestions). */
export type StageStatus = "pending" | "complete" | "ai_not_configured" | "ai_failed";

/** A reason the AI gave, with the answer it quoted. */
export interface AiReason {
  text: string;
  questionId: string;
  excerpt: string;
}

/** The rule-floored, AI-assisted score (risk_assessment version 2). */
export interface RiskAssessmentV2 {
  version: 2;
  status: StageStatus;
  notRuleChecked: boolean;
  classificationLevel: ClassificationLevel | null;
  ruleMinimum: number | null;
  ai: {
    runs: number[];
    failedRuns: number;
    validRuns: number;
    median: number | null;
    min: number | null;
    max: number | null;
    reasons: AiReason[];
  } | null;
  finalScore: number | null;
  source: ScoreSource | null;
  rulesOnly: boolean;
  overallScore: number | null;
  tier: ScoreBand | null;
  stageStartedAt: string;
  scoredAt: string | null;
  error?: string;
}

export type SuggestionLikelihood = "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
export type SuggestionSeverity = "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
export type SuggestionState = "suggested" | "accepted" | "dismissed";

/** A risk suggested for a submission; becomes a real risk only on approve. */
export interface IntakeSuggestedRisk {
  id: string;
  source: "mit" | "ibm" | "ai";
  name: string;
  description: string;
  categories: string[];
  lifecyclePhase?: string;
  likelihood: SuggestionLikelihood;
  severity: SuggestionSeverity;
  impact: string;
  mitigationPlan: string;
  implementationStrategy: string;
  /** ISO date; null means approval + 90 days. */
  deadline: string | null;
  modelRiskCategory?: string;
  modelRiskLevel?: string;
  state: SuggestionState;
  editedBy?: number;
  editedAt?: string;
  decidedBy?: number;
  decidedAt?: string;
}

export interface SuggestedRisksBlock {
  status: StageStatus;
  items: IntakeSuggestedRisk[];
  droppedCount: number;
  stageStartedAt: string;
  generatedAt: string | null;
  error?: string;
}

/** The fields a reviewer may change on a suggestion. */
export type SuggestedRiskPatch = Partial<
  Pick<
    IntakeSuggestedRisk,
    | "state"
    | "name"
    | "description"
    | "likelihood"
    | "severity"
    | "mitigationPlan"
    | "implementationStrategy"
    | "deadline"
    | "modelRiskCategory"
    | "modelRiskLevel"
  >
>;

/**
 * Risk override data
 */
export interface RiskOverride {
  tier: string;
  dimensionOverrides?: Record<string, number>;
  justification: string;
  overriddenBy: number;
  overriddenAt: string;
}

/**
 * Intake submission interface
 */
export interface IntakeSubmission {
  id: number;
  formId: number;
  formData: Record<string, unknown>;
  /** The stored answers, as the server sends them. */
  data?: Record<string, unknown>;
  submitterEmail: string;
  submitterName?: string;
  status: IntakeSubmissionStatus;
  reviewedBy?: number;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdEntityId?: number;
  createdEntityType?: string;
  resubmissionToken?: string;
  originalSubmissionId?: number | null;
  resubmissionCount: number;
  ipAddress?: string;
  riskAssessment?: RiskAssessment | RiskAssessmentV2 | null;
  riskTier?: string | null;
  riskOverride?: RiskOverride | null;
  suggestedRisks?: SuggestedRisksBlock | null;
  /** The lane decision, null until the submission is routed. */
  routing?: SubmissionRouting | null;
  /** Ids of the assigned lane's reviewers, from the list endpoint. */
  laneReviewerIds?: number[];
  /** Senior reviewers who can act on an open or unresolved-missed second review. */
  secondReviewerIds?: number[];
  /** Whether the submission's form routes by risk score. */
  routingEnabled?: boolean;
  /** "YYYY-MM-DD": when the form's agreed review time runs out; null for older submissions. */
  reviewDueDate?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Admin Form API
// ============================================================================

/**
 * Get all intake forms
 */
export async function getAllIntakeForms(
  params: {
    page?: number;
    limit?: number;
    status?: IntakeFormStatus;
    entityType?: IntakeEntityType;
  } = {},
  signal?: AbortSignal,
): Promise<{ data: IntakeForm[]; pagination?: { total: number; page: number; limit: number } }> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.limit) queryParams.append("limit", String(params.limit));
  if (params.status) queryParams.append("status", params.status);
  if (params.entityType) queryParams.append("entityType", params.entityType);

  const url = `${BASE_URL}/forms${queryParams.toString() ? `?${queryParams}` : ""}`;
  const response = await apiServices.get(url, { signal });
  return response.data as {
    data: IntakeForm[];
    pagination?: { total: number; page: number; limit: number };
  };
}

/**
 * Get a single intake form by ID
 */
export async function getIntakeForm(
  formId: number,
  signal?: AbortSignal,
): Promise<{ data: IntakeForm }> {
  const response = await apiServices.get(`${BASE_URL}/forms/${formId}`, { signal });
  return response.data as { data: IntakeForm };
}

/**
 * Create a new intake form
 */
export async function createIntakeForm(
  data: {
    name: string;
    description: string;
    slug?: string;
    entityType: IntakeEntityType;
    schema?: FormSchema;
    submitButtonText?: string;
    status?: IntakeFormStatus;
    ttlExpiresAt?: Date | null;
    recipients?: number[];
    riskTierSystem?: string;
    llmKeyId?: number | null;
    suggestedQuestionsEnabled?: boolean;
    euAiActRiskStepEnabled?: boolean;
    liveChecksEnabled?: boolean;
    designSettings?: FormDesignSettings | null;
    routing?: FormRouting | null;
    reviewDays?: number;
  },
  signal?: AbortSignal,
): Promise<{ data: IntakeForm }> {
  const response = await apiServices.post(`${BASE_URL}/forms`, data, { signal });
  return response.data as { data: IntakeForm };
}

/**
 * Update an intake form
 */
export async function updateIntakeForm(
  formId: number,
  data: {
    name?: string;
    description?: string;
    slug?: string;
    schema?: FormSchema;
    submitButtonText?: string;
    status?: IntakeFormStatus;
    ttlExpiresAt?: Date | null;
    recipients?: number[];
    riskTierSystem?: string;
    llmKeyId?: number | null;
    suggestedQuestionsEnabled?: boolean;
    euAiActRiskStepEnabled?: boolean;
    liveChecksEnabled?: boolean;
    designSettings?: FormDesignSettings | null;
    routing?: FormRouting | null;
    reviewDays?: number;
  },
  signal?: AbortSignal,
): Promise<{ data: IntakeForm }> {
  const response = await apiServices.patch(`${BASE_URL}/forms/${formId}`, data, { signal });
  return response.data as { data: IntakeForm };
}

/**
 * Delete an intake form
 */
export async function deleteIntakeForm(
  formId: number,
  signal?: AbortSignal,
): Promise<{ data: null }> {
  const response = await apiServices.delete(`${BASE_URL}/forms/${formId}`, { signal });
  return response.data as { data: null };
}

/**
 * Archive an intake form
 */
export async function archiveIntakeForm(
  formId: number,
  signal?: AbortSignal,
): Promise<{ data: IntakeForm }> {
  const response = await apiServices.post(`${BASE_URL}/forms/${formId}/archive`, undefined, {
    signal,
  });
  return response.data as { data: IntakeForm };
}

// ============================================================================
// Admin Submission API
// ============================================================================

/**
 * Get pending submissions
 */
export async function getPendingSubmissions(
  params: {
    page?: number;
    limit?: number;
    formId?: number;
    status?: string;
  } = {},
  signal?: AbortSignal,
): Promise<{
  data: IntakeSubmission[];
  pagination?: { total: number; page: number; limit: number };
}> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.limit) queryParams.append("limit", String(params.limit));
  if (params.formId) queryParams.append("formId", String(params.formId));
  if (params.status) queryParams.append("status", params.status);

  const url = `${BASE_URL}/submissions${queryParams.toString() ? `?${queryParams}` : ""}`;
  const response = await apiServices.get(url, { signal });
  return response.data as {
    data: IntakeSubmission[];
    pagination?: { total: number; page: number; limit: number };
  };
}

/** What the review modal loads for one submission. */
export interface SubmissionPreview {
  submission: IntakeSubmission;
  /** v1 keyword score or v2 AI score, as stored. */
  riskAssessment: RiskAssessment | RiskAssessmentV2 | null;
  entityPreview: Record<string, unknown>;
  form: {
    id: number;
    name: string;
    entityType: string;
    schema: FormSchema;
    riskTierSystem?: string;
    reviewDays?: number;
  };
  riskTier?: string | null;
  riskOverride?: RiskOverride | null;
  euAiActClassification?: EuAiActClassificationPreview | null;
  /** The v2 assessment, or null for v1 / none. */
  assessment?: RiskAssessmentV2 | null;
  suggestedRisks?: SuggestedRisksBlock | null;
  /** The rule minimum under the current rules. */
  ruleMinimumPreview?: number | null;
  /** The level the AI was given when the score was computed. */
  assessedLevel?: ClassificationLevel | null;
  routing?: SubmissionRouting | null;
  /** The live-check hints the submitter saw, or null for older submissions. */
  liveChecks?: ILiveChecks | null;
  routingEnabled?: boolean;
  /** "YYYY-MM-DD": when the form's agreed review time runs out; null for older submissions. */
  reviewDueDate?: string | null;
  canDecide?: boolean;
  decideBlockedReason?: string | null;
  /** Reviewers of the assigned lane. */
  laneReviewers?: Array<{ id: number; name: string }>;
  isSeniorReviewer?: boolean;
}

/**
 * Get submission preview (risk assessment + entity preview) for approval flow
 */
export async function getSubmissionPreview(
  submissionId: number,
  signal?: AbortSignal,
): Promise<{ data: SubmissionPreview }> {
  const response = await apiServices.get(`${BASE_URL}/submissions/${submissionId}/preview`, {
    signal,
  });
  return response.data as { data: SubmissionPreview };
}

/** Re-run the assessment stages that failed or stalled. */
export async function retrySubmissionAssessment(
  submissionId: number,
): Promise<{ data: { stages: string[] } }> {
  const response = await apiServices.post(
    `${BASE_URL}/submissions/${submissionId}/assessment/retry`,
    {},
  );
  return response.data as { data: { stages: string[] } };
}

/** Edit, accept, dismiss or restore one suggested risk. Returns the updated item. */
export async function updateSuggestedRisk(
  submissionId: number,
  suggestionId: string,
  patch: SuggestedRiskPatch,
): Promise<{ data: IntakeSuggestedRisk }> {
  const response = await apiServices.patch(
    `${BASE_URL}/submissions/${submissionId}/suggested-risks/${encodeURIComponent(suggestionId)}`,
    patch,
  );
  return response.data as { data: IntakeSuggestedRisk };
}

/** Accept every suggestion still in "suggested" that has a mitigation plan. */
export async function acceptAllSuggestedRisks(
  submissionId: number,
): Promise<{ data: { accepted: number; skipped: number; items: IntakeSuggestedRisk[] } }> {
  const response = await apiServices.post(
    `${BASE_URL}/submissions/${submissionId}/suggested-risks/accept-all`,
    {},
  );
  return response.data as {
    data: { accepted: number; skipped: number; items: IntakeSuggestedRisk[] };
  };
}

/**
 * Approve a submission with optional entity data overrides and risk override
 */
export async function approveSubmission(
  submissionId: number,
  data?: {
    confirmedEntityData?: Record<string, unknown>;
    riskOverride?: {
      tier: string;
      dimensionOverrides?: Record<string, number>;
      justification: string;
    };
    euAiActOverride?: { level: string; justification: string };
  },
  signal?: AbortSignal,
): Promise<{ data: { submission: IntakeSubmission; createdEntity: unknown } }> {
  const response = await apiServices.post(
    `${BASE_URL}/submissions/${submissionId}/approve`,
    data || {},
    { signal },
  );
  return response.data as { data: { submission: IntakeSubmission; createdEntity: unknown } };
}

/**
 * Reject a submission
 */
export async function rejectSubmission(
  submissionId: number,
  reason: string,
  signal?: AbortSignal,
): Promise<{ data: IntakeSubmission }> {
  const response = await apiServices.post(
    `${BASE_URL}/submissions/${submissionId}/reject`,
    { reason },
    { signal },
  );
  return response.data as { data: IntakeSubmission };
}

/**
 * Intake submission field as returned by the by-entity endpoint
 */
export interface IntakeSubmissionField {
  fieldId: string;
  label: string;
  type: string;
  value: unknown;
  options: Array<{ label: string; value: string }> | null;
  entityFieldMapping: string | null;
  isMapped: boolean;
  /** Whether the submission stored this field (a calculated field may be stored as null). */
  answered?: boolean;
  decimals?: number | null;
  prefix?: string | null;
  suffix?: string | null;
}

/**
 * Response from the by-entity intake submission endpoint
 */
export interface EntityIntakeSubmission {
  submissionId: number;
  formName: string;
  submitterName: string | null;
  submitterEmail: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  riskTier: string | null;
  /** Set for AI-scored (v2) submissions; null for older ones. */
  /** riskTier is the override's band when a reviewer set one; band is the score's own. */
  riskScore?: { finalScore: number | null; rulesOnly: boolean; band?: string | null } | null;
  /** A reviewer's band override, if any. */
  riskOverrideTier?: string | null;
  fields: IntakeSubmissionField[];
}

/**
 * Get the original intake submission data for an entity (project/model).
 * Returns null (via 404) if the entity was not created from an intake form.
 */
export async function getEntityIntakeSubmission(
  entityType: "use_case" | "model",
  entityId: number,
  signal?: AbortSignal,
): Promise<EntityIntakeSubmission | null> {
  try {
    const response = await apiServices.get(
      `${BASE_URL}/submissions/by-entity/${entityType}/${entityId}`,
      { signal },
    );
    return (response.data as { data: EntityIntakeSubmission }).data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// ============================================================================
// LLM Features API (Admin - Authenticated)
// ============================================================================

/**
 * LLM-suggested question returned by the backend
 */
export interface LLMSuggestedQuestion {
  label: string;
  fieldType: "text" | "textarea" | "select";
  category: string;
  entityFieldMapping?: string;
  guidanceText?: string;
  options?: Array<{ value: string; label: string }>;
}

/**
 * Generate LLM-suggested questions for intake form building
 */
export async function getLLMSuggestedQuestions(
  entityType: string,
  context: string,
  llmKeyId: number,
  signal?: AbortSignal,
): Promise<{ data: LLMSuggestedQuestion[] }> {
  const response = await apiServices.post(
    `${BASE_URL}/forms/suggested-questions`,
    { entityType, context, llmKeyId },
    { signal },
  );
  return response.data as { data: LLMSuggestedQuestion[] };
}

/**
 * Generate LLM guidance text for a field
 */
export async function getLLMFieldGuidance(
  fieldLabel: string,
  entityType: string,
  llmKeyId: number,
  signal?: AbortSignal,
): Promise<{ data: { guidanceText: string } }> {
  const response = await apiServices.post(
    `${BASE_URL}/forms/field-guidance`,
    { fieldLabel, entityType, llmKeyId },
    { signal },
  );
  return response.data as { data: { guidanceText: string } };
}

// ============================================================================
// Public Form API (No authentication required)
// ============================================================================

/**
 * Get CAPTCHA for public form
 */
export async function getCaptcha(): Promise<{ data: { question: string; token: string } }> {
  const response = await apiServices.get(`${BASE_URL}/public/captcha`);
  return response.data as { data: { question: string; token: string } };
}

/**
 * Get public form by slug
 */
export async function getPublicForm(
  tenantSlug: string,
  formSlug: string,
  resubmissionToken?: string,
): Promise<{
  data: {
    form: {
      id: number;
      name: string;
      description: string;
      slug: string;
      entityType: IntakeEntityType;
      schema: FormSchema;
      submitButtonText: string;
      designSettings?: FormDesignSettings | null;
    };
    organizationLogo?: string | null;
    previousData?: Record<string, unknown>;
    previousSubmitterName?: string;
    previousSubmitterEmail?: string;
    euAiActRiskStep?: { questionnaire: Questionnaire } | null;
    previousRiskAnswers?: Answers;
    liveChecks?: { enabled: boolean; aiAvailable: boolean };
  };
}> {
  const queryParams = resubmissionToken ? `?token=${resubmissionToken}` : "";
  const response = await apiServices.get(
    `${BASE_URL}/public/${tenantSlug}/${formSlug}${queryParams}`,
  );
  return response.data as {
    data: {
      form: {
        id: number;
        name: string;
        description: string;
        slug: string;
        entityType: IntakeEntityType;
        schema: FormSchema;
        submitButtonText: string;
        designSettings?: FormDesignSettings | null;
      };
      organizationLogo?: string | null;
      previousData?: Record<string, unknown>;
      previousSubmitterName?: string;
      previousSubmitterEmail?: string;
      euAiActRiskStep?: { questionnaire: Questionnaire } | null;
      previousRiskAnswers?: Answers;
      liveChecks?: { enabled: boolean; aiAvailable: boolean };
    };
  };
}

/**
 * Submit public form
 */
export async function submitPublicForm(
  tenantSlug: string,
  formSlug: string,
  data: {
    formData: Record<string, unknown>;
    submitterEmail: string;
    submitterName?: string;
    captchaToken: string;
    captchaAnswer: number;
    resubmissionToken?: string;
    euAiActRiskAnswers?: Answers;
    prefill?: Record<string, PrefillSubmitEntry>;
  },
): Promise<{
  data: {
    submissionId: number;
    resubmissionToken: string;
    message: string;
  };
}> {
  const response = await apiServices.post(`${BASE_URL}/public/${tenantSlug}/${formSlug}`, data);
  return response.data as {
    data: { submissionId: number; resubmissionToken: string; message: string };
  };
}

/**
 * Get public form by publicId (new URL format)
 */
export async function getPublicFormById(
  publicId: string,
  resubmissionToken?: string,
): Promise<{
  data: {
    form: {
      id: number;
      name: string;
      description: string;
      slug: string;
      entityType: IntakeEntityType;
      schema: FormSchema;
      submitButtonText: string;
      designSettings?: FormDesignSettings | null;
    };
    organizationLogo?: string | null;
    previousData?: Record<string, unknown>;
    previousSubmitterName?: string;
    previousSubmitterEmail?: string;
    euAiActRiskStep?: { questionnaire: Questionnaire } | null;
    previousRiskAnswers?: Answers;
    liveChecks?: { enabled: boolean; aiAvailable: boolean };
  };
}> {
  const queryParams = resubmissionToken ? `?token=${resubmissionToken}` : "";
  const response = await apiServices.get(`${BASE_URL}/public/by-id/${publicId}${queryParams}`);
  return response.data as {
    data: {
      form: {
        id: number;
        name: string;
        description: string;
        slug: string;
        entityType: IntakeEntityType;
        schema: FormSchema;
        submitButtonText: string;
        designSettings?: FormDesignSettings | null;
      };
      organizationLogo?: string | null;
      previousData?: Record<string, unknown>;
      previousSubmitterName?: string;
      previousSubmitterEmail?: string;
      euAiActRiskStep?: { questionnaire: Questionnaire } | null;
      previousRiskAnswers?: Answers;
      liveChecks?: { enabled: boolean; aiAvailable: boolean };
    };
  };
}

// ============================================================================
// Public Form API — New URL format (publicId)
// ============================================================================

/**
 * Submit public form by publicId (new URL format)
 */
export async function submitPublicFormById(
  publicId: string,
  data: {
    formData: Record<string, unknown>;
    submitterEmail: string;
    submitterName?: string;
    captchaToken: string;
    captchaAnswer: number;
    resubmissionToken?: string;
    euAiActRiskAnswers?: Answers;
    prefill?: Record<string, PrefillSubmitEntry>;
  },
): Promise<{
  data: {
    submissionId: number;
    resubmissionToken: string;
    message: string;
  };
}> {
  const response = await apiServices.post(`${BASE_URL}/public/by-id/${publicId}`, data);
  return response.data as {
    data: { submissionId: number; resubmissionToken: string; message: string };
  };
}

// ============================================================================
// Review routing
// ============================================================================

/**
 * Users who can be picked as senior or standard reviewers of a form
 */
export async function getEligibleReviewers(
  signal?: AbortSignal,
): Promise<Array<{ id: number; name: string; surname: string; email: string }>> {
  const response = await apiServices.get(`${BASE_URL}/routing/eligible-reviewers`, { signal });
  return response.data as Array<{ id: number; name: string; surname: string; email: string }>;
}

/**
 * Send a pending submission to the senior lane
 */
export async function escalateSubmission(
  submissionId: number,
  reason: string,
): Promise<{ data: SubmissionRouting }> {
  const response = await apiServices.post(`${BASE_URL}/submissions/${submissionId}/escalate`, {
    reason,
  });
  return response.data as { data: SubmissionRouting };
}

/**
 * Record the outcome of a second review on a standard-lane decision
 */
export async function recordSecondReview(
  submissionId: number,
  outcome: "agreed" | "missed",
  note?: string,
): Promise<{ data: SubmissionRouting }> {
  const response = await apiServices.post(`${BASE_URL}/submissions/${submissionId}/second-review`, {
    outcome,
    ...(note ? { note } : {}),
  });
  return response.data as { data: SubmissionRouting };
}

/**
 * Close a missed second review with a resolution note
 */
export async function resolveSecondReviewMiss(
  submissionId: number,
  note: string,
): Promise<{ data: SubmissionRouting }> {
  const response = await apiServices.post(
    `${BASE_URL}/submissions/${submissionId}/second-review/resolve`,
    { note },
  );
  return response.data as { data: SubmissionRouting };
}

/**
 * Routing and decision figures for the oversight tab
 */
export async function getIntakeOversight(
  weeks: 4 | 8 | 12,
  formId?: number,
  signal?: AbortSignal,
): Promise<{ data: IntakeOversight }> {
  const params = new URLSearchParams({ weeks: String(weeks) });
  if (formId !== undefined) params.append("formId", String(formId));
  const response = await apiServices.get(`${BASE_URL}/oversight?${params}`, { signal });
  return response.data as { data: IntakeOversight };
}

// ============================================================================
// Public form live checks and document prefill
// ============================================================================

/** Which public form a live-check call is about: by public id or by tenant and form slug. */
export type PublicFormRef = { publicId: string } | { tenantSlug: string; formSlug: string };

/** Default pause, in seconds, when a 429 carries no usable RateLimit-Reset header. */
export const DEFAULT_RATE_LIMIT_PAUSE_SECONDS = 300;

/** A failed live-check or prefill call: the HTTP status (undefined for a network error), the server's message, and for a 429 the seconds until the limit resets. */
export class LiveCheckRequestError extends Error {
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, status?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "LiveCheckRequestError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function publicBase(ref: PublicFormRef): string {
  return "publicId" in ref
    ? `${BASE_URL}/public/by-id/${encodeURIComponent(ref.publicId)}`
    : `${BASE_URL}/public/${encodeURIComponent(ref.tenantSlug)}/${encodeURIComponent(ref.formSlug)}`;
}

/**
 * The server puts 4xx messages under `data` (repo response helpers) and the
 * prefill 502 message under `error`; accept either, plus `message`.
 */
function serverMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const { data, error, message } = body as Record<string, unknown>;
    if (typeof data === "string" && data) return data;
    if (typeof error === "string" && error) return error;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function toRequestError(error: unknown): LiveCheckRequestError {
  const err = error as {
    message?: string;
    response?: { status?: number; data?: unknown; headers?: Record<string, unknown> };
  };
  const status = err?.response?.status;
  let retryAfter: number | undefined;
  if (status === 429) {
    const seconds = Number(err.response?.headers?.["ratelimit-reset"]);
    retryAfter =
      Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds)
        : DEFAULT_RATE_LIMIT_PAUSE_SECONDS;
  }
  return new LiveCheckRequestError(
    serverMessage(err?.response?.data, err?.message ?? "Request failed"),
    status,
    retryAfter,
  );
}

/** AI hints for the answers so far. Throws LiveCheckRequestError (429 carries retryAfterSeconds). */
export async function postLiveChecks(
  ref: PublicFormRef,
  data: Record<string, unknown>,
  language: string,
  signal?: AbortSignal,
): Promise<{ aiAvailable: boolean; hints: LiveCheckHint[]; error?: string }> {
  try {
    const response = await CustomAxios.post(`${publicBase(ref)}/live-checks`, { data, language }, {
      signal,
      suppressGlobalErrorToast: true,
    } as Record<string, unknown>);
    const body = (response.data?.data ?? {}) as {
      aiAvailable?: boolean;
      hints?: LiveCheckHint[];
      error?: string;
    };
    return {
      aiAvailable: body.aiAvailable === true,
      hints: Array.isArray(body.hints) ? body.hints : [],
      ...(typeof body.error === "string" ? { error: body.error } : {}),
    };
  } catch (error) {
    throw toRequestError(error);
  }
}

/** Suggested answers read from an uploaded vendor document (PDF or DOCX). */
export async function postPrefill(
  ref: PublicFormRef,
  file: File,
  data: Record<string, unknown>,
  language: string,
  signal?: AbortSignal,
): Promise<{ fileName: string; suggestions: PrefillSuggestion[] }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("data", JSON.stringify(data));
  formData.append("language", language);
  try {
    const response = await CustomAxios.post(`${publicBase(ref)}/prefill`, formData, {
      signal,
      headers: { "Content-Type": "multipart/form-data" },
      suppressGlobalErrorToast: true,
    } as Record<string, unknown>);
    const body = (response.data?.data ?? {}) as {
      fileName?: string;
      suggestions?: PrefillSuggestion[];
    };
    return {
      fileName: typeof body.fileName === "string" ? body.fileName : file.name,
      suggestions: Array.isArray(body.suggestions) ? body.suggestions : [],
    };
  } catch (error) {
    throw toRequestError(error);
  }
}
