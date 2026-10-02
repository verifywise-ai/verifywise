"use strict";

/**
 * Vendor risk candidate notices: the notification enum gains the value sent
 * when a vendor gains a use case (or a new vendor risk lands on a vendor that
 * already has use cases) and project risks in those use cases could inherit
 * from that vendor's risks. The vendor counterpart of model_risk_candidates.
 *
 * Its own migration, apart from the index that names the value: a new enum
 * value cannot be used until the statement that added it has committed.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the type
 * and migrating every column that uses it -- same decision as
 * 20260910092735-model-risk-candidate-notification-type.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'vendor_risk_candidates';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
