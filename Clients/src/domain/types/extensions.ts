/**
 * Types for the Extensions catalog + per-org enablement.
 * Payloads are returned by /api/extensions/* and mirror the shape the
 * backend service (services/extension/extensionService.ts) assembles.
 */

export type ExtensionCategory = "communication" | "ml_ops" | "data_management";

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

export interface ExtensionFeature {
  name: string;
  description: string;
  displayOrder?: number;
}

export interface ExtensionConfigFieldOption {
  label: string;
  value: string;
}

export interface ExtensionConfigFieldValidation {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ExtensionConfigField {
  id: number;
  fieldKey: string;
  fieldType: ExtensionFieldType;
  label: string;
  helpText: string | null;
  placeholder: string | null;
  isRequired: boolean;
  isSecret: boolean;
  defaultValue: string | null;
  displayOrder: number;
  options: ExtensionConfigFieldOption[] | null;
  validation: ExtensionConfigFieldValidation | null;
}

export interface ExtensionEnablementRow {
  id: number;
  organizationId: number;
  extensionId: number;
  enabled: boolean;
  configuration: Record<string, unknown>;
  enabledAt: string | null;
  enabledBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Extension {
  id: number;
  key: string;
  name: string;
  displayName: string;
  description: string;
  longDescription: string | null;
  version: string;
  author: string | null;
  category: string;
  iconPath: string | null;
  documentationUrl: string | null;
  supportUrl: string | null;
  requiresConfiguration: boolean;
  features: ExtensionFeature[];
  tags: string[];
  configFields: ExtensionConfigField[];
  enabled: boolean;
  configuration: Record<string, unknown>;
  enablement: ExtensionEnablementRow | null;
}
