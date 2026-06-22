"use strict";

/**
 * Phase 2 — AI Action Audit Trail
 * Creates the ai_action_audit_log table for recording every state transition.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_action_audit_log (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        action_approval_id UUID
          REFERENCES verifywise.ai_action_approvals(id) ON DELETE CASCADE,
        from_state VARCHAR(50),
        to_state VARCHAR(50) NOT NULL,
        actor_type VARCHAR(20) NOT NULL,
        actor_id INTEGER,
        rule_name VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_audit_log_org_created
        ON verifywise.ai_action_audit_log(organization_id, created_at DESC);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_audit_log_action
        ON verifywise.ai_action_audit_log(action_approval_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_audit_log_state
        ON verifywise.ai_action_audit_log(to_state, organization_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.ai_action_audit_log;
    `);
  },
};
