"use strict";

/**
 * Model metadata -> model risk candidate notices: the notification enum gains
 * the value the candidate-notice service delivers when a model inventory gains
 * a project (or a new model risk lands on a model that already has projects)
 * and project risks in those projects have unseen model-risk link candidates.
 *
 * Down is a no-op: removing a Postgres enum value requires recreating the type
 * and migrating every column that uses it -- same decision as
 * 20260711090100-add-mrm-revalidation-due-notification-type.js and
 * 20260909223204-evidence-freshness.js.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'model_risk_candidates';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
