"use strict";

/**
 * Stamps for the daily policy review reminder sweep (audit P-H3, P-M2).
 *
 * The sweep reminds a policy's owner and reviewers once when its review date
 * comes within seven days and once when it passes. Each stamp records that
 * the reminder of its kind went out, so a re-run does not send it twice.
 * Changing the review date clears both, so the new date is reminded again.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.policy_manager
        ADD COLUMN IF NOT EXISTS due_soon_reminded_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS overdue_reminded_at TIMESTAMPTZ NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.policy_manager
        DROP COLUMN IF EXISTS due_soon_reminded_at,
        DROP COLUMN IF EXISTS overdue_reminded_at;
    `);
  },
};
