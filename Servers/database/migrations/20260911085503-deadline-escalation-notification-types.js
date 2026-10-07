"use strict";

/**
 * Deadline & SLA escalation: the notification enum gains the two values the
 * deadline sweep delivers -- one for project-risk deadlines, one for model
 * risk target dates. The sweep uses them later, in its own transactions:
 * Postgres does not let a newly added enum value be used in the same
 * transaction that adds it, so do not seed or notify inside this migration.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the
 * type and migrating every column that uses it -- same decision as
 * 20260711090100-add-mrm-revalidation-due-notification-type.js,
 * 20260909223204-evidence-freshness.js and
 * 20260910092735-model-risk-candidate-notification-type.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'risk_deadline_due_soon';`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'model_risk_due_soon';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
