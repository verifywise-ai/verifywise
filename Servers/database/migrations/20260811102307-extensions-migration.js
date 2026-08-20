"use strict";

/**
 * Plugins → Extensions migration.
 *
 * Introduces a first-class, relational Extensions system replacing the
 * flat plugin_installations table.
 *
 * Three catalog/state tables:
 *   verifywise.extensions                 — master catalog of every extension
 *                                            shipped with core (seeded row per
 *                                            extension). One-to-many with all
 *                                            other extension_* tables.
 *   verifywise.extension_config_fields    — declarative form schema per
 *                                            extension. Frontend renders these
 *                                            as the extension's config form.
 *   verifywise.extension_enablements      — per (organization, extension)
 *                                            enable state + configuration
 *                                            values. Replaces
 *                                            plugin_installations.
 *
 * Plus 11 extension-owned data tables that used to be created inside the
 * plugins' install() hooks (now unconditionally present in shared schema):
 *   azure_ai_model_records                (azure-ai-foundry, 1 table)
 *   model_lifecycle_phases / _items / _values / _item_files /
 *     _item_people / _item_approvals / _change_history
 *                                         (model-lifecycle, 7 tables)
 *   jira_assets_config / _use_cases / _sync_history + uc_id sequence
 *                                         (jira-assets, 3 tables)
 *
 * slack_webhooks and mlflow_integrations / mlflow_model_records already
 * exist from 20260226234302-tenant-tables.js — not touched.
 *
 * plugin_installations is migrated into extension_enablements (joined on
 * plugin_key → extensions.key) and dropped.
 */

// -------------------------------------------------------------------------
// Extension catalog seed
// -------------------------------------------------------------------------

