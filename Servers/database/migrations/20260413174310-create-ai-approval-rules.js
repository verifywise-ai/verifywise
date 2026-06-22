"use strict";

/**
 * Phase 2 — Auto-Approve Rule Engine
 * Creates the ai_approval_rules table for tenant-customizable approval rules.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_approval_rules (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        conditions JSONB NOT NULL DEFAULT '{}',
        event_type VARCHAR(50) NOT NULL
          CHECK (event_type IN ('auto-approve', 'require-approval', 'auto-reject')),
        event_params JSONB DEFAULT '{}',
        priority INTEGER NOT NULL DEFAULT 100,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_by INTEGER REFERENCES verifywise.users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_approval_rules_org_active
        ON verifywise.ai_approval_rules(organization_id, is_active);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_approval_rules_priority
        ON verifywise.ai_approval_rules(organization_id, priority DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.ai_approval_rules;
    `);
  },
};
