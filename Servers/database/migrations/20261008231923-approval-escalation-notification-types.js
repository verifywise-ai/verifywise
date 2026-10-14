"use strict";

/**
 * Approval SLA escalation & auto-approval: the notification enum gains the
 * two values the overdue-approval sweep and the auto-approval path deliver --
 * one for an overdue step escalated to its designated user, one telling the
 * requester their request was auto-approved by risk level. They are used
 * later, in their own transactions: Postgres does not let a newly added enum
 * value be used in the same transaction that adds it, so do not seed or
 * notify inside this migration.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the
 * type and migrating every column that uses it -- same decision as
 * 20260911085503-deadline-escalation-notification-types.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'approval_step_overdue_escalation';`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'approval_auto_approved';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
