"use strict";

/**
 * MRM (Model Risk Management) — alerts email + config (gaps #2+#3).
 *
 * - mrm_org_settings.alert_email_enabled / breach_auto_open_finding: org-wide
 *   alert config (spec: email OFF by default, in-app always on).
 * - mrm_alert_recipients: org-wide extra alert recipients, notified for every
 *   model on top of the model's MRM roles. Join table (not INTEGER[]) so a
 *   deleted user disappears from the list automatically via FK CASCADE.
 * - mrm_findings.auto_metric: set ONLY by the breach auto-open path; the dedup
 *   key and audit marker for "system-opened". Human findings keep it NULL.
 * - mrm_validations.overdue_notified_at: once-per-lifecycle claim for the
 *   overdue-validation alert (spec §4 amendment 2026-07-11) — the sweep
 *   notifies only when it atomically stamps this from NULL.
 *
 * Tenant-scoped by organization_id throughout.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_org_settings
           ADD COLUMN IF NOT EXISTS alert_email_enabled BOOLEAN NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS breach_auto_open_finding BOOLEAN NOT NULL DEFAULT false;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.mrm_alert_recipients (
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           user_id INTEGER NOT NULL
             REFERENCES verifywise.users(id) ON DELETE CASCADE,
           created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
           PRIMARY KEY (organization_id, user_id)
         );`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_findings
           ADD COLUMN IF NOT EXISTS auto_metric VARCHAR(100);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_mrm_findings_auto_metric
           ON verifywise.mrm_findings(organization_id, model_inventory_id, auto_metric)
           WHERE auto_metric IS NOT NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_validations
           ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMP WITH TIME ZONE;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_validations DROP COLUMN IF EXISTS overdue_notified_at;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_mrm_findings_auto_metric;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_findings DROP COLUMN IF EXISTS auto_metric;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.mrm_alert_recipients CASCADE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_org_settings
           DROP COLUMN IF EXISTS alert_email_enabled,
           DROP COLUMN IF EXISTS breach_auto_open_finding;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
