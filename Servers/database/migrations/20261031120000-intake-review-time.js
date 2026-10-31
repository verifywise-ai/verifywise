"use strict";

/**
 * Intake: agreed review time and the submitter's confirmation email.
 *
 * intake_forms.review_days is the per-form review time in business days
 * (1–30, default 3), named in the submitter's confirmation email.
 * intake_submissions.review_days and review_due_date are the review time in
 * force at submit and the date it runs out, so the email and dashboards never
 * read the form's current value. intake_submissions.confirmation_sent_at is the one-time
 * claim for the submitter's confirmation email, which now waits for routing.
 * Submissions made before this migration already had their confirmation, so
 * they are marked as sent and are never emailed again.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        ALTER TABLE verifywise.intake_forms
          ADD COLUMN IF NOT EXISTS review_days INTEGER NOT NULL DEFAULT 3;
      `);
      await run(`
        ALTER TABLE verifywise.intake_forms
          DROP CONSTRAINT IF EXISTS intake_forms_review_days_range;
      `);
      await run(`
        ALTER TABLE verifywise.intake_forms
          ADD CONSTRAINT intake_forms_review_days_range CHECK (review_days BETWEEN 1 AND 30);
      `);
      await run(`
        ALTER TABLE verifywise.intake_submissions
          ADD COLUMN IF NOT EXISTS review_days INTEGER NULL,
          ADD COLUMN IF NOT EXISTS review_due_date DATE NULL,
          ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ NULL;
      `);
      await run(`
        UPDATE verifywise.intake_submissions
          SET confirmation_sent_at = COALESCE(created_at, NOW())
          WHERE confirmation_sent_at IS NULL;
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        ALTER TABLE verifywise.intake_submissions
          DROP COLUMN IF EXISTS confirmation_sent_at,
          DROP COLUMN IF EXISTS review_due_date,
          DROP COLUMN IF EXISTS review_days;
      `);
      await run(`
        ALTER TABLE verifywise.intake_forms
          DROP CONSTRAINT IF EXISTS intake_forms_review_days_range,
          DROP COLUMN IF EXISTS review_days;
      `);
    });
  },
};
