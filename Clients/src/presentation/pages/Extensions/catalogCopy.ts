/**
 * English catalog copy for the extensions, mirroring the server migrations:
 *   - names and descriptions: 20260811102307-extensions-migration,
 *     20261014214049-jira-incidents-extension,
 *     20261111092001-framework-import-extension and the latest rewrite in
 *     20261116005338-extension-catalog-copy;
 *   - configuration fields: 20260811102307-extensions-migration, minus the
 *     fields removed by 20260819105546-remove-dead-extension-config-fields
 *     and 20261007090000-remove-mlflow-verify-ssl-field.
 *
 * This text reaches the page from the database, so the static i18n audit
 * never sees it. The DOM translator matches whole strings, so each one needs
 * a de/fr/es dictionary entry under its exact English text (missing trailing
 * periods included). `__tests__/catalogCopy.test.ts` checks both: that every
 * string here is still in the migrations and that every one is translated.
 * A migration that changes catalog text must change this file too.
 */

export interface ExtensionCatalogCopy {
  displayName: string;
  description: string;
  /** Product names (Slack, MLflow, ...) are the same in every language. */
  isProductName?: boolean;
}

export const EXTENSION_CATALOG_COPY: Record<string, ExtensionCatalogCopy> = {
  "slack": {
    displayName: "Slack",
    isProductName: true,
    description:
      "Send notifications about membership and role changes, use cases, policy reviews and deadlines to your Slack workspace.",
  },
  "mlflow": {
    displayName: "MLflow",
    isProductName: true,
    description:
      "Track and manage machine learning experiments, models, and deployments with comprehensive ML lifecycle management.",
  },
  "azure-ai-foundry": {
    displayName: "Azure AI Foundry",
    isProductName: true,
    description: "Import and manage AI model deployments from Microsoft Azure AI Foundry.",
  },
  "model-lifecycle": {
    displayName: "Model lifecycle",
    description:
      "Track AI model lifecycle phases from registration through monitoring with configurable phases, approval workflows, and compliance documentation",
  },
  "risk-import": {
    displayName: "Risk import",
    description: "Import risks from Excel files for bulk risk creation and management.",
  },
  "jira-assets": {
    displayName: "Jira Assets",
    isProductName: true,
    description: "Import AI Systems from Jira Service Management Assets as use cases.",
  },
  "dataset-bulk-upload": {
    displayName: "Dataset bulk upload",
    description:
      "Upload multiple CSV/XLSX datasets with metadata, PII detection, and batch processing",
  },
  "jira-incidents": {
    displayName: "Jira incidents",
    description: "Import AI incidents logged in Jira and keep their status in sync.",
  },
  "framework-import": {
    displayName: "Framework import",
    description:
      "Import your own framework (topics and subtopics) from an Excel file, then add it to use cases and assess it.",
  },
};

/** Configuration field text per extension (labels, option labels, help texts). */
export const EXTENSION_CONFIG_FIELD_COPY: Record<
  string,
  { labels: string[]; optionLabels: string[]; helpTexts: string[] }
> = {
  "mlflow": {
    labels: [
      "Tracking server URL",
      "Authentication method",
      "Username",
      "Password",
      "API token",
      "Request timeout (seconds)",
    ],
    optionLabels: ["None", "Basic (username / password)", "Token"],
    helpTexts: [
      "Base URL of your MLflow tracking server.",
      "Required when authentication method is Basic.",
      "Required when authentication method is Basic. Stored encrypted.",
      "Required when authentication method is Token. Stored encrypted.",
    ],
  },
  "azure-ai-foundry": {
    labels: ["Project endpoint", "API key", "Subscription ID", "Resource group", "Resource name"],
    optionLabels: [],
    helpTexts: ["Optional — required only when using the Azure Resource Manager API."],
  },
};

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
// unknown key falls back to the name and a separate word (see
// ExtensionToggledMessage in Settings/index.tsx).
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