// Every string below is copied verbatim from plugin-marketplace/plugins.json.
// icon_path is null because the source `iconUrl` values point into the
// plugin-marketplace repo (`plugins/<key>/icon.svg`) — not valid from core.
// Icons must be moved into Clients/public/assets/ and this seed updated in a
// follow-up migration.
const EXTENSIONS_SEED = [
  {
    key: "slack",
    name: "Slack",
    display_name: "Slack",
    description:
      "Get real-time notifications about AI model updates, risk assessments, and compliance changes directly in your Slack workspace.",
    long_description:
      "Slack integration enables your team to receive real-time notifications about critical events in VerifyWise. Configure notification routing to send different types of alerts to specific channels, ensuring your team stays informed about AI governance activities, policy changes, risk assessments, and compliance updates.",
    version: "1.0.0",
    author: "VerifyWise",
    category: "communication",
    icon_path: null,
    documentation_url: "https://docs.verifywise.com/integrations/slack",
    support_url: "https://support.verifywise.com",
    requires_configuration: true,
    features: [
      {
        name: "Real-time Notifications",
        description: "Receive instant alerts about critical events in your workspace",
        displayOrder: 1,
      },
      {
        name: "Channel Routing",
        description: "Route different notification types to specific channels",
        displayOrder: 2,
      },
      {
        name: "OAuth Integration",
        description: "Secure authentication with Slack workspace",
        displayOrder: 3,
      },
      {
        name: "Policy Reminders",
        description: "Automated reminders for policy reviews and updates",
        displayOrder: 4,
      },
    ],
    tags: ["notifications", "messaging", "collaboration", "alerts"],
  },
  {
    key: "mlflow",
    name: "MLflow",
    display_name: "MLflow",
    description:
      "Track and manage machine learning experiments, models, and deployments with comprehensive ML lifecycle management.",
    long_description:
      "MLflow integration connects VerifyWise with your MLflow tracking server, enabling automatic synchronization of ML models and experiments. Track model versions, monitor training metrics, and maintain a comprehensive inventory of all ML models used in your AI systems for compliance and governance purposes.",
    version: "1.0.0",
    author: "VerifyWise",
    category: "ml_ops",
    icon_path: null,
    documentation_url: "https://docs.verifywise.com/integrations/mlflow",
    support_url: "https://support.verifywise.com",
    requires_configuration: true,
    features: [
      {
        name: "Model Tracking",
        description: "Automatically sync ML models from your MLflow server",
        displayOrder: 1,
      },
      {
        name: "Experiment Management",
        description: "Track experiments and training runs",
        displayOrder: 2,
      },
      {
        name: "Version Control",
        description: "Maintain model version history and lineage",
        displayOrder: 3,
      },
      {
        name: "Metrics Monitoring",
        description: "Monitor model performance metrics and parameters",
        displayOrder: 4,
      },
      {
        name: "Scheduled Sync",
        description: "Hourly automated synchronization of models",
        displayOrder: 5,
      },
    ],
    tags: ["ml-ops", "model-tracking", "experiments", "model-registry"],
  },
  {
    key: "azure-ai-foundry",
    name: "Azure AI Foundry",
    display_name: "Azure AI Foundry",
    description: "Import and manage AI model deployments from Microsoft Azure AI Foundry.",
    long_description:
      "Azure AI Foundry integration enables automatic synchronization of AI model deployments from your Azure subscription. Track deployed models including GPT-4, GPT-3.5, embeddings, and other Azure OpenAI or custom models. Monitor deployment status, SKU capacity, rate limits, and maintain a comprehensive inventory of all AI models for compliance and governance purposes.",
    version: "1.0.0",
    author: "VerifyWise",
    category: "ml_ops",
    icon_path: null,
    documentation_url: "https://docs.verifywise.com/integrations/azure-ai-foundry",
    support_url: "https://support.verifywise.com",
    requires_configuration: true,
    features: [
      {
        name: "Model Import",
        description: "Automatically sync AI model deployments from Azure AI Foundry",
        displayOrder: 1,
      },
      {
        name: "Deployment Tracking",
        description: "Track deployment status, SKU, and capacity",
        displayOrder: 2,
      },
      {
        name: "Rate Limit Monitoring",
        description: "Monitor API rate limits and quotas",
        displayOrder: 3,
      },
      {
        name: "Multi-Model Support",
        description: "Support for GPT-4, GPT-3.5, embeddings, DeepSeek, and more",
        displayOrder: 4,
      },
      {
        name: "Manual Sync",
        description: "On-demand synchronization of model deployments",
        displayOrder: 5,
      },
    ],
    tags: ["azure", "ai-foundry", "openai", "model-registry", "cloud"],
  },
  {
    key: "model-lifecycle",
    name: "Model Lifecycle",
    display_name: "Model Lifecycle",
    description:
      "Track AI model lifecycle phases from registration through monitoring with configurable phases, approval workflows, and compliance documentation",
    long_description:
      "Model Lifecycle provides comprehensive tracking of AI model lifecycle phases including registration, design, validation, deployment, monitoring, and human oversight. Features configurable phases with 7 field types (text, textarea, documents, people, classification, checklist, approval), per-model progress tracking, and an admin configuration editor for customizing phases and items.",
    version: "1.0.0",
    author: "VerifyWise",
    category: "ml_ops",
    icon_path: null,
    documentation_url: null,
    support_url: null,
    requires_configuration: true,
    features: [
      {
        name: "Lifecycle Phase Tracking",
        description:
          "Track models through configurable lifecycle phases from registration to monitoring",
      },
      {
        name: "Multiple Field Types",
        description:
          "7 field types: text, textarea, documents, people, classification, checklist, approval",
      },
      {
        name: "Approval Workflows",
        description: "Built-in approval workflow support with multi-approver tracking",
      },
      {
        name: "Progress Tracking",
        description: "Visual progress tracking with per-phase and overall completion metrics",
      },
      {
        name: "Admin Configuration",
        description: "Full admin UI for adding, removing, and reordering phases and items",
      },
    ],
    tags: [],
  },
  {
    key: "risk-import",
    name: "Risk Import",
    display_name: "Risk Import",
    description: "Import risks from Excel files for bulk risk creation and management.",
    long_description:
      "Risk Import plugin enables bulk import of risks from Excel files with dropdown data validation. Download a pre-formatted Excel template with dropdown menus for enum fields, fill it with your risk data using the convenient dropdowns, and upload to create multiple risks at once. Features comprehensive validation, detailed error reporting, and support for all risk fields including lifecycle phases, severity levels, and mitigation plans.",
    version: "1.0.0",
    author: "VerifyWise",
    category: "data_management",
    icon_path: null,
    documentation_url: "https://docs.verifywise.com/integrations/risk-import",
    support_url: "https://support.verifywise.com",
    requires_configuration: false,
    features: [
      {
        name: "Excel Template Download",
        description: "Download pre-formatted Excel template with dropdown validation",
        displayOrder: 1,
      },
      {
        name: "Dropdown Data Validation",
        description: "Built-in dropdown menus for enum fields in Excel",
        displayOrder: 2,
      },
      {
        name: "Bulk Import",
        description: "Upload Excel to create multiple risks at once",
        displayOrder: 3,
      },
      {
        name: "Field Validation",
        description: "Comprehensive validation before import",
        displayOrder: 4,
      },
      {
        name: "Import Results",
        description: "Detailed feedback on successful and failed imports",
        displayOrder: 5,
      },
    ],
    tags: ["risk", "import", "excel", "bulk-operations", "data-management"],
  },
  {
    key: "jira-assets",
    name: "Jira Assets Integration",
    display_name: "Jira Assets Integration",
    description: "Import AI Systems from Jira Service Management Assets as use-cases.",
    long_description:
      "Jira Assets Integration connects VerifyWise with your JSM Assets (formerly Insight) to import AI System objects as use-cases. Supports organizational and non-organizational classification, automatic scheduled sync, and stores all JIRA attributes as-is. Import AI Systems with a few clicks and keep them in sync with your JIRA data.",
    version: "1.0.0",
    author: "VerifyWise",
    category: "data_management",
    icon_path: null,
    documentation_url: "https://docs.verifywise.com/integrations/jira-assets",
    support_url: "https://support.verifywise.com",
    requires_configuration: true,
    features: [
      {
        name: "Import AI Systems",
        description: "Import AI System objects from JSM Assets as use-cases",
        displayOrder: 1,
      },
      {
        name: "Organizational Support",
        description: "Classify imports as organizational or non-organizational",
        displayOrder: 2,
      },
      {
        name: "Automatic Sync",
        description: "Scheduled synchronization to keep data in sync",
        displayOrder: 3,
      },
      {
        name: "Full Attribute Storage",
        description: "All JIRA attributes stored as-is without field mapping",
        displayOrder: 4,
      },
      {
        name: "UC-ID Generation",
        description: "Auto-generated unique UC-IDs for imported use-cases",
        displayOrder: 5,
      },
    ],
    tags: ["jira", "assets", "import", "use-cases", "sync", "integration"],
  },
  {
    key: "dataset-bulk-upload",
    name: "Dataset Bulk Upload",
    display_name: "Dataset Bulk Upload",
    description:
      "Upload multiple CSV/XLSX datasets with metadata, PII detection, and batch processing",
    long_description:
      "Dataset Bulk Upload enables data teams to import multiple datasets at once with automatic PII detection, metadata annotation, and batch processing. Each file is analyzed client-side for column structure, row count, and potential PII before upload. Supports CSV, XLSX, and XLS formats with per-file metadata customization.",
    version: "1.0.0",
    author: "VerifyWise",
    category: "data_management",
    icon_path: null,
    documentation_url: null,
    support_url: null,
    requires_configuration: false,
    features: [
      {
        name: "Bulk File Upload",
        description: "Upload up to 20 CSV/XLSX files at once with drag & drop support",
      },
      {
        name: "PII Detection",
        description: "Automatic detection of personally identifiable information in column headers",
      },
      {
        name: "Metadata Annotation",
        description: "Per-file metadata customization with batch defaults support",
      },
      {
        name: "Data Preview",
        description: "Preview file contents and column structure before uploading",
      },
    ],
    tags: [],
  },
];

