export type CustomFieldType =
  "text" | "number" | "date" | "boolean" | "select" | "multiselect" | "user" | "scored_select";

export type CustomFieldEntityType =
  | "vendor"
  | "policy"
  | "project"
  | "project_risk"
  | "vendor_risk"
  | "model_inventory"
  | "task"
  | "model_risk";

/** A scored select option: the stored value is `id`; `score` is read from the definition. */
export interface IScoredOption {
  id: string;
  label: string;
  score: number;
}

/** An option as the client sends it: new options have no id yet. */
export interface IScoredOptionInput {
  id?: string;
  label: string;
  score: number;
}

export interface ICustomFieldDefinition {
  id: number;
  organization_id: number;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | IScoredOption[] | null;
  required: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface ICustomFieldValueRow {
  definition_id: number;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  value: unknown;
}

export interface ICreateCustomFieldDefinitionInput {
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options?: string[] | IScoredOptionInput[] | null;
  required?: boolean;
}

export interface IUpdateCustomFieldDefinitionInput {
  label?: string;
  required?: boolean;
  options?: string[] | IScoredOptionInput[] | null;
  option_moves?: Record<string, string>;
  /** Removed options whose answers are deleted instead of moved. */
  option_removals?: string[];
}

export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomFieldEntityType, string> = {
  vendor: "Vendor",
  policy: "Policy",
  project: "Use case",
  project_risk: "Project risk",
  vendor_risk: "Vendor risk",
  model_inventory: "Model Inventory",
  task: "Task",
  model_risk: "Model risk",
};

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes/No",
  select: "Single select",
  multiselect: "Multi select",
  user: "User",
  scored_select: "Scored select",
};

type OptionsLike = { field_type: string; options?: unknown };

/** Options of a select or multiselect field (labels). */
export const stringOptions = (def: OptionsLike): string[] =>
  def.field_type !== "scored_select" && Array.isArray(def.options) ? (def.options as string[]) : [];

/** Options of a scored select field. */
export const scoredOptions = (def: OptionsLike): IScoredOption[] =>
  def.field_type === "scored_select" && Array.isArray(def.options)
    ? (def.options as IScoredOption[])
    : [];

/** Round to 2 decimals the way the server stores scores; never -0. */
export const roundScore = (score: number): number => {
  const rounded = Math.round(score * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** 3 -> "3", 0.5 -> "0.5", 0.333 -> "0.33"; never "-0". */
export const formatScore = (score: number): string =>
  typeof score === "number" && Number.isFinite(score) ? String(roundScore(score)) : "—";

export const formatScoredOption = (o: { label: string; score: number }): string =>
  `${o.label} (${formatScore(o.score)})`;

const ENTITY_COUNT_NOUNS: Record<CustomFieldEntityType, [string, string]> = {
  vendor: ["vendor", "vendors"],
  policy: ["policy", "policies"],
  project: ["use case", "use cases"],
  project_risk: ["project risk", "project risks"],
  vendor_risk: ["vendor risk", "vendor risks"],
  model_inventory: ["model", "models"],
  task: ["task", "tasks"],
  model_risk: ["model risk", "model risks"],
};

/** "use case" for 1, "use cases" otherwise. */
export const entityCountNoun = (entity: CustomFieldEntityType, count: number): string =>
  ENTITY_COUNT_NOUNS[entity][count === 1 ? 0 : 1];
