/**
 * Runtime catalog copy for the extension pages: category labels and the
 * enable/disable sentences. The catalog names, descriptions and fields come
 * from the database; `__tests__/catalogCopy.fixture.ts` mirrors them so the
 * test can check they are translated.
 */

// Display strings for `extensions.category`, which mirrors the DB CHECK
// constraint on verifywise.extensions.category.
export const CATEGORY_LABEL: Record<string, string> = {
  communication: "Communication",
  ml_ops: "ML Ops",
  data_management: "Data management",
  version_control: "Version control",
  monitoring: "Monitoring",
  security: "Security",
  analytics: "Analytics",
};

export const humanizeCategory = (raw: string): string =>
  CATEGORY_LABEL[raw] ?? raw.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Full sentences per extension so each one translates as a whole. An
// unknown key falls back to a "{name} enabled." template (see
// toggledMessage in Settings/index.tsx).
export const EXTENSION_ENABLED_MESSAGE: Record<string, string> = {
  "slack": "Slack enabled.",
  "mlflow": "MLflow enabled.",
  "azure-ai-foundry": "Azure AI Foundry enabled.",
  "model-lifecycle": "Model lifecycle enabled.",
  "risk-import": "Risk import enabled.",
  "jira-assets": "Jira Assets enabled.",
  "dataset-bulk-upload": "Dataset bulk upload enabled.",
  "jira-incidents": "Jira incidents enabled.",
  "framework-import": "Framework import enabled.",
};

export const EXTENSION_DISABLED_MESSAGE: Record<string, string> = {
  "slack": "Slack disabled.",
  "mlflow": "MLflow disabled.",
  "azure-ai-foundry": "Azure AI Foundry disabled.",
  "model-lifecycle": "Model lifecycle disabled.",
  "risk-import": "Risk import disabled.",
  "jira-assets": "Jira Assets disabled.",
  "dataset-bulk-upload": "Dataset bulk upload disabled.",
  "jira-incidents": "Jira incidents disabled.",
  "framework-import": "Framework import disabled.",
};
