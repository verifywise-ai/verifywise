"use strict";

/**
 * Phase 2 — Bridge AI Action Approvals with Approval Requests
 *
 * Adds approval_request_id column to ai_action_approvals to link
 * AI actions with the existing approval workflow system.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_action_approvals
        ADD COLUMN IF NOT EXISTS approval_request_id INTEGER
          REFERENCES verifywise.approval_requests(id) ON DELETE SET NULL;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_action_approvals_request_id
        ON verifywise.ai_action_approvals(approval_request_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_action_approvals
        DROP COLUMN IF EXISTS approval_request_id;
    `);
  },
};
