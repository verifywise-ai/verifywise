"use strict";

/**
 * Stamps for the daily policy review reminder sweep (audit P-H3, P-M2).
 *
 * The sweep reminds a policy's owner and reviewers once when its review date
 * comes within seven days and once when it passes. Each stamp records that
 * the reminder of its kind went out, so a re-run does not send it twice.
 * Changing the review date clears both, so the new date is reminded again.
 *
 * Quiet start: the old jobs never sent overdue reminders, so without a
 * backfill the first run after deploy would send one for every policy whose
 * review date has already passed, and a due soon one for every policy already
 * inside the window (whose people the old jobs may have reminded daily). Those
 * policies are stamped here, in every organization, so the sweep only speaks
 * about reviews that become due or overdue after the deploy. Retired policies
 * (Archived, Deprecated) are skipped, as the sweep skips them. Days are
 * compared as the sweep compares them: next_review_date::date against
 * CURRENT_DATE.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.policy_manager
           ADD COLUMN IF NOT EXISTS due_soon_reminded_at TIMESTAMPTZ NULL,
           ADD COLUMN IF NOT EXISTS overdue_reminded_at TIMESTAMPTZ NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.policy_manager
            SET overdue_reminded_at = now()
          WHERE next_review_date::date < CURRENT_DATE
            AND status IS DISTINCT FROM 'Archived'
            AND status IS DISTINCT FROM 'Deprecated'
            AND overdue_reminded_at IS NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.policy_manager
            SET due_soon_reminded_at = now()
          WHERE next_review_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
            AND status IS DISTINCT FROM 'Archived'
            AND status IS DISTINCT FROM 'Deprecated'
            AND due_soon_reminded_at IS NULL;`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.policy_manager
        DROP COLUMN IF EXISTS due_soon_reminded_at,
        DROP COLUMN IF EXISTS overdue_reminded_at;
    `);
  },
};
