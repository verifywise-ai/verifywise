/**
 * Registry row for an in-core plugin.
 * Sourced from the `plugins` table (seeded by
 * migration 20260804112024-move-plugins-to-core.js).
 */
export type PluginKind = "integration" | "framework";
export type PluginFrameworkType = "organizational" | "project";

export interface IPluginFeature {
  name: string;
  description: string;
  displayOrder?: number;
}

export interface IPluginUiSlot {
  slotId: string;
  componentName: string;
  renderType: string;
  props?: Record<string, any>;
  trigger?: string;
}

export interface IPluginUiConfig {
  bundleUrl: string;
  globalName?: string;
  slots: IPluginUiSlot[];
}

export interface IPlugin {
  key: string;
  name: string;
  display_name: string;
  description: string;
  long_description?: string | null;
  version: string;
  author?: string | null;
  category: string;
  kind: PluginKind;
  region?: string | null;
  framework_type?: PluginFrameworkType | null;
  framework_id?: number | null;
  icon_url?: string | null;
  documentation_url?: string | null;
  support_url?: string | null;
  is_official: boolean;
  is_published: boolean;
  requires_configuration: boolean;
  installation_type: string;
  features: IPluginFeature[];
  tags: string[];
  dependencies: Record<string, string>;
  ui_config?: IPluginUiConfig | null;
  entry_module?: string | null;
  created_at?: Date;
  updated_at?: Date;
}
