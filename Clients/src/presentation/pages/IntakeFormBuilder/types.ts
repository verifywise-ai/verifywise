import type { FormRouting } from "../../../domain/types/intakeRouting";
import { IntakeFormStatus, IntakeEntityType } from "../../../domain/intake/enums";
import { brand } from "../../themes/palette";
import { GEOGRAPHY_ITEMS } from "../../../application/constants/geography";
import {
  RISK_DIMENSIONS,
  sortFields,
  type RiskDimensionKey,
  type Visibility,
} from "../../../application/utils/intakeFormLogic";

/**
 * Field types supported in the intake form builder
 */
export type FieldType =
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
 * Validation rules for form fields
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
 * Option for select/multiselect fields
 */
export interface FieldOption {
  label: string;
  value: string;
}

/**
 * Form field definition
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
 * Form schema structure
 */
export interface FormSchema {
  version: string;
  fields: FormField[];
}

/**
 * Design / styling settings for intake forms
 */
export interface FormDesignSettings {
  format: "narrow" | "wide";
  alignment: "left" | "center" | "right";
  colorTheme: string;
  backgroundColor: string;
  logoUrl: string;
  fontFamily: string;
  collectContactInfo: boolean;
}

/**
 * Default design settings
 */
export const DEFAULT_DESIGN_SETTINGS: FormDesignSettings = {
  format: "narrow",
  alignment: "center",
  colorTheme: `${brand.primary}`,
  backgroundColor: "#fafafa",
  logoUrl: "",
  fontFamily: "Inter",
  collectContactInfo: true,
};

// Routing types live in the domain layer; re-exported for existing imports.
export type {
  FormRouting,
  ReviewLane,
  RoutingReason,
  SecondReview,
  SubmissionRouting,
} from "../../../domain/types/intakeRouting";
export type NeedsAttentionKind =
  | "second_review_open"
  | "second_review_missed"
  | "prohibited_pending"
  | "pending_old"
  | "lane_empty";

/** Figures behind the oversight tab. */
export interface IntakeOversight {
  weeks: number;
  totals: {
    submissions: number;
    senior: number;
    standard: number;
    closeCalls: number;
    notRouted: number;
    routingOff: number;
  };
  medianDecisionHours: { all: number | null; senior: number | null; standard: number | null };
  redlines: { prohibited: number; highRisk: number };
  secondReviews: { completed: number; missed: number; open: number };
  byWeek: Array<{
    weekStart: string;
    senior: number;
    closeCall: number;
    standard: number;
    notRouted: number;
    routingOff: number;
  }>;
  reviewers: Array<{
    userId: number;
    name: string;
    decisions: number;
    bandChanged: number;
    medianDecisionHours: number | null;
    check: boolean;
  }>;
  bandKept: { kept: number; decided: number; seniorKept: number; seniorDecided: number };
  suggestions: { accepted: number; suggested: number };
  needsAttention: Array<{
    kind: NeedsAttentionKind;
    submissionId: number | null;
    formId: number;
    title: string;
    at: string;
  }>;
}

/**
 * Intake form data structure
 */
