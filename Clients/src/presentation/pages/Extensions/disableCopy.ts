/**
 * What stops when an extension is disabled, shown in the confirmation before
 * Disable on the catalog and on the settings page. Each sentence is checked
 * against the code: the `requireExtensionEnabled` gate on the extension's
 * routes, the `isEnabled(key)` checks that hide its UI, and the jobs that
 * skip organizations where it is off (sync engine, agent discovery, Slack
 * notifications). Disabling only flips `extension_enablements.enabled`, so
 * stored settings and data are always kept.
 *
 * Whole static sentences: the DOM translator matches full strings, and each
 * one has de/fr/es entries in `i18n/modules/settings.ts`.
 */
export const DISABLE_EFFECT: Record<string, string> = {
  "slack": "Slack notifications stop for this organization. Connections and routing are kept.",
  "mlflow":
    "The MLflow tab and sync are hidden in Model inventory. Synced models and settings are kept.",
  "azure-ai-foundry":
    "The Azure AI Foundry tab and sync are hidden in Model inventory, and agent discovery stops pulling Azure agents. Synced records and settings are kept.",
  "model-lifecycle": "Model lifecycle pages are hidden. Phases, answers and approvals are kept.",
  "risk-import": "Import from Excel is hidden in Risk management. Imported risks are kept.",
  "jira-assets": "Sync with Jira Assets stops. Imported use cases and settings are kept.",
  "jira-incidents":
    "Import and status sync with Jira stop, and Jira links are hidden on incidents. Imported incidents and settings are kept.",
  "dataset-bulk-upload": "Bulk upload is hidden in Datasets. Uploaded datasets are kept.",
  "framework-import":
    "Import from Excel is hidden in Frameworks, and imported frameworks can no longer be added to use cases. Imported frameworks already added to a use case can still be assessed.",
};

export const DISABLE_EFFECT_FALLBACK =
  "Its features are hidden for this organization. Settings and data are kept.";

export function disableEffectFor(key: string): string {
  return DISABLE_EFFECT[key] ?? DISABLE_EFFECT_FALLBACK;
}
