"use strict";

/**
 * Training assignment reminders (#5260): the notification enum gains one value
 * for due-soon reminders and one for overdue reminders, so the in-app feed can
 * tell them apart from new assignments. The reminder sweep uses them later, in
 * its own transactions: Postgres does not let a newly added enum value be used
 * in the same transaction that adds it, so do not notify inside this migration.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the type
 * and migrating every column that uses it. Same decision as
 * 20260911085503-deadline-escalation-notification-types.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'training_due_soon';`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'training_overdue';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
