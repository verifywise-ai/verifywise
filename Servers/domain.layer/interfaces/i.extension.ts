/**
 * Types for the Extensions catalog + per-org enablement.
 * Backed by `verifywise.extensions`, `verifywise.extension_config_fields`,
 * and `verifywise.extension_enablements` (see 20260811102307-extensions-migration.js).
 */

export interface IExtensionFeature {
  name: string;
  description: string;
  displayOrder?: number;
}

/**
 * A row from `verifywise.extensions` — one per shipped extension.
 */
export interface IExtension {
  id: number;
  key: string;
  name: string;
  display_name: string;
  description: string;
  long_description: string | null;
  version: string;
  author: string | null;
  category: string;
  icon_path: string | null;
  documentation_url: string | null;
  support_url: string | null;
  requires_configuration: boolean;
  features: IExtensionFeature[];
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Field-type contract with the frontend renderer.
 */
export type ExtensionFieldType =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "password"
  | "number"
  | "boolean"
  | "select"
  | "multiselect";

export interface IExtensionConfigFieldOption {
  label: string;
  value: string;
}

export interface IExtensionConfigFieldValidation {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

/**
 * A row from `verifywise.extension_config_fields` — one per form field.
 */
export interface IExtensionConfigField {
  id: number;
  extension_id: number;
  field_key: string;
  field_type: ExtensionFieldType;
  label: string;
  help_text: string | null;
  placeholder: string | null;
  is_required: boolean;
  is_secret: boolean;
  default_value: string | null;
  display_order: number;
  options: IExtensionConfigFieldOption[] | null;
  validation: IExtensionConfigFieldValidation | null;
  created_at: Date;
}

/**
 * A row from `verifywise.extension_enablements` — per-(org, extension) state.
 */
export interface IExtensionEnablement {
  id: number;
  organization_id: number;
  extension_id: number;
  enabled: boolean;
  configuration: Record<string, unknown>;
  enabled_at: Date | null;
  enabled_by: number | null;
  created_at: Date;
  updated_at: Date;
}
