"use strict";

/**
 * Intake: live checks storage.
 *
 * intake_forms.live_checks_enabled is the per-form toggle for the hints shown
 * to a submitter while they fill in the public form (default on).
 * intake_submissions.live_checks holds what the submitter saw: rule hints, AI
 * hints with their stage status, and the provenance of any prefilled answers.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        ALTER TABLE verifywise.intake_forms
          ADD COLUMN IF NOT EXISTS live_checks_enabled BOOLEAN NOT NULL DEFAULT true;
      `);
      await run(`
        ALTER TABLE verifywise.intake_submissions
          ADD COLUMN IF NOT EXISTS live_checks JSONB NULL;
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        ALTER TABLE verifywise.intake_submissions
          DROP COLUMN IF EXISTS live_checks;
      `);
      await run(`
        ALTER TABLE verifywise.intake_forms
          DROP COLUMN IF EXISTS live_checks_enabled;
      `);
    });
  },
};
