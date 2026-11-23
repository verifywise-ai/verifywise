"use strict";

/**
 * Vendor research notices: the notification enum gains the value sent to a vendor's assignee when
 * an automatic research run has stored risk findings for the vendor.
 *
 * Its own migration, apart from the index that names the value: a new enum value cannot be used
 * until the statement that added it has committed.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the type and migrating every
 * column that uses it -- same decision as 20261002145239-vendor-risk-candidate-notification-type.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'vendor_research_findings';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
