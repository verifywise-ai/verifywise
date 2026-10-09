"use strict";

/**
 * Multiple owners per agent primitive.
 *
 * An agent's single `owner_id` (on agent_primitives) remains the PRIMARY owner
 * for backward compatibility. This junction table holds the full set of
 * accountable owners (including the primary), so an agent can have several
 * people responsible for it.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_primitive_owners (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        agent_primitive_id INTEGER NOT NULL
          REFERENCES verifywise.agent_primitives(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (organization_id, agent_primitive_id, user_id)
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_primitive_owners_agent
        ON verifywise.agent_primitive_owners (organization_id, agent_primitive_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.agent_primitive_owners;");
  },
};
