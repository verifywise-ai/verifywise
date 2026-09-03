"use strict";

/**
 * Evidence Hub retention — extend the notification enums so the daily
 * evidence_expiry_sweep job can deliver an in-app/email notification when a
 * record passes its expiry_date.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the
 * type and migrating every column that uses it — risky for a fix-forward
 * migration (same rationale as the mrm_revalidation_due migration).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'evidence_expired';`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_entity_type ADD VALUE IF NOT EXISTS 'evidence';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