export interface IntakeForm {
  id?: number;
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
  createdBy?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Form creation input
 */
export interface CreateIntakeFormInput {
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
}

/**
 * Form update input
 */
export interface UpdateIntakeFormInput {
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
}

/**
 * Field palette item for drag-and-drop
 */
export interface PaletteItem {
  type: FieldType;
  label: string;
  icon: string;
  description: string;
  defaultConfig: Partial<FormField>;
}

/**
 * Entity field mapping definitions for different entity types
 */
export interface EntityFieldMapping {
  field: string;
  label: string;
  description: string;
  requiredFieldType: FieldType[];
  /** Whether this field is NOT NULL in the database (required for entity creation) */
  entityRequired?: boolean;
}

/**
 * Entity field mappings by entity type
 */
export const ENTITY_FIELD_MAPPINGS: Record<IntakeEntityType, EntityFieldMapping[]> = {
  [IntakeEntityType.MODEL]: [
    {
      field: "name",
      label: "Model name",
      description: "Name of the AI model",
      requiredFieldType: ["text"],
      entityRequired: true,
    },
    {
      field: "description",
      label: "Description",
      description: "Model description",
      requiredFieldType: ["textarea", "text"],
    },
    {
      field: "modelVersion",
      label: "Model version",
      description: "Version of the model",
      requiredFieldType: ["text"],
    },
    {
      field: "provider",
      label: "Provider",
      description: "Model provider/vendor",
      requiredFieldType: ["text", "select"],
    },
    {
      field: "modelType",
      label: "Model type",
      description: "Type of AI model",
      requiredFieldType: ["text", "select"],
    },
    {
      field: "intendedUse",
      label: "Intended use",
      description: "Intended use of the model",
      requiredFieldType: ["textarea", "text"],
    },
  ],
  [IntakeEntityType.USE_CASE]: [
    {
      field: "project_title",
      label: "Project title",
      description: "Title of the use case/project",
      requiredFieldType: ["text"],
      entityRequired: true,
    },
    {
      field: "goal",
      label: "Goal",
      description: "Goal of the project",
      requiredFieldType: ["text", "textarea"],
      entityRequired: true,
    },
    {
      field: "start_date",
      label: "Start date",
      description: "Project start date",
      requiredFieldType: ["date"],
    },
    {
      field: "ai_risk_classification",
      label: "AI risk classification",
      description: "Risk classification",
      requiredFieldType: ["select"],
    },
    {
      field: "type_of_high_risk_role",
      label: "High-risk roles",
      description: "Provider, Deployer or both",
      requiredFieldType: ["multiselect", "select"],
    },
    {
      field: "geography",
      label: "Geography",
      description: "Geographic scope of the use case",
      requiredFieldType: ["select"],
    },
  ],
  // AI apps (#5193): what approval copies onto the new AI app.
  [IntakeEntityType.AI_APP]: [
    {
      field: "name",
      label: "AI app name",
      description: "Name of the AI app",
      requiredFieldType: ["text"],
      entityRequired: true,
    },
    {
      field: "description",
      label: "Description",
      description: "What the AI app is used for",
      requiredFieldType: ["textarea", "text"],
    },
    {
      field: "departments",
      label: "Departments",
      description: "Teams that use the AI app (a multi-select, or text separated by commas)",
      requiredFieldType: ["multiselect", "text"],
    },
  ],
};

/**
 * Default palette items for drag-and-drop
 */
export const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "text",
    label: "Short text",
    icon: "TextFields",
    description: "Single line text input",
    defaultConfig: {
      placeholder: "Enter text...",
      validation: { maxLength: 255 },
    },
  },
  {
    type: "textarea",
    label: "Long text",
    icon: "Notes",
    description: "Multi-line text area",
    defaultConfig: {
      placeholder: "Enter detailed text...",
      validation: { maxLength: 2000 },
    },
  },
  {
    type: "email",
    label: "Email",
    icon: "Email",
    description: "Email address input",
    defaultConfig: {
      placeholder: "email@example.com",
      validation: {
        pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
        patternMessage: "Please enter a valid email address",
      },
    },
  },
  {
    type: "url",
    label: "URL",
    icon: "Link",
    description: "Web address input",
    defaultConfig: {
      placeholder: "https://example.com",
    },
  },
  {
    type: "number",
    label: "Number",
    icon: "Numbers",
    description: "Numeric input",
    defaultConfig: {
      placeholder: "0",
    },
  },
  {
    type: "date",
    label: "Date",
    icon: "CalendarMonth",
    description: "Date picker",
    defaultConfig: {},
  },
  {
    type: "select",
    label: "Dropdown",
    icon: "ArrowDropDownCircle",
    description: "Single selection dropdown",
    defaultConfig: {
      options: [
        { label: "Option 1", value: "option1" },
        { label: "Option 2", value: "option2" },
      ],
    },
  },
  {
    type: "multiselect",
    label: "Multi-select",
    icon: "Checklist",
    description: "Multiple selection dropdown",
    defaultConfig: {
      options: [
        { label: "Option 1", value: "option1" },
        { label: "Option 2", value: "option2" },
      ],
    },
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: "CheckBox",
    description: "Single checkbox toggle",
    defaultConfig: {
      defaultValue: false,
    },
  },
];

