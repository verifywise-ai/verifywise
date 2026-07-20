"use strict";

/**
 * MRM (Model Risk Management) — metric retention (gap #1).
 *
 * mrm_org_settings: org-wide MRM configuration. One row per org, lazily
 * created — a missing row means defaults. Deliberately named generically
 * (not "retention settings") so future MRM-wide toggles (e.g. alert
 * recipients/channels) add columns here instead of spawning new tables.
 *
 * retention_months: how long benign (never warn/breach) mrm_metrics points
 * are kept before the daily prune job removes them. Floor of 13 months —
 * retention can never drop below a one-year examiner cycle + margin
 * (SR 26-2 / SS1/23 / OSFI E-23 monitoring-evidence expectation).
 *
 * idx_mrm_metrics_org_at: the prune job scans (organization_id, at < cutoff);
 * the existing indexes ((org) and (org, model, metric, at)) do not serve an
 * org + at-range scan.
 *
 * Tenant-scoped by organization_id (the PK).
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_org_settings (
          organization_id INTEGER PRIMARY KEY
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          retention_months INTEGER NOT NULL DEFAULT 25
            CHECK (retention_months >= 13),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_metrics_org_at
          ON verifywise.mrm_metrics(organization_id, at);
      `,
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
        "DROP INDEX IF EXISTS verifywise.idx_mrm_metrics_org_at;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.mrm_org_settings CASCADE;",
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
