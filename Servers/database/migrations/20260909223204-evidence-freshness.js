"use strict";

/**
 * Evidence freshness: evidence_hub gains a risk mapping (the risk<->evidence
 * link the product has never had), risks gain a nullable staleness flag written
 * only by the nightly sweep, and the notification enum gains the value the
 * sweep delivers.
 *
 * Down drops the two columns. Removing a Postgres enum value requires recreating
 * the type and migrating every column that uses it, so that half is a no-op --
 * same decision as 20260711090100-add-mrm-revalidation-due-notification-type.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_hub
        ADD COLUMN IF NOT EXISTS mapped_risk_ids INTEGER[];
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risks
        ADD COLUMN IF NOT EXISTS evidence_stale_at TIMESTAMPTZ;
    `);
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'evidence_stale';`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.risks DROP COLUMN IF EXISTS evidence_stale_at;`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.evidence_hub DROP COLUMN IF EXISTS mapped_risk_ids;`,
    );
    // Enum value removal: no-op. See header comment.
  },
};