/** Field types kept out of the main palette list (few forms need them). */
export const ADVANCED_PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "calculated",
    label: "Calculated",
    icon: "Calculate",
    description: "Read-only result of a formula",
    defaultConfig: { formula: "", decimals: 2 },
  },
];

const RISK_DIMENSION_LABELS: Record<RiskDimensionKey, string> = {
  data_sensitivity: "Data sensitivity",
  autonomy_level: "Autonomy level",
  impact_scope: "Impact scope",
  transparency: "Transparency",
  human_oversight: "Human oversight",
  domain_criticality: "Domain criticality",
};

/** Risk dimensions a field can feed, in the order the editor lists them. */
export const RISK_DIMENSION_OPTIONS: Array<{ _id: string; name: string }> = RISK_DIMENSIONS.map(
  (key) => ({ _id: key, name: RISK_DIMENSION_LABELS[key] }),
);

/**
 * Fields in form order with `order` matching their position. The canvas
 * renders array order while rules, formulas and the public form sort by
 * `order`, so the two must never disagree.
 */
export function withSequentialOrder(fields: FormField[]): FormField[] {
  return sortFields(fields).map((field, order) =>
    field.order === order ? field : { ...field, order },
  );
}

/**
 * Generate unique field ID
 */
export function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Create a new form field from palette item
 */
export function createFieldFromPalette(paletteItem: PaletteItem, order: number): FormField {
  return {
    id: generateFieldId(),
    type: paletteItem.type,
    label: paletteItem.label,
    order,
    ...paletteItem.defaultConfig,
  };
}

/**
 * Create a form field from an entity field mapping definition
 */
export function createFieldFromMapping(mapping: EntityFieldMapping, order: number): FormField {
  const type = mapping.requiredFieldType[0];
  return {
    id: generateFieldId(),
    type,
    label: mapping.label,
    placeholder: mapping.description,
    validation: mapping.entityRequired ? { required: true } : undefined,
    entityFieldMapping: mapping.field,
    order,
  };
}

/**
 * Default use case fields pre-populated for new forms
 */
export const DEFAULT_USE_CASE_FIELDS: FormField[] = [
  {
    id: generateFieldId(),
    type: "text",
    label: "Use case name",
    placeholder: "Enter the name of your AI use case",
    guidanceText: "A clear name helps reviewers quickly understand the scope of this AI system.",
    validation: { required: true, maxLength: 255 },
    entityFieldMapping: "project_title",
    order: 0,
  },
  {
    id: generateFieldId(),
    type: "textarea",
    label: "What does this AI system do?",
    placeholder: "Describe the core functionality and purpose",
    guidanceText:
      "Understanding what the system does is critical for risk assessment and compliance review.",
    validation: { required: true, maxLength: 2000 },
    entityFieldMapping: "description",
    order: 1,
  },
  {
    id: generateFieldId(),
    type: "textarea",
    label: "What business goal does this serve?",
    placeholder: "Explain the business objective this AI system addresses",
    guidanceText: "Connecting AI systems to business goals helps prioritize governance efforts.",
    validation: { maxLength: 2000 },
    entityFieldMapping: "goal",
    order: 2,
  },
  {
    id: generateFieldId(),
    type: "select",
    label: "Geography",
    guidanceText: "The geographic scope affects which regulations apply to this use case.",
    options: GEOGRAPHY_ITEMS.map(({ _id, name }) => ({ label: name, value: String(_id) })),
    entityFieldMapping: "geography",
    order: 3,
  },
  {
    id: generateFieldId(),
    type: "select",
    label: "Does this system make autonomous decisions?",
    guidanceText:
      "Autonomous decision-making increases risk and may require human oversight measures.",
    options: [
      { label: "No — always requires human approval", value: "no" },
      { label: "Partially — recommends but human decides", value: "partial" },
      { label: "Yes — makes decisions without human review", value: "yes" },
    ],
    order: 4,
  },
  {
    id: generateFieldId(),
    type: "select",
    label: "What type of personal data does this system process?",
    guidanceText: "Personal data processing determines GDPR and privacy compliance requirements.",
    options: [
      { label: "No personal data", value: "none" },
      { label: "Basic personal data (name, email)", value: "basic" },
      { label: "Sensitive personal data (health, biometric)", value: "sensitive" },
      { label: "Special category data (racial, political)", value: "special" },
    ],
    order: 5,
  },
];

