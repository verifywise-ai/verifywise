import { IntakeFormStatus } from "../enums/intake-form-status.enum";
import { IntakeEntityType } from "../enums/intake-entity-type.enum";

/**
 * Per-form review routing settings (intake_forms.routing JSONB)
 */
export interface IFormRouting {
  enabled: boolean;
  seniorReviewerIds: number[];
  standardReviewerIds: number[];
  threshold: number;
  closeCallMargin: number;
  secondReviewRate: number;
}

/**
 * Field type options for intake form fields
 */
export type IntakeFieldType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox"
  | "date"
  | "email"
  | "url"
  | "number"
  | "calculated";

/**
 * Individual field definition in the form schema
 */
export interface IIntakeFormField {
  id: string;
  type: IntakeFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  order: number;
  entityField?: string; // Maps to entity field (e.g., "model.provider")
  entityFieldMapping?: string; // Direct entity field name (e.g., "project_title")
  guidanceText?: string; // Tooltip text explaining why this field matters
  options?: Array<{ value: string; label: string }>; // For select/multiselect
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
  /** Calculated fields: arithmetic over earlier number/calculated fields, e.g. "{cost} * 12". */
  formula?: string;
  /** Calculated fields: decimals to round and show, 0–6, default 2. */
  decimals?: number;
  /** Calculated fields: display-only text before / after the value, at most 10 characters. */
  prefix?: string;
  suffix?: string;
  /** Show the field only when these conditions on earlier fields match. */
  visibility?: {
    match: "all" | "any";
    conditions: Array<{ fieldId: string; operator: string; value?: string | number | string[] }>;
  };
  /** The risk dimension this field's answer feeds (see intakeRiskScoring.service.ts). */
  riskDimension?: string;
}

/**
 * Form schema structure stored as JSONB
 */
export interface IIntakeFormSchema {
  version: string;
  fields: IIntakeFormField[];
}

/**
 * Intake form entity
 */
export interface IIntakeForm {
  id: number;
  name: string;
  description: string;
  slug: string;
  entityType: IntakeEntityType;
  schema: IIntakeFormSchema;
  submitButtonText: string;
  status: IntakeFormStatus;
  ttlExpiresAt: Date | null;
  publicId: string | null;
  recipients: number[];
  riskTierSystem: string;
  riskAssessmentConfig: Record<string, unknown> | null;
  llmKeyId: number | null;
  suggestedQuestionsEnabled: boolean;
  euAiActRiskStepEnabled: boolean;
  designSettings: Record<string, unknown> | null;
  routing: IFormRouting | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new intake form
 */
export interface ICreateIntakeFormInput {
  name: string;
  description: string;
  slug?: string; // Auto-generated from name if not provided
  entityType: IntakeEntityType;
  schema?: IIntakeFormSchema;
  submitButtonText?: string;
  status?: IntakeFormStatus;
  ttlExpiresAt?: Date | null;
  recipients?: number[];
  riskTierSystem?: string;
  riskAssessmentConfig?: Record<string, unknown>;
  llmKeyId?: number | null;
  suggestedQuestionsEnabled?: boolean;
  euAiActRiskStepEnabled?: boolean;
  designSettings?: Record<string, unknown> | null;
  routing?: IFormRouting | null;
  createdBy: number;
}

/**
 * Input for updating an intake form
 */
export interface IUpdateIntakeFormInput {
  name?: string;
  description?: string;
  slug?: string;
  entityType?: IntakeEntityType;
  schema?: IIntakeFormSchema;
  submitButtonText?: string;
  status?: IntakeFormStatus;
  ttlExpiresAt?: Date | null;
  recipients?: number[];
  riskTierSystem?: string;
  riskAssessmentConfig?: Record<string, unknown>;
  llmKeyId?: number | null;
  suggestedQuestionsEnabled?: boolean;
  euAiActRiskStepEnabled?: boolean;
  designSettings?: Record<string, unknown> | null;
  routing?: IFormRouting | null;
}

/**
 * Public form data (returned to unauthenticated users)
 */
export interface IPublicIntakeForm {
  id: number;
  name: string;
  description: string;
  slug: string;
  entityType: IntakeEntityType;
  schema: IIntakeFormSchema;
  submitButtonText: string;
  publicId: string | null;
  euAiActRiskStepEnabled: boolean;
  designSettings: Record<string, unknown> | null;
}
