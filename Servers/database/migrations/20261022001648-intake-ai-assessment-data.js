"use strict";

/**
 * Intake: data for AI-assisted risk assessment, after
 * 20261021120000-intake-ai-assessment added the columns.
 *
 * 1. Existing submissions were emailed at submit, so their notification
 *    claim is marked as sent. The worker-start backfill emails a pending
 *    submission whose claim is still NULL (its job was lost). The code before
 *    this release never queued intake jobs, so nothing is in flight when the
 *    two intake migrations run together.
 * 2. A pending submission's band override saved under the pre-v2 tiers moves
 *    to the band covering the same scores (Minimal -> Low, Limited -> Medium,
 *    Unacceptable -> Critical), in risk_override and risk_tier. The backfill
 *    scores these submissions as v2, where an override is always a band.
 *    Decided submissions keep their history.
 *
 * Down is a no-op: neither change can be told apart from later writes.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        UPDATE verifywise.intake_submissions
          SET notification_sent_at = created_at
          WHERE notification_sent_at IS NULL;
      `);
      await run(`
        UPDATE verifywise.intake_submissions s
          SET risk_override = jsonb_set(s.risk_override, '{tier}', to_jsonb(m.band)),
              risk_tier = m.band,
              updated_at = NOW()
          FROM (VALUES ('Minimal', 'Low'), ('Limited', 'Medium'), ('Unacceptable', 'Critical'))
            AS m(tier, band)
          WHERE s.status = 'pending' AND s.risk_override->>'tier' = m.tier;
      `);
    });
  },

  async down() {},
};
