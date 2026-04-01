import { apiServices } from "../../infrastructure/api/networkServices";
import {
  IntakeFormStatus,
  IntakeEntityType,
  IntakeSubmissionStatus,
} from "../../domain/intake/enums";
import type { FieldType, FormDesignSettings } from "../../presentation/pages/IntakeFormBuilder/types";

// Re-export enums for convenience
export { IntakeFormStatus, IntakeEntityType, IntakeSubmissionStatus };

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
  designSettings?: FormDesignSettings | null;
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
  riskAssessment?: RiskAssessment | null;
  riskTier?: string | null;
  riskOverride?: RiskOverride | null;
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
  signal?: AbortSignal
): Promise<{ data: IntakeForm[]; pagination?: { total: number; page: number; limit: number } }> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.limit) queryParams.append("limit", String(params.limit));
  if (params.status) queryParams.append("status", params.status);
  if (params.entityType) queryParams.append("entityType", params.entityType);

  const url = `${BASE_URL}/forms${queryParams.toString() ? `?${queryParams}` : ""}`;
  const response = await apiServices.get(url, { signal });
  return response.data as { data: IntakeForm[]; pagination?: { total: number; page: number; limit: number } };
}

/**
 * Get a single intake form by ID
 */
export async function getIntakeForm(
  formId: number,
  signal?: AbortSignal
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
    designSettings?: FormDesignSettings | null;
  },
  signal?: AbortSignal
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
    designSettings?: FormDesignSettings | null;
  },
  signal?: AbortSignal
): Promise<{ data: IntakeForm }> {
  const response = await apiServices.patch(`${BASE_URL}/forms/${formId}`, data, { signal });
  return response.data as { data: IntakeForm };
}

/**
 * Delete an intake form
 */
export async function deleteIntakeForm(
  formId: number,
  signal?: AbortSignal
): Promise<{ data: null }> {
  const response = await apiServices.delete(`${BASE_URL}/forms/${formId}`, { signal });
  return response.data as { data: null };
}

/**
 * Archive an intake form
 */
export async function archiveIntakeForm(
  formId: number,
  signal?: AbortSignal
): Promise<{ data: IntakeForm }> {
  const response = await apiServices.post(`${BASE_URL}/forms/${formId}/archive`, undefined, { signal });
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
  signal?: AbortSignal
): Promise<{ data: IntakeSubmission[]; pagination?: { total: number; page: number; limit: number } }> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.limit) queryParams.append("limit", String(params.limit));
  if (params.formId) queryParams.append("formId", String(params.formId));
  if (params.status) queryParams.append("status", params.status);

  const url = `${BASE_URL}/submissions${queryParams.toString() ? `?${queryParams}` : ""}`;
  const response = await apiServices.get(url, { signal });
  return response.data as { data: IntakeSubmission[]; pagination?: { total: number; page: number; limit: number } };
}

/**
 * Get submission preview (risk assessment + entity preview) for approval flow
 */
export async function getSubmissionPreview(
  submissionId: number,
  signal?: AbortSignal
): Promise<{
  data: {
    submission: IntakeSubmission;
    riskAssessment: RiskAssessment | null;
    entityPreview: Record<string, unknown>;
    form: {
      id: number;
      name: string;
      entityType: string;
      schema: FormSchema;
      riskTierSystem?: string;
    };
    riskTier?: string | null;
    riskOverride?: RiskOverride | null;
  };
}> {
  const response = await apiServices.get(`${BASE_URL}/submissions/${submissionId}/preview`, { signal });
  return response.data as {
    data: {
      submission: IntakeSubmission;
      riskAssessment: RiskAssessment | null;
      entityPreview: Record<string, unknown>;
      form: {
        id: number;
        name: string;
        entityType: string;
        schema: FormSchema;
        riskTierSystem?: string;
      };
      riskTier?: string | null;
      riskOverride?: RiskOverride | null;
    };
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
  },
  signal?: AbortSignal
): Promise<{ data: { submission: IntakeSubmission; createdEntity: unknown } }> {
  const response = await apiServices.post(
    `${BASE_URL}/submissions/${submissionId}/approve`,
    data || {},
    { signal }
  );
  return response.data as { data: { submission: IntakeSubmission; createdEntity: unknown } };
}

/**
 * Reject a submission
 */
export async function rejectSubmission(
  submissionId: number,
  reason: string,
  signal?: AbortSignal
): Promise<{ data: IntakeSubmission }> {
  const response = await apiServices.post(
    `${BASE_URL}/submissions/${submissionId}/reject`,
    { reason },
    { signal }
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
  fields: IntakeSubmissionField[];
}

/**
 * Get the original intake submission data for an entity (project/model).
 * Returns null (via 404) if the entity was not created from an intake form.
 */
export async function getEntityIntakeSubmission(
  entityType: "use_case" | "model",
  entityId: number,
  signal?: AbortSignal
): Promise<EntityIntakeSubmission | null> {
  try {
    const response = await apiServices.get(
      `${BASE_URL}/submissions/by-entity/${entityType}/${entityId}`,
      { signal }
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
  signal?: AbortSignal
): Promise<{ data: LLMSuggestedQuestion[] }> {
  const response = await apiServices.post(
    `${BASE_URL}/forms/suggested-questions`,
    { entityType, context, llmKeyId },
    { signal }
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
  signal?: AbortSignal
): Promise<{ data: { guidanceText: string } }> {
  const response = await apiServices.post(
    `${BASE_URL}/forms/field-guidance`,
    { fieldLabel, entityType, llmKeyId },
    { signal }
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
  resubmissionToken?: string
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
  };
}> {
  const queryParams = resubmissionToken ? `?token=${resubmissionToken}` : "";
  const response = await apiServices.get(`${BASE_URL}/public/${tenantSlug}/${formSlug}${queryParams}`);
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
  }
): Promise<{
  data: {
    submissionId: number;
    resubmissionToken: string;
    message: string;
  };
}> {
  const response = await apiServices.post(`${BASE_URL}/public/${tenantSlug}/${formSlug}`, data);
  return response.data as { data: { submissionId: number; resubmissionToken: string; message: string } };
}

/**
 * Get public form by publicId (new URL format)
 */
export async function getPublicFormById(
  publicId: string,
  resubmissionToken?: string
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
  }
): Promise<{
  data: {
    submissionId: number;
    resubmissionToken: string;
    message: string;
  };
}> {
  const response = await apiServices.post(`${BASE_URL}/public/by-id/${publicId}`, data);
  return response.data as { data: { submissionId: number; resubmissionToken: string; message: string } };
}