/**
 * Default model inventory fields pre-populated for new forms
 */
export const DEFAULT_AI_APP_FIELDS: FormField[] = [
  {
    id: generateFieldId(),
    type: "text",
    label: "AI app name",
    placeholder: "Enter the name of the AI app",
    guidanceText: "Use the product name people know it by, so reviewers can find it.",
    validation: { required: true, maxLength: 255 },
    entityFieldMapping: "name",
    order: 0,
  },
  {
    id: generateFieldId(),
    type: "textarea",
    label: "Description",
    placeholder: "Describe what you want to use the AI app for",
    guidanceText: "Include the task, the data it will see and who will use it.",
    validation: { maxLength: 2000 },
    entityFieldMapping: "description",
    order: 1,
  },
  {
    id: generateFieldId(),
    type: "text",
    label: "Departments",
    placeholder: "e.g. Sales, Support",
    guidanceText: "Separate several departments with commas.",
    entityFieldMapping: "departments",
    order: 2,
  },
];

export const DEFAULT_MODEL_FIELDS: FormField[] = [
  {
    id: generateFieldId(),
    type: "text",
    label: "Model name",
    placeholder: "Enter the name of your AI model",
    guidanceText:
      "A clear name helps reviewers identify and track this model across the organization.",
    validation: { required: true, maxLength: 255 },
    entityFieldMapping: "name",
    order: 0,
  },
  {
    id: generateFieldId(),
    type: "textarea",
    label: "Description",
    placeholder: "Describe what this model does and how it works",
    guidanceText: "Include the model's purpose, training approach, and key capabilities.",
    validation: { maxLength: 2000 },
    entityFieldMapping: "description",
    order: 1,
  },
  {
    id: generateFieldId(),
    type: "text",
    label: "Model version",
    placeholder: "e.g. v1.0, 2024-Q1",
    guidanceText: "Version tracking is important for audit trails and rollback planning.",
    entityFieldMapping: "modelVersion",
    order: 2,
  },
  {
    id: generateFieldId(),
    type: "text",
    label: "Provider",
    placeholder: "e.g. OpenAI, Anthropic, in-house",
    guidanceText: "Knowing the provider helps assess supply chain risk and vendor dependencies.",
    entityFieldMapping: "provider",
    order: 3,
  },
  {
    id: generateFieldId(),
    type: "text",
    label: "Model type",
    placeholder: "e.g. LLM, classification, regression, computer vision",
    guidanceText: "The model type affects which governance controls and testing procedures apply.",
    entityFieldMapping: "modelType",
    order: 4,
  },
  {
    id: generateFieldId(),
    type: "textarea",
    label: "Intended use",
    placeholder: "Describe how this model will be used in production",
    guidanceText:
      "Intended use determines whether the model falls under high-risk categories in the EU AI Act.",
    validation: { maxLength: 2000 },
    entityFieldMapping: "intendedUse",
    order: 5,
  },
];

