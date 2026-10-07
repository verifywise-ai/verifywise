"use strict";

/**
 * Add changed_by_system to the change-history tables written by
 * utils/changeHistory.base.utils.ts.
 *
 * changed_by_user_id is NULL both for a change made by an unattended job (for
 * example the nightly evidence-freshness sweep downgrading a mitigation) and
 * for a change by a user who was later deleted (ON DELETE SET NULL). This flag
 * tells the two apart so the history panel can say "System" instead of
 * "Deleted User". Existing rows were all made by people, so the default is
 * false and no row is rewritten.
 *
 * The two ai_gateway_*_change_history tables are owned by the AI Gateway's
 * Alembic migrations and are deliberately left alone. A table that does not
 * exist on this install is skipped.
 */
const TABLES = [
  "dataset_change_histories",
  "evidence_hub_change_history",
  "file_change_history",
  "framework_change_history",
  "incident_change_history",
  "model_inventory_change_history",
  "model_lifecycle_change_history",
  "model_risk_change_history",
  "policy_change_history",
  "project_change_history",
  "project_risk_change_history",
  "task_change_history",
  "training_change_history",
  "use_case_change_history",
  "vendor_change_history",
  "vendor_risk_change_history",
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of TABLES) {
        await queryInterface.sequelize.query(
          `DO $$
           BEGIN
             IF to_regclass('verifywise.${table}') IS NOT NULL THEN
               ALTER TABLE verifywise.${table}
                 ADD COLUMN IF NOT EXISTS changed_by_system BOOLEAN NOT NULL DEFAULT false;
             END IF;
           END $$;`,
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of TABLES) {
        await queryInterface.sequelize.query(
          `DO $$
           BEGIN
             IF to_regclass('verifywise.${table}') IS NOT NULL THEN
               ALTER TABLE verifywise.${table} DROP COLUMN IF EXISTS changed_by_system;
             END IF;
           END $$;`,
          { transaction },
        );
      }
    });
  },
};
