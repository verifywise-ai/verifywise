"use strict";

/**
 * Intake: risk-based review routing storage.
 *
 * intake_forms.routing holds the per-form routing settings (reviewer lanes,
 * threshold, close-call margin, second-review rate). intake_submissions.routing
 * holds the lane decision for one submission, and decision_record freezes the
 * computed vs. in-force band at decision time. The (organization_id,
 * created_at) index backs the oversight weekly buckets.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        ALTER TABLE verifywise.intake_forms
          ADD COLUMN IF NOT EXISTS routing JSONB NULL;
      `);
      await run(`
        ALTER TABLE verifywise.intake_submissions
          ADD COLUMN IF NOT EXISTS routing JSONB NULL,
          ADD COLUMN IF NOT EXISTS decision_record JSONB NULL;
      `);
      await run(`
        CREATE INDEX IF NOT EXISTS idx_intake_submissions_org_created
          ON verifywise.intake_submissions (organization_id, created_at);
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`DROP INDEX IF EXISTS verifywise.idx_intake_submissions_org_created;`);
      await run(`
        ALTER TABLE verifywise.intake_submissions
          DROP COLUMN IF EXISTS decision_record,
          DROP COLUMN IF EXISTS routing;
      `);
      await run(`
        ALTER TABLE verifywise.intake_forms
          DROP COLUMN IF EXISTS routing;
      `);
    });
  },
};
