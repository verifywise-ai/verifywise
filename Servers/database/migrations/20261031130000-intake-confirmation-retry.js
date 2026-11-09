"use strict";

/**
 * Intake: review time at submit and retries for the submitter's confirmation.
 *
 * intake_submissions.review_days is the form's review time in force at submit,
 * stored next to review_due_date so the email never reads the form's later
 * setting. confirmation_attempts counts failed sends of the confirmation and
 * confirmation_next_attempt_at is when the sweep may try again; after the last
 * retry the sweep gives up.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_submissions
        ADD COLUMN IF NOT EXISTS review_days INTEGER NULL,
        ADD COLUMN IF NOT EXISTS confirmation_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS confirmation_next_attempt_at TIMESTAMPTZ NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_submissions
        DROP COLUMN IF EXISTS confirmation_next_attempt_at,
        DROP COLUMN IF EXISTS confirmation_attempts,
        DROP COLUMN IF EXISTS review_days;
    `);
  },
};
