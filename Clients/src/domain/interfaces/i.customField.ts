export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "multiselect"
  | "user";

export type CustomFieldEntityType =
  | "vendor"
  | "policy"
  | "project"
  | "project_risk"
  | "vendor_risk"
  | "model_inventory"
  | "task"
  | "model_risk";

export interface ICustomFieldDefinition {
  id: number;
  organization_id: number;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
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
  options?: string[] | null;
  required?: boolean;
}

export interface IUpdateCustomFieldDefinitionInput {
  label?: string;
  required?: boolean;
  options?: string[] | null;
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
};