/**
 * Mapping coverage analysis result
 */
export interface MappingCoverage {
  /** Required entity fields that have no mapped form field */
  missingRequired: EntityFieldMapping[];
  /** Optional entity fields that have no mapped form field */
  missingOptional: EntityFieldMapping[];
  /** Fields where the form field type doesn't match the entity field's allowed types */
  typeMismatches: Array<{
    formField: FormField;
    entityMapping: EntityFieldMapping;
  }>;
}

/** Entity fields the EU AI Act risk step fills in, so the builder does not offer them. */
const RISK_STEP_SET_FIELDS = new Set(["ai_risk_classification", "type_of_high_risk_role"]);

/** True when the EU AI Act risk step sets `mapping`, so a field must not also map to it. */
export function isRiskStepSetField(mapping: string | undefined): boolean {
  return mapping !== undefined && RISK_STEP_SET_FIELDS.has(mapping);
}

/**
 * Entity mappings the field editor must not offer for `selectedFieldId`:
 * those taken by other fields, plus the ones the EU AI Act risk step sets
 * while it is on. The editor still shows a field's own current mapping.
 */
export function usedEntityMappingsFor(
  fields: FormField[],
  selectedFieldId: string,
  riskStepEnabled: boolean | undefined,
): string[] {
  return [
    ...fields
      .filter((f) => f.id !== selectedFieldId && f.entityFieldMapping)
      .map((f) => f.entityFieldMapping!),
    ...(riskStepEnabled ? [...RISK_STEP_SET_FIELDS] : []),
  ];
}

/**
 * Analyze mapping coverage for a form's fields against the entity field definitions
 */
export function analyzeMappingCoverage(
  fields: FormField[],
  entityType: IntakeEntityType,
  options: { riskStepEnabled?: boolean } = {},
): MappingCoverage {
  const entityMappings = ENTITY_FIELD_MAPPINGS[entityType] || [];
  const mappedKeys = new Set(
    fields.filter((f) => f.entityFieldMapping).map((f) => f.entityFieldMapping!),
  );

  const missingRequired: EntityFieldMapping[] = [];
  const missingOptional: EntityFieldMapping[] = [];

  for (const mapping of entityMappings) {
    // With the EU AI Act risk step on, the server sets ai_risk_classification
    // itself and the step also sets the role, so neither is reported as
    // missing. Type checks below still cover a field already mapped to them.
    if (options.riskStepEnabled && RISK_STEP_SET_FIELDS.has(mapping.field)) continue;
    if (!mappedKeys.has(mapping.field)) {
      if (mapping.entityRequired) {
        missingRequired.push(mapping);
      } else {
        missingOptional.push(mapping);
      }
    }
  }

  const typeMismatches: MappingCoverage["typeMismatches"] = [];
  for (const field of fields) {
    if (!field.entityFieldMapping) continue;
    const mapping = entityMappings.find((m) => m.field === field.entityFieldMapping);
    if (mapping && !mapping.requiredFieldType.includes(field.type)) {
      typeMismatches.push({ formField: field, entityMapping: mapping });
    }
  }

  return { missingRequired, missingOptional, typeMismatches };
}

/**
 * Hardcoded suggested questions grouped by category
 */
export interface SuggestedQuestion {
  label: string;
  fieldType: FieldType;
  category: string;
  guidanceText?: string;
  options?: FieldOption[];
}

