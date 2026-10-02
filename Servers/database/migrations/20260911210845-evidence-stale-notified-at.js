"use strict";

/**
 * Evidence-freshness notification retry.
 *
 * The flag (`risks.evidence_stale_at`) is set and cleared by the sweep, and the
 * sweep notifies only on the transition. If the notification delivery fails the
 * flag write has already committed, so the transition gate suppressed every
 * later attempt and the owner was never told. This adds a sent-record so a
 * failed delivery is retried on the next run: `evidence_stale_notified_at`
 * trails `evidence_stale_at` until a send succeeds, then advances to it.
 *
 * Down drops the column.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risks
        ADD COLUMN IF NOT EXISTS evidence_stale_notified_at TIMESTAMPTZ;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risks
        DROP COLUMN IF EXISTS evidence_stale_notified_at;
    `);
  },
};
