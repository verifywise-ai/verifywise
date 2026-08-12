export type PluginInstallStatus = "installed" | "installing" | "failed" | "uninstalled";

/**
 * Per-org install state for a plugin. Successor to the legacy
 * `plugin_installations` table.
 */
export interface IPluginInstall {
  id: number;
  organization_id: number;
  plugin_key: string;
  status: PluginInstallStatus;
  installed_at: Date;
  uninstalled_at?: Date | null;
  error_message?: string | null;
  configuration: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}
