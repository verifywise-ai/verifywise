"use strict";

/**
 * Phase 3 — Agent Memory System
 * Creates tables for three-tier agent memory:
 * 1. Message history (short-term)
 * 2. Working memory (medium-term)
 * 3. Semantic memory (long-term)
 */
module.exports = {
  async up(queryInterface) {
    // 1. Message history — short-term conversation context
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_message_history (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        agent_name VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES verifywise.users(id),
        session_id VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_msg_session
        ON verifywise.agent_message_history(agent_name, organization_id, session_id, created_at DESC);
    `);

    // 2. Working memory — medium-term task state
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_working_memory (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        agent_name VARCHAR(100) NOT NULL,
        task_id VARCHAR(255) NOT NULL,
        key VARCHAR(255) NOT NULL,
        value JSONB NOT NULL,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, agent_name, task_id, key)
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_working_mem
        ON verifywise.agent_working_memory(agent_name, organization_id, task_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_working_mem_expires
        ON verifywise.agent_working_memory(expires_at)
        WHERE expires_at IS NOT NULL;
    `);

    // 3. Semantic memory — long-term recall (vector search ready)
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_semantic_memory (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        agent_name VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_semantic_mem
        ON verifywise.agent_semantic_memory(agent_name, organization_id, created_at DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.agent_semantic_memory;`);
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.agent_working_memory;`);
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.agent_message_history;`);
  },
};
