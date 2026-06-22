"use strict";

/**
 * Phase 2 — XState Approval State Machine
 * Creates the ai_action_approvals table for persisting approval state machine state.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_action_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        tool_name VARCHAR(255) NOT NULL,
        input_params JSONB NOT NULL DEFAULT '{}',
        risk_level VARCHAR(20) NOT NULL,
        state VARCHAR(50) NOT NULL DEFAULT 'idle',
        rule_matched VARCHAR(255),
        requested_by INTEGER REFERENCES verifywise.users(id),
        approved_by INTEGER REFERENCES verifywise.users(id),
        approved_at TIMESTAMPTZ,
        executed_at TIMESTAMPTZ,
        result JSONB,
        error_message TEXT,
        state_history JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_action_approvals_state_org
        ON verifywise.ai_action_approvals(state, organization_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_action_approvals_requested_by_org
        ON verifywise.ai_action_approvals(requested_by, organization_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_action_approvals_tool_org
        ON verifywise.ai_action_approvals(tool_name, organization_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.ai_action_approvals;
    `);
  },
};
