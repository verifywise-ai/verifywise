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
