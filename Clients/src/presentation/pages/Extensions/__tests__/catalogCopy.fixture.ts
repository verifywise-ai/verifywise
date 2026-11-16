/**
 * Test fixture: the English catalog copy for the extensions, as the server
 * migrations write it (names, descriptions and configuration fields).
 *
 * This text reaches the page from the database, so the static i18n audit
 * never sees it. The DOM translator matches whole strings, so each one needs
 * a de/fr/es dictionary entry under its exact English text (missing trailing
 * periods included). `catalogCopy.test.ts` checks both: that every string
 * here is the text the latest migration setting it writes, and that every
 * one is translated. A migration that changes catalog text must change this
 * file too.
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
