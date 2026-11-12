/**
 * Intake form logic: calculated fields, show/hide rules and risk dimension
 * tags. This module is pure (no I/O, no framework imports) and is copied byte
 * for byte to Clients/src/application/utils/intakeFormLogic/. Both copies run
 * Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json, and
 * a client test fails if the copies differ. Change both together.
 */

export const MAX_FORMULA_LENGTH = 500;
export const MAX_FORMULA_DEPTH = 20;
export const MAX_CONDITIONS = 20;
export const MAX_AFFIX_LENGTH = 10;
export const DEFAULT_DECIMALS = 2;
export const MAX_DECIMALS = 6;

export const RISK_DIMENSIONS = [
  "data_sensitivity",
  "autonomy_level",
  "impact_scope",
  "transparency",
  "human_oversight",
  "domain_criticality",
] as const;
export type RiskDimensionKey = (typeof RISK_DIMENSIONS)[number];

/** Field types that can carry a risk dimension tag. */
export const RISK_TAGGABLE_TYPES: string[] = [
  "text",
  "textarea",
  "select",
  "multiselect",
  "checkbox",
];

/**
 * Entity fields that must never be hidden, by intake entity type. The client
 * test checks this against the entityRequired flags in ENTITY_FIELD_MAPPINGS.
 */
export const REQUIRED_ENTITY_FIELDS: Record<string, string[]> = {
  model: ["name"],
  use_case: ["project_title", "goal"],
  ai_app: ["name"],
};

/** An entityFieldMapping of `custom_field:<key>` targets an entity custom field. */
export const CUSTOM_FIELD_MAPPING_PREFIX = "custom_field:";

export function isCustomFieldMapping(mapping?: string | null): mapping is string {
  return (
    typeof mapping === "string" &&
    mapping.startsWith(CUSTOM_FIELD_MAPPING_PREFIX) &&
    mapping.length > CUSTOM_FIELD_MAPPING_PREFIX.length
  );
}

export function customFieldKeyOf(mapping: string): string {
  return mapping.slice(CUSTOM_FIELD_MAPPING_PREFIX.length);
}

export function customFieldMapping(key: string): string {
  return `${CUSTOM_FIELD_MAPPING_PREFIX}${key}`;
}

/** Custom field types each intake question type can write to. */
export const CUSTOM_FIELD_TYPES_BY_QUESTION: Readonly<Record<string, readonly string[]>> = {
  text: ["text"],
  number: ["number"],
  date: ["date"],
  checkbox: ["boolean"],
  select: ["select", "scored_select"],
  multiselect: ["multiselect"],
};

export function isCompatibleCustomFieldType(questionType: string, fieldType: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(CUSTOM_FIELD_TYPES_BY_QUESTION, questionType) &&
    CUSTOM_FIELD_TYPES_BY_QUESTION[questionType].includes(fieldType)
  );
}

/** Trimmed and lower-cased: how answers, option values and labels are compared. */
export const normalizeText = (value: string): string => value.trim().toLowerCase();

/** A custom field option as approval stores it: plain text, or a scored option's id and label. */
export interface CustomFieldOptionText {
  stored: string;
  label: string;
}

/** A custom field definition's options as stored value and label pairs. */
export function customFieldOptionTexts(
  options: readonly unknown[] | null | undefined,
): CustomFieldOptionText[] {
  const texts: CustomFieldOptionText[] = [];
  for (const option of options ?? []) {
    if (typeof option === "string") {
      texts.push({ stored: option, label: option });
    } else if (option !== null && typeof option === "object") {
      const { id, label } = option as { id?: unknown; label?: unknown };
      if (typeof id === "string" && typeof label === "string") texts.push({ stored: id, label });
    }
  }
  return texts;
}

/** The custom field option any of `texts` names by stored value or label, or undefined. */
export function matchCustomFieldOption(
  texts: readonly unknown[],
  options: readonly CustomFieldOptionText[],
): CustomFieldOptionText | undefined {
  const wanted = texts
    .filter((text): text is string => typeof text === "string")
    .map(normalizeText);
  return options.find(
    (option) =>
      wanted.includes(normalizeText(option.stored)) || wanted.includes(normalizeText(option.label)),
  );
}

const OPTION_CUSTOM_FIELD_TYPES: readonly string[] = ["select", "multiselect", "scored_select"];

/**
 * The question's options that match no option of the custom field it maps
 * to, by value or label. An answer with one of them could not be saved on
 * approval. Empty unless a select or multiselect question maps to a field
 * with options.
 */
export function unmatchedCustomFieldOptions<T extends { value: string; label: string }>(
  questionType: string,
  questionOptions: readonly T[] | undefined,
  fieldType: string,
  fieldOptions: readonly unknown[] | null | undefined,
): T[] {
  if (questionType !== "select" && questionType !== "multiselect") return [];
  if (!OPTION_CUSTOM_FIELD_TYPES.includes(fieldType)) return [];
  const candidates = customFieldOptionTexts(fieldOptions);
  return (questionOptions ?? []).filter(
    (option) => !matchCustomFieldOption([option.value, option.label], candidates),
  );
}

/** Custom field entity type for each intake entity type. */
export const INTAKE_CUSTOM_FIELD_ENTITY: Readonly<Record<"model" | "use_case" | "ai_app", string>> =
  {
    model: "model_inventory",
    use_case: "project",
    ai_app: "ai_app",
  };

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "one_of",
  "is_checked",
  "is_not_checked",
  "contains",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_empty",
  "is_not_empty",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

const EMPTY_CHECKS: ConditionOperator[] = ["is_empty", "is_not_empty"];
const OPTION_OPERATORS: ConditionOperator[] = ["equals", "not_equals", "one_of", ...EMPTY_CHECKS];
const TEXT_OPERATORS: ConditionOperator[] = ["equals", "contains", ...EMPTY_CHECKS];
const NUMBER_OPERATORS: ConditionOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  ...EMPTY_CHECKS,
];

/** Operators allowed for each referenced field type. */
export const OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  select: OPTION_OPERATORS,
  multiselect: OPTION_OPERATORS,
  checkbox: ["is_checked", "is_not_checked"],
  text: TEXT_OPERATORS,
  textarea: TEXT_OPERATORS,
  email: TEXT_OPERATORS,
  url: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  calculated: NUMBER_OPERATORS,
  date: EMPTY_CHECKS,
};

/** `operator` is a string so stored JSON fits; validateSchemaLogic checks it. */
export interface Condition {
  fieldId: string;
  operator: string;
  value?: string | number | string[];
}

export interface Visibility {
  match: "all" | "any";
  conditions: Condition[];
}

/** The parts of a form field this module reads. Server and client field types both fit it. */
export interface LogicField {
  id: string;
  type: string;
  label: string;
  order: number;
  options?: Array<{ value: string; label: string }>;
  entityFieldMapping?: string;
  formula?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  visibility?: Visibility;
  riskDimension?: string;
  required?: boolean;
  validation?: { required?: boolean };
}

export interface LogicSchema {
  fields: LogicField[];
}

export type Answers = Record<string, unknown>;

export interface SchemaLogicError {
  fieldId: string;
  message: string;
}