// -------------------------------------------------------------------------
// Config field seed (per extension key)
//
// field_type values are the contract with the frontend renderer:
//   text | textarea | url | email | password | number | boolean
//   select | multiselect
// -------------------------------------------------------------------------

const CONFIG_FIELDS_BY_KEY = {
  slack: [
    {
      field_key: "routing_type",
      field_type: "multiselect",
      label: "Notification routing",
      help_text: "Select which notification categories should be sent to this Slack workspace.",
      is_required: false,
      display_order: 1,
      options: [
        { label: "Membership and roles", value: "Membership and roles" },
        { label: "Projects and organizations", value: "Projects and organizations" },
        { label: "Policy reminders and status", value: "Policy reminders and status" },
        { label: "Evidence and task alerts", value: "Evidence and task alerts" },
        { label: "Control or policy changes", value: "Control or policy changes" },
      ],
    },
  ],
  mlflow: [
    {
      field_key: "tracking_server_url",
      field_type: "url",
      label: "Tracking server URL",
      placeholder: "https://mlflow.example.com",
      help_text: "Base URL of your MLflow tracking server.",
      is_required: true,
      display_order: 1,
    },
    {
      field_key: "auth_method",
      field_type: "select",
      label: "Authentication method",
      is_required: true,
      default_value: "none",
      display_order: 2,
      options: [
        { label: "None", value: "none" },
        { label: "Basic (username / password)", value: "basic" },
        { label: "Token", value: "token" },
      ],
    },
    {
      field_key: "username",
      field_type: "text",
      label: "Username",
      help_text: "Required when authentication method is Basic.",
      is_required: false,
      display_order: 3,
    },
    {
      field_key: "password",
      field_type: "password",
      label: "Password",
      help_text: "Required when authentication method is Basic. Stored encrypted.",
      is_required: false,
      is_secret: true,
      display_order: 4,
    },
    {
      field_key: "api_token",
      field_type: "password",
      label: "API token",
      help_text: "Required when authentication method is Token. Stored encrypted.",
      is_required: false,
      is_secret: true,
      display_order: 5,
    },
    {
      field_key: "verify_ssl",
      field_type: "boolean",
      label: "Verify SSL certificate",
      default_value: "true",
      display_order: 6,
    },
    {
      field_key: "timeout",
      field_type: "number",
      label: "Request timeout (seconds)",
      default_value: "30",
      display_order: 7,
      validation: { min: 1, max: 600 },
    },
  ],
  "azure-ai-foundry": [
    {
      field_key: "project_endpoint",
      field_type: "url",
      label: "Project endpoint",
      placeholder: "https://<project>.services.ai.azure.com",
      is_required: true,
      display_order: 1,
    },
    {
      field_key: "api_key",
      field_type: "password",
      label: "API key",
      is_required: true,
      is_secret: true,
      display_order: 2,
    },
    {
      field_key: "subscription_id",
      field_type: "text",
      label: "Subscription ID",
      help_text: "Optional — required only when using the Azure Resource Manager API.",
      display_order: 3,
    },
    {
      field_key: "resource_group",
      field_type: "text",
      label: "Resource group",
      help_text: "Optional — required only when using the Azure Resource Manager API.",
      display_order: 4,
    },
    {
      field_key: "resource_name",
      field_type: "text",
      label: "Resource name",
      help_text: "Optional — required only when using the Azure Resource Manager API.",
      display_order: 5,
    },
  ],
  "model-lifecycle": [],
  "risk-import": [],
  "jira-assets": [
    {
      field_key: "jira_base_url",
      field_type: "url",
      label: "JIRA base URL",
      placeholder: "https://your-domain.atlassian.net",
      is_required: true,
      display_order: 1,
    },
    {
      field_key: "workspace_id",
      field_type: "text",
      label: "Workspace ID",
      is_required: true,
      display_order: 2,
    },
    {
      field_key: "email",
      field_type: "email",
      label: "Account email",
      is_required: true,
      display_order: 3,
    },
    {
      field_key: "api_token",
      field_type: "password",
      label: "API token",
      is_required: true,
      is_secret: true,
      display_order: 4,
    },
    {
      field_key: "deployment_type",
      field_type: "select",
      label: "Deployment type",
      is_required: true,
      default_value: "cloud",
      display_order: 5,
      options: [
        { label: "Cloud", value: "cloud" },
        { label: "Data Center / Server", value: "datacenter" },
      ],
    },
    {
      field_key: "sync_enabled",
      field_type: "boolean",
      label: "Enable scheduled sync",
      default_value: "false",
      display_order: 6,
    },
    {
      field_key: "sync_interval_hours",
      field_type: "number",
      label: "Sync interval (hours)",
      default_value: "24",
      display_order: 7,
      validation: { min: 1, max: 168 },
    },
  ],
  "dataset-bulk-upload": [],
};

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      console.log("🚀 Extensions migration");

      // =======================================================================
      // 1. CATALOG TABLES
      // =======================================================================
      // Catalog of every extension shipped with core. `category` is
      // constrained to the frontend-known set — a new category is a
      // deliberate schema change.
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.extensions (
          id                       SERIAL PRIMARY KEY,
          key                      VARCHAR(100) NOT NULL UNIQUE,
          name                     VARCHAR(255) NOT NULL,
          display_name             VARCHAR(255) NOT NULL,
          description              TEXT NOT NULL,
          long_description         TEXT,
          version                  VARCHAR(50) NOT NULL,
          author                   VARCHAR(255),
          category                 VARCHAR(100) NOT NULL,
          icon_path                VARCHAR(500),
          documentation_url        VARCHAR(500),
          support_url              VARCHAR(500),
          requires_configuration   BOOLEAN NOT NULL DEFAULT FALSE,
          features                 JSONB NOT NULL DEFAULT '[]'::jsonb,
          tags                     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT extensions_key_format_chk
            CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
          CONSTRAINT extensions_category_chk
            CHECK (category IN ('communication','ml_ops','data_management',
                                'version_control','monitoring','security','analytics')),
          CONSTRAINT extensions_features_is_array_chk
            CHECK (jsonb_typeof(features) = 'array')
        );
        CREATE INDEX IF NOT EXISTS idx_extensions_category
          ON verifywise.extensions(category);
        `,
        { transaction },
      );

      // Declarative form-field schema per extension. `field_type` is
      // constrained to the renderer contract; `options` must be an array
      // when populated (select/multiselect); `validation` must be an
      // object when populated.
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.extension_config_fields (
          id                       SERIAL PRIMARY KEY,
          extension_id             INTEGER NOT NULL REFERENCES verifywise.extensions(id) ON DELETE CASCADE,
          field_key                VARCHAR(100) NOT NULL,
          field_type               VARCHAR(50) NOT NULL,
          label                    VARCHAR(255) NOT NULL,
          help_text                TEXT,
          placeholder              VARCHAR(255),
          is_required              BOOLEAN NOT NULL DEFAULT FALSE,
          is_secret                BOOLEAN NOT NULL DEFAULT FALSE,
          default_value            TEXT,
          display_order            INTEGER NOT NULL DEFAULT 0,
          options                  JSONB,
          validation               JSONB,
          created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (extension_id, field_key),
          CONSTRAINT extension_config_fields_field_key_format_chk
            CHECK (field_key ~ '^[a-z_][a-z0-9_]{0,99}$'),
          CONSTRAINT extension_config_fields_field_type_chk
            CHECK (field_type IN ('text','textarea','url','email','password',
                                  'number','boolean','select','multiselect')),
          CONSTRAINT extension_config_fields_display_order_nonneg_chk
            CHECK (display_order >= 0),
          CONSTRAINT extension_config_fields_options_is_array_chk
            CHECK (options IS NULL OR jsonb_typeof(options) = 'array'),
          CONSTRAINT extension_config_fields_validation_is_object_chk
            CHECK (validation IS NULL OR jsonb_typeof(validation) = 'object')
        );
        CREATE INDEX IF NOT EXISTS idx_extension_config_fields_extension_id
          ON verifywise.extension_config_fields(extension_id, display_order);
        `,
        { transaction },
      );

      // Per (org, extension) enable state + configuration blob. `enabled_at`
      // must be set whenever enabled=true; enforced at the DB level so an
      // app bug can't leave the audit trail empty.
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.extension_enablements (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          extension_id             INTEGER NOT NULL REFERENCES verifywise.extensions(id) ON DELETE CASCADE,
          enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
          configuration            JSONB NOT NULL DEFAULT '{}'::jsonb,
          enabled_at               TIMESTAMP,
          enabled_by               INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (organization_id, extension_id),
          CONSTRAINT extension_enablements_configuration_is_object_chk
            CHECK (jsonb_typeof(configuration) = 'object'),
          CONSTRAINT extension_enablements_enabled_at_when_enabled_chk
            CHECK (NOT enabled OR enabled_at IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS idx_extension_enablements_org_id
          ON verifywise.extension_enablements(organization_id);
        CREATE INDEX IF NOT EXISTS idx_extension_enablements_extension_id
          ON verifywise.extension_enablements(extension_id);
        -- Partial index on the hot filter path: "which extensions are enabled
        -- for this org?" (used by ExtensionSlot on every page render).
        CREATE INDEX IF NOT EXISTS idx_extension_enablements_enabled
          ON verifywise.extension_enablements(organization_id, extension_id)
          WHERE enabled = TRUE;
        `,
        { transaction },
      );

      // =======================================================================
      // 2. CATALOG SEED — extensions
      // =======================================================================
      // Serialize a JS string[] into a Postgres array literal (e.g. `{"a","b"}`)
      // so `CAST(:tags AS TEXT[])` stays a single bound value. Passing a raw JS
      // array through Sequelize replacements would expand each element as a
      // separate positional value and break the INSERT.
      const toPgTextArray = (arr) =>
        `{${(arr ?? []).map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

      for (const ext of EXTENSIONS_SEED) {
        await sequelize.query(
          `
          INSERT INTO verifywise.extensions
            (key, name, display_name, description, long_description, version, author,
             category, icon_path, documentation_url, support_url, requires_configuration,
             features, tags, created_at, updated_at)
          VALUES
            (:key, :name, :display_name, :description, :long_description, :version, :author,
             :category, :icon_path, :documentation_url, :support_url, :requires_configuration,
             CAST(:features AS JSONB), CAST(:tags AS TEXT[]), NOW(), NOW());
          `,
          {
            transaction,
            replacements: {
              key: ext.key,
              name: ext.name,
              display_name: ext.display_name,
              description: ext.description,
              long_description: ext.long_description,
              version: ext.version,
              author: ext.author,
              category: ext.category,
              icon_path: ext.icon_path,
              documentation_url: ext.documentation_url,
              support_url: ext.support_url,
              requires_configuration: ext.requires_configuration,
              features: JSON.stringify(ext.features),
              tags: toPgTextArray(ext.tags),
            },
          },
        );
      }

      // =======================================================================
      // 3. CATALOG SEED — extension_config_fields
      // =======================================================================
      for (const [key, fields] of Object.entries(CONFIG_FIELDS_BY_KEY)) {
        if (fields.length === 0) continue;
        const [extRows] = await sequelize.query(
          `SELECT id FROM verifywise.extensions WHERE key = :key LIMIT 1;`,
          { transaction, replacements: { key } },
        );
        const extensionId = extRows[0]?.id;
        if (!extensionId) {
          throw new Error(`Seed failed: extension '${key}' not found after insert`);
        }
        for (const f of fields) {
          await sequelize.query(
            `
            INSERT INTO verifywise.extension_config_fields
              (extension_id, field_key, field_type, label, help_text, placeholder,
               is_required, is_secret, default_value, display_order, options, validation,
               created_at)
            VALUES
              (:extension_id, :field_key, :field_type, :label, :help_text, :placeholder,
               :is_required, :is_secret, :default_value, :display_order,
               CAST(:options AS JSONB), CAST(:validation AS JSONB), NOW());
            `,
            {
              transaction,
              replacements: {
                extension_id: extensionId,
                field_key: f.field_key,
                field_type: f.field_type,
                label: f.label,
                help_text: f.help_text ?? null,
                placeholder: f.placeholder ?? null,
                is_required: f.is_required ?? false,
                is_secret: f.is_secret ?? false,
                default_value: f.default_value ?? null,
                display_order: f.display_order ?? 0,
                options: f.options ? JSON.stringify(f.options) : null,
                validation: f.validation ? JSON.stringify(f.validation) : null,
              },
            },
          );
        }
      }

      // =======================================================================
      // 4. DATA MIGRATION — plugin_installations → extension_enablements
      // =======================================================================
      const [pluginTable] = await sequelize.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'verifywise' AND table_name = 'plugin_installations' LIMIT 1;`,
        { transaction },
      );

      if (pluginTable.length > 0) {
        const [totalRows] = await sequelize.query(
          `SELECT COUNT(*)::int AS n FROM verifywise.plugin_installations;`,
          { transaction },
        );
        const [matchedRows] = await sequelize.query(
          `SELECT COUNT(*)::int AS n
             FROM verifywise.plugin_installations pi
             JOIN verifywise.extensions e ON e.key = pi.plugin_key;`,
          { transaction },
        );
        const [skippedKeys] = await sequelize.query(
          `SELECT DISTINCT pi.plugin_key
             FROM verifywise.plugin_installations pi
        LEFT JOIN verifywise.extensions e ON e.key = pi.plugin_key
            WHERE e.id IS NULL;`,
          { transaction },
        );

        await sequelize.query(
          `
          INSERT INTO verifywise.extension_enablements
            (organization_id, extension_id, enabled, configuration, enabled_at,
             created_at, updated_at)
          SELECT pi.organization_id,
                 e.id,
                 pi.status = 'installed',
                 COALESCE(pi.configuration, '{}'::jsonb),
                 -- enabled_at MUST be set when enabled=true (CHECK constraint on
                 -- extension_enablements); fall back to installed_at →
                 -- created_at → NOW() so legacy rows with a NULL installed_at
                 -- don't trip the constraint.
                 CASE WHEN pi.status = 'installed'
                      THEN COALESCE(pi.installed_at, pi.created_at, NOW())
                      ELSE NULL END,
                 pi.created_at,
                 pi.updated_at
            FROM verifywise.plugin_installations pi
            JOIN verifywise.extensions e ON e.key = pi.plugin_key
           ON CONFLICT (organization_id, extension_id) DO NOTHING;
          `,
          { transaction },
        );

        console.log(
          `   plugin_installations → extension_enablements: ${matchedRows[0].n}/${totalRows[0].n} rows migrated`,
        );
        if (skippedKeys.length > 0) {
          console.log(
            `   ⚠️  skipped plugin_installations for unknown keys: ${skippedKeys
              .map((r) => r.plugin_key)
              .join(", ")}`,
          );
        }

        await sequelize.query(`DROP TABLE verifywise.plugin_installations;`, { transaction });
      }

      // =======================================================================
      // 5. EXTENSION-OWNED DATA TABLES
      // =======================================================================

      // --- azure-ai-foundry ------------------------------------------------
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.azure_ai_model_records (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          deployment_name          VARCHAR(255) NOT NULL,
          model_name               VARCHAR(255) NOT NULL,
          model_format             VARCHAR(255),
          model_version            VARCHAR(255),
          provisioning_state       VARCHAR(50),
          sku_name                 VARCHAR(255),
          sku_capacity             INTEGER,
          capabilities             JSONB NOT NULL DEFAULT '{}'::jsonb,
          rate_limits              JSONB NOT NULL DEFAULT '[]'::jsonb,
          rai_policy_name          VARCHAR(255),
          created_by               VARCHAR(255),
          azure_created_at         TIMESTAMP,
          azure_modified_at        TIMESTAMP,
          last_synced_at           TIMESTAMP,
          created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT azure_ai_model_records_org_deployment_unique
            UNIQUE (organization_id, deployment_name),
          CONSTRAINT azure_ai_model_records_sku_capacity_nonneg_chk
            CHECK (sku_capacity IS NULL OR sku_capacity >= 0),
          CONSTRAINT azure_ai_model_records_capabilities_is_object_chk
            CHECK (jsonb_typeof(capabilities) = 'object'),
          CONSTRAINT azure_ai_model_records_rate_limits_is_array_chk
            CHECK (jsonb_typeof(rate_limits) = 'array')
        );
        CREATE INDEX IF NOT EXISTS idx_azure_ai_model_records_org_id
          ON verifywise.azure_ai_model_records(organization_id);
        -- "Show me what synced most recently" is the common list query.
        CREATE INDEX IF NOT EXISTS idx_azure_ai_model_records_last_synced
          ON verifywise.azure_ai_model_records(organization_id, last_synced_at DESC);
        `,
        { transaction },
      );

      // --- model-lifecycle (7 tables) --------------------------------------
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.model_lifecycle_phases (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name                     VARCHAR(255) NOT NULL,
          description              TEXT,
          display_order            INTEGER NOT NULL DEFAULT 0,
          is_active                BOOLEAN NOT NULL DEFAULT TRUE,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT model_lifecycle_phases_display_order_nonneg_chk
            CHECK (display_order >= 0),
          CONSTRAINT model_lifecycle_phases_name_not_blank_chk
            CHECK (length(btrim(name)) > 0)
        );
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_phases_org_id
          ON verifywise.model_lifecycle_phases(organization_id);
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_phases_display_order
          ON verifywise.model_lifecycle_phases(organization_id, display_order);
        -- "Show active phases only" is the render path.
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_phases_active
          ON verifywise.model_lifecycle_phases(organization_id, display_order)
          WHERE is_active = TRUE;
        `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.model_lifecycle_items (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          phase_id                 INTEGER NOT NULL REFERENCES verifywise.model_lifecycle_phases(id) ON DELETE CASCADE,
          name                     VARCHAR(255) NOT NULL,
          description              TEXT,
          item_type                VARCHAR(50) NOT NULL DEFAULT 'text',
          is_required              BOOLEAN NOT NULL DEFAULT FALSE,
          display_order            INTEGER NOT NULL DEFAULT 0,
          config                   JSONB NOT NULL DEFAULT '{}'::jsonb,
          is_active                BOOLEAN NOT NULL DEFAULT TRUE,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT model_lifecycle_items_item_type_chk
            CHECK (item_type IN ('text','textarea','documents','people',
                                 'classification','checklist','approval')),
          CONSTRAINT model_lifecycle_items_display_order_nonneg_chk
            CHECK (display_order >= 0),
          CONSTRAINT model_lifecycle_items_name_not_blank_chk
            CHECK (length(btrim(name)) > 0),
          CONSTRAINT model_lifecycle_items_config_is_object_chk
            CHECK (jsonb_typeof(config) = 'object')
        );
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_items_org_id
          ON verifywise.model_lifecycle_items(organization_id);
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_items_phase_id
          ON verifywise.model_lifecycle_items(organization_id, phase_id);
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_items_active
          ON verifywise.model_lifecycle_items(organization_id, phase_id, display_order)
          WHERE is_active = TRUE;
        `,
        { transaction },
      );

      // Per (model, item) captured value. At least one of value_text /
      // value_json / linked children (files, people, approvals) is expected
      // — enforced at the app layer since child-existence checks aren't a
      // sane row-level constraint.
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.model_lifecycle_values (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_inventory_id       INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
          item_id                  INTEGER NOT NULL REFERENCES verifywise.model_lifecycle_items(id) ON DELETE CASCADE,
          value_text               TEXT,
          value_json               JSONB,
          updated_by               INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT model_lifecycle_values_org_model_item_unique
            UNIQUE(organization_id, model_inventory_id, item_id)
        );
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_values_org_id
          ON verifywise.model_lifecycle_values(organization_id);
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_values_model_id
          ON verifywise.model_lifecycle_values(organization_id, model_inventory_id);
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_values_item_id
          ON verifywise.model_lifecycle_values(item_id);
        `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.model_lifecycle_item_files (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          value_id                 INTEGER NOT NULL REFERENCES verifywise.model_lifecycle_values(id) ON DELETE CASCADE,
          file_id                  INTEGER NOT NULL REFERENCES verifywise.files(id) ON DELETE CASCADE,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT model_lifecycle_item_files_org_value_file_unique
            UNIQUE(organization_id, value_id, file_id)
        );
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_item_files_value_id
          ON verifywise.model_lifecycle_item_files(value_id);
        `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.model_lifecycle_item_people (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          value_id                 INTEGER NOT NULL REFERENCES verifywise.model_lifecycle_values(id) ON DELETE CASCADE,
          user_id                  INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT model_lifecycle_item_people_org_value_user_unique
            UNIQUE(organization_id, value_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_item_people_value_id
          ON verifywise.model_lifecycle_item_people(value_id);
        `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.model_lifecycle_item_approvals (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          value_id                 INTEGER NOT NULL REFERENCES verifywise.model_lifecycle_values(id) ON DELETE CASCADE,
          user_id                  INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
          status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
          decided_at               TIMESTAMP,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT model_lifecycle_item_approvals_org_value_user_unique
            UNIQUE(organization_id, value_id, user_id),
          CONSTRAINT model_lifecycle_item_approvals_status_chk
            CHECK (status IN ('pending','approved','rejected')),
          -- decided_at MUST be NULL when pending; MUST be set for terminal states.
          CONSTRAINT model_lifecycle_item_approvals_decided_at_consistency_chk
            CHECK ((status = 'pending' AND decided_at IS NULL)
                OR (status <> 'pending' AND decided_at IS NOT NULL))
        );
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_item_approvals_value_id
          ON verifywise.model_lifecycle_item_approvals(value_id);
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_item_approvals_pending
          ON verifywise.model_lifecycle_item_approvals(organization_id, user_id)
          WHERE status = 'pending';
        `,
        { transaction },
      );

      // Change history — FK'd to model_inventories/items with ON DELETE SET NULL
      // so history survives deletion of the source rows but doesn't dangle
      // pointing at non-existent ids.
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.model_lifecycle_change_history (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_inventory_id       INTEGER REFERENCES verifywise.model_inventories(id) ON DELETE SET NULL,
          item_id                  INTEGER REFERENCES verifywise.model_lifecycle_items(id) ON DELETE SET NULL,
          change_type              VARCHAR(50) NOT NULL,
          changed_by               INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          old_value                JSONB,
          new_value                JSONB,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT model_lifecycle_change_history_change_type_chk
            CHECK (change_type IN ('created','updated','deleted','approved',
                                   'rejected','person_added','person_removed',
                                   'file_attached','file_removed'))
        );
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_change_history_org_id
          ON verifywise.model_lifecycle_change_history(organization_id);
        -- History is almost always queried per-model, newest first.
        CREATE INDEX IF NOT EXISTS idx_model_lifecycle_change_history_model
          ON verifywise.model_lifecycle_change_history(organization_id, model_inventory_id, created_at DESC);
        `,
        { transaction },
      );

      // --- jira-assets (3 tables + sequence) -------------------------------
      await sequelize.query(
        `CREATE SEQUENCE IF NOT EXISTS verifywise.jira_use_case_uc_id_seq START 1;`,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.jira_assets_config (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          jira_base_url            VARCHAR(500) NOT NULL,
          workspace_id             VARCHAR(100) NOT NULL,
          email                    VARCHAR(255) NOT NULL,
          api_token_encrypted      TEXT NOT NULL,
          api_token_iv             VARCHAR(50) NOT NULL,
          deployment_type          VARCHAR(20) NOT NULL DEFAULT 'cloud',
          selected_schema_id       VARCHAR(100),
          selected_object_type_id  VARCHAR(100),
          attribute_mappings       JSONB NOT NULL DEFAULT '{}'::jsonb,
          sync_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
          sync_interval_hours      INTEGER NOT NULL DEFAULT 24,
          last_sync_at             TIMESTAMP,
          last_sync_status         VARCHAR(20),
          last_sync_message        TEXT,
          created_by               INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          updated_by               INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT jira_assets_config_org_unique UNIQUE (organization_id),
          CONSTRAINT jira_assets_config_deployment_type_chk
            CHECK (deployment_type IN ('cloud','datacenter')),
          CONSTRAINT jira_assets_config_last_sync_status_chk
            CHECK (last_sync_status IS NULL OR last_sync_status IN ('success','failed')),
          CONSTRAINT jira_assets_config_sync_interval_range_chk
            CHECK (sync_interval_hours >= 1 AND sync_interval_hours <= 168),
          CONSTRAINT jira_assets_config_jira_base_url_format_chk
            CHECK (jira_base_url ~* '^https?://'),
          CONSTRAINT jira_assets_config_email_format_chk
            CHECK (email ~* '^[^@]+@[^@]+\\.[^@]+$'),
          CONSTRAINT jira_assets_config_api_token_encrypted_not_blank_chk
            CHECK (length(api_token_encrypted) > 0),
          CONSTRAINT jira_assets_config_attribute_mappings_is_object_chk
            CHECK (jsonb_typeof(attribute_mappings) = 'object')
        );
        `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.jira_assets_use_cases (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          jira_object_id           VARCHAR(100) NOT NULL,
          project_id               INTEGER REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          data                     JSONB NOT NULL,
          last_synced_at           TIMESTAMP,
          sync_status              VARCHAR(20) NOT NULL DEFAULT 'synced',
          created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT jira_assets_use_cases_org_object_unique
            UNIQUE (organization_id, jira_object_id),
          CONSTRAINT jira_assets_use_cases_sync_status_chk
            CHECK (sync_status IN ('synced','pending','failed','stale')),
          CONSTRAINT jira_assets_use_cases_data_is_object_chk
            CHECK (jsonb_typeof(data) = 'object')
        );
        CREATE INDEX IF NOT EXISTS idx_jira_use_cases_org_id
          ON verifywise.jira_assets_use_cases(organization_id);
        CREATE INDEX IF NOT EXISTS idx_jira_use_cases_jira_object_id
          ON verifywise.jira_assets_use_cases(organization_id, jira_object_id);
        CREATE INDEX IF NOT EXISTS idx_jira_use_cases_sync_status
          ON verifywise.jira_assets_use_cases(organization_id, sync_status);
        -- Reverse lookup: given a native project id, is it JIRA-sourced?
        -- Used by the JIRA use-case detail route (getUseCaseByProjectId).
        CREATE INDEX IF NOT EXISTS idx_jira_use_cases_project_id
          ON verifywise.jira_assets_use_cases(project_id)
          WHERE project_id IS NOT NULL;
        `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.jira_assets_sync_history (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          sync_type                VARCHAR(20) NOT NULL,
          status                   VARCHAR(20) NOT NULL,
          objects_fetched          INTEGER NOT NULL DEFAULT 0,
          objects_created          INTEGER NOT NULL DEFAULT 0,
          objects_updated          INTEGER NOT NULL DEFAULT 0,
          objects_deleted          INTEGER NOT NULL DEFAULT 0,
          error_message            TEXT,
          started_at               TIMESTAMP NOT NULL,
          completed_at             TIMESTAMP,
          triggered_by             INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          CONSTRAINT jira_assets_sync_history_sync_type_chk
            CHECK (sync_type IN ('manual','scheduled')),
          CONSTRAINT jira_assets_sync_history_status_chk
            CHECK (status IN ('started','completed','failed')),
          CONSTRAINT jira_assets_sync_history_counters_nonneg_chk
            CHECK (objects_fetched >= 0 AND objects_created >= 0
               AND objects_updated >= 0 AND objects_deleted >= 0),
          CONSTRAINT jira_assets_sync_history_completed_at_consistency_chk
            CHECK ((status = 'started' AND completed_at IS NULL)
                OR (status <> 'started' AND completed_at IS NOT NULL)),
          CONSTRAINT jira_assets_sync_history_error_message_when_failed_chk
            CHECK (status <> 'failed' OR error_message IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS idx_jira_sync_history_org_id
          ON verifywise.jira_assets_sync_history(organization_id);
        -- Sync history is always shown newest-first.
        CREATE INDEX IF NOT EXISTS idx_jira_sync_history_recent
          ON verifywise.jira_assets_sync_history(organization_id, started_at DESC);
        `,
        { transaction },
      );

      await transaction.commit();
      console.log("✅ Extensions migration complete");
    } catch (err) {
      await transaction.rollback();
      console.error("❌ Extensions migration failed", err);
      throw err;
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.plugin_installations (
          id                       SERIAL PRIMARY KEY,
          organization_id          INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          plugin_key               VARCHAR(100) NOT NULL,
          status                   VARCHAR(20) DEFAULT 'installed',
          installed_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          error_message            TEXT,
          configuration            JSONB,
          metadata                 JSONB,
          created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(organization_id, plugin_key)
        );
        `,
        { transaction },
      );

      await sequelize.query(
        `
        INSERT INTO verifywise.plugin_installations
          (organization_id, plugin_key, status, installed_at, configuration, created_at, updated_at)
        SELECT ee.organization_id,
               e.key,
               CASE WHEN ee.enabled THEN 'installed' ELSE 'uninstalled' END,
               COALESCE(ee.enabled_at, ee.created_at),
               ee.configuration,
               ee.created_at,
               ee.updated_at
          FROM verifywise.extension_enablements ee
          JOIN verifywise.extensions e ON e.id = ee.extension_id;
        `,
        { transaction },
      );

      const dropped = [
        "jira_assets_sync_history",
        "jira_assets_use_cases",
        "jira_assets_config",
        "model_lifecycle_change_history",
        "model_lifecycle_item_approvals",
        "model_lifecycle_item_people",
        "model_lifecycle_item_files",
        "model_lifecycle_values",
        "model_lifecycle_items",
        "model_lifecycle_phases",
        "azure_ai_model_records",
        "extension_enablements",
        "extension_config_fields",
        "extensions",
      ];
      for (const t of dropped) {
        await sequelize.query(`DROP TABLE IF EXISTS verifywise.${t} CASCADE;`, { transaction });
      }
      await sequelize.query(`DROP SEQUENCE IF EXISTS verifywise.jira_use_case_uc_id_seq;`, {
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