export const HARDCODED_SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  // Risks
  {
    label: "What happens if this AI system fails?",
    fieldType: "textarea",
    category: "Risks",
    guidanceText: "Understanding failure modes helps plan mitigation strategies.",
  },
  {
    label: "How many people are affected by this system's decisions?",
    fieldType: "select",
    category: "Risks",
    guidanceText: "Impact scope is a key factor in risk assessment.",
    options: [
      { label: "Less than 100", value: "small" },
      { label: "100–10,000", value: "medium" },
      { label: "More than 10,000", value: "large" },
    ],
  },
  // Compliance
  {
    label: "Has a data protection impact assessment been conducted?",
    fieldType: "select",
    category: "Compliance",
    guidanceText: "DPIAs are required for high-risk data processing under GDPR.",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
      { label: "In progress", value: "in_progress" },
    ],
  },
  {
    label: "Which regulations apply to this use case?",
    fieldType: "textarea",
    category: "Compliance",
    guidanceText: "Identifying applicable regulations early prevents compliance gaps.",
  },
  // Operations
  {
    label: "Who is responsible for monitoring this system in production?",
    fieldType: "text",
    category: "Operations",
    guidanceText: "Clear ownership ensures ongoing governance after deployment.",
  },
  {
    label: "How frequently will this system be retrained or updated?",
    fieldType: "select",
    category: "Operations",
    guidanceText: "Retraining frequency affects model drift and ongoing risk.",
    options: [
      { label: "Never", value: "never" },
      { label: "Quarterly", value: "quarterly" },
      { label: "Monthly", value: "monthly" },
      { label: "Continuously", value: "continuous" },
    ],
  },
  // Vendors
  {
    label: "Are any third-party AI vendors or APIs used?",
    fieldType: "textarea",
    category: "Vendors",
    guidanceText: "Third-party dependencies create supply chain risks that need governance.",
  },
  {
    label: "Where is the AI model hosted?",
    fieldType: "select",
    category: "Vendors",
    guidanceText: "Hosting location affects data sovereignty and regulatory compliance.",
    options: [
      { label: "On-premises", value: "on_prem" },
      { label: "Cloud (same region)", value: "cloud_local" },
      { label: "Cloud (different region)", value: "cloud_remote" },
    ],
  },
  // Models
  {
    label: "Can the AI system explain its decisions?",
    fieldType: "select",
    category: "Models",
    guidanceText: "Explainability is required under EU AI Act for high-risk systems.",
    options: [
      { label: "Yes — fully explainable", value: "full" },
      { label: "Partially", value: "partial" },
      { label: "No — black box", value: "none" },
    ],
  },
  {
    label: "What training data was used?",
    fieldType: "textarea",
    category: "Models",
    guidanceText: "Training data quality and provenance are key governance concerns.",
  },
];

/**
 * Default empty form — defaults to USE_CASE with pre-populated fields.
 * Pass entityType to create a form for a specific entity type.
 */
export function createEmptyForm(entityType?: IntakeEntityType): IntakeForm {
  const type = entityType ?? IntakeEntityType.USE_CASE;
  return {
    name: "",
    description: "",
    slug: "",
    entityType: type,
    schema: {
      version: "1.0",
      fields:
        type === IntakeEntityType.USE_CASE
          ? DEFAULT_USE_CASE_FIELDS.map((f, i) => ({ ...f, id: generateFieldId(), order: i }))
          : type === IntakeEntityType.MODEL
            ? DEFAULT_MODEL_FIELDS.map((f, i) => ({ ...f, id: generateFieldId(), order: i }))
            : type === IntakeEntityType.AI_APP
              ? DEFAULT_AI_APP_FIELDS.map((f, i) => ({ ...f, id: generateFieldId(), order: i }))
              : [],
    },
    submitButtonText: "Submit",
    status: IntakeFormStatus.DRAFT,
    ttlExpiresAt: null,
    recipients: [],
    riskTierSystem: "eu_ai_act",
    llmKeyId: null,
    suggestedQuestionsEnabled: false,
    // New use case forms start with the EU AI Act step on; it replaces the
    // old risk level and role questions of the template.
    euAiActRiskStepEnabled: type === IntakeEntityType.USE_CASE,
    liveChecksEnabled: true,
    designSettings: { ...DEFAULT_DESIGN_SETTINGS },
  };
}
