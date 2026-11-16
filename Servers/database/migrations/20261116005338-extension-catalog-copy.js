"use strict";

/**
 * Catalog copy for the extensions table (global, no organization_id).
 *
 * - Feature names in sentence case; product names keep their capitals
 *   ("Jira Assets", "MLflow", "Azure AI Foundry", "Slack").
 * - The Slack description now lists only what the server actually sends:
 *   membership and role changes, use case changes, policy review reminders
 *   and deadline alerts.
 * - "use-cases" → "use cases" in the Jira Assets description.
 * - Framework import keeps the description its seed migration has today.
 *   An earlier edit of that seed described imported frameworks as a
 *   reference list; databases seeded before the edit still carry that text,
 *   so up() writes the current one for every database.
 *
 * down() restores the exact values seeded by 20260811102307-extensions-migration
 * and 20261111092001-framework-import-extension.
 */

const NEW_VALUES = {
  slack: {
    name: "Slack",
    display_name: "Slack",
    description:
      "Send notifications about membership and role changes, use cases, policy reviews and deadlines to your Slack workspace.",
  },
  "model-lifecycle": {
    name: "Model lifecycle",
    display_name: "Model lifecycle",
    description:
      "Track AI model lifecycle phases from registration through monitoring with configurable phases, approval workflows, and compliance documentation",
  },
  "risk-import": {
    name: "Risk import",
    display_name: "Risk import",
    description: "Import risks from Excel files for bulk risk creation and management.",
  },
  "jira-assets": {
    name: "Jira Assets",
    display_name: "Jira Assets",
    description: "Import AI Systems from Jira Service Management Assets as use cases.",
  },
  "dataset-bulk-upload": {
    name: "Dataset bulk upload",
    display_name: "Dataset bulk upload",
    description:
      "Upload multiple CSV/XLSX datasets with metadata, PII detection, and batch processing",
  },
  "framework-import": {
    name: "Framework import",
    display_name: "Framework import",
    description:
      "Import your own framework (topics and subtopics) from an Excel file, then add it to use cases and assess it.",
  },
};

const OLD_VALUES = {
  slack: {
    name: "Slack",
    display_name: "Slack",
    description:
      "Get real-time notifications about AI model updates, risk assessments, and compliance changes directly in your Slack workspace.",
  },
  "model-lifecycle": {
    name: "Model Lifecycle",
    display_name: "Model Lifecycle",
    description:
      "Track AI model lifecycle phases from registration through monitoring with configurable phases, approval workflows, and compliance documentation",
  },
  "risk-import": {
    name: "Risk Import",
    display_name: "Risk Import",
    description: "Import risks from Excel files for bulk risk creation and management.",
  },
  "jira-assets": {
    name: "Jira Assets Integration",
    display_name: "Jira Assets Integration",
    description: "Import AI Systems from Jira Service Management Assets as use-cases.",
  },
  "dataset-bulk-upload": {
    name: "Dataset Bulk Upload",
    display_name: "Dataset Bulk Upload",
    description:
      "Upload multiple CSV/XLSX datasets with metadata, PII detection, and batch processing",
  },
  "framework-import": {
    name: "Framework Import",
    display_name: "Framework Import",
    description:
      "Import your own framework (topics and subtopics) from an Excel file, then add it to use cases and assess it.",
  },
};

async function apply(queryInterface, values) {
  const sequelize = queryInterface.sequelize;
  const transaction = await sequelize.transaction();
  try {
    for (const [key, row] of Object.entries(values)) {
      await sequelize.query(
        `UPDATE verifywise.extensions
            SET name = :name, display_name = :display_name, description = :description, updated_at = NOW()
          WHERE key = :key;`,
        { transaction, replacements: { key, ...row } },
      );
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  async up(queryInterface) {
    await apply(queryInterface, NEW_VALUES);
  },

  async down(queryInterface) {
    await apply(queryInterface, OLD_VALUES);
  },
};
