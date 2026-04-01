'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // verifywise.agent_primitives
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_primitives (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        source_system VARCHAR(100) NOT NULL DEFAULT 'manual',
        primitive_type VARCHAR(100) NOT NULL,
        external_id VARCHAR(500) NOT NULL,
        display_name VARCHAR(500) NOT NULL,
        owner_id VARCHAR(255),
        permissions JSONB NOT NULL DEFAULT '[]',
        permission_categories JSONB NOT NULL DEFAULT '[]',
        last_activity TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}',
        review_status VARCHAR(50) NOT NULL DEFAULT 'unreviewed',
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        linked_model_inventory_id INTEGER,
        is_stale BOOLEAN NOT NULL DEFAULT false,
        is_manual BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, source_system, external_id)
      )
    `);

    // verifywise.agent_discovery_sync_log
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_discovery_sync_log (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        source_system VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'running',
        primitives_found INTEGER NOT NULL DEFAULT 0,
        primitives_created INTEGER NOT NULL DEFAULT 0,
        primitives_updated INTEGER NOT NULL DEFAULT 0,
        primitives_stale_flagged INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        triggered_by VARCHAR(100) NOT NULL DEFAULT 'system',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);

    // verifywise.agent_audit_log
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_audit_log (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        agent_primitive_id INTEGER NOT NULL REFERENCES verifywise.agent_primitives(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        field_changed VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        performed_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_primitives_org ON verifywise.agent_primitives(organization_id);
      CREATE INDEX IF NOT EXISTS idx_agent_primitives_review ON verifywise.agent_primitives(organization_id, review_status);
      CREATE INDEX IF NOT EXISTS idx_agent_sync_log_org ON verifywise.agent_discovery_sync_log(organization_id);
      CREATE INDEX IF NOT EXISTS idx_agent_audit_log_agent ON verifywise.agent_audit_log(agent_primitive_id);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.agent_audit_log CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.agent_discovery_sync_log CASCADE');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.agent_primitives CASCADE');
  }
};
