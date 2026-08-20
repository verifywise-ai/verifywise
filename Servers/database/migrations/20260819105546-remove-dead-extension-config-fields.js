"use strict";

/**
 * Remove misleading pre-enable config_fields for slack and jira-assets.
 *
 * These fields were seeded in 20260811102307-extensions-migration.js and
 * would render as a pre-enable configuration form on the /extensions/:key
 * settings page. But nothing on the backend ever reads them:
 *
 *   slack.routing_type — a per-webhook property. Set at Slack webhook
 *     creation time via slackWebhook.ctrl.ts:285 (writes to
 *     slack_webhooks.routing_type). Never read from
 *     extension_enablements.configuration.
 *
 *   jira-assets.{jira_base_url, workspace_id, email, api_token,
 *                deployment_type, sync_enabled, sync_interval_hours}
 *     — all seven duplicate fields already present in the dedicated
 *     jira_assets_config table, populated post-enable via the
 *     JiraAssetsConfiguration UI. The JIRA service
 *     (jiraAssets.service.ts) queries jira_assets_config exclusively
 *     and never touches extension_enablements.configuration.
 *
 * Effect on UX: after this migration, both extensions behave like
 * model-lifecycle (config_fields = 0, requires_configuration = true).
 * The Extensions catalog card shows "Enable" instead of a misleading
 * "Configure to enable" that would land on a form that configures
 * nothing. Real setup happens post-enable via the dedicated components.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `
        DELETE FROM verifywise.extension_config_fields
         WHERE extension_id IN (
           SELECT id FROM verifywise.extensions WHERE key IN ('slack','jira-assets')
         );
        `,
        { transaction },
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      // Restore the original seed values (verbatim from
      // 20260811102307-extensions-migration.js CONFIG_FIELDS_BY_KEY).
      const CONFIG_FIELDS_BY_KEY = {
        slack: [
          {
            field_key: "routing_type",
            field_type: "multiselect",
            label: "Notification routing",
            help_text:
              "Select which notification categories should be sent to this Slack workspace.",
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
      };

      for (const [key, fields] of Object.entries(CONFIG_FIELDS_BY_KEY)) {
        const [extRows] = await sequelize.query(
          `SELECT id FROM verifywise.extensions WHERE key = :key LIMIT 1;`,
          { transaction, replacements: { key } },
        );
        const extensionId = extRows[0]?.id;
        if (!extensionId) continue;
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

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
