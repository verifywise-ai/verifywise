"use strict";

/**
 * Create `agent_embeddings` table for the Phase-2 embedding-based agent
 * router (selectActiveTools in advisor/routing.ts).
 *
 * Mirrors the shape of `control_embeddings`:
 *   - agent_name      : "risk-agent" / "vendor-agent" / etc., from AGENT_TOOL_MAP
 *   - embedding       : JSONB float[] — kept JSON instead of pgvector to avoid
 *                       extension dependency; small-N cosine similarity in JS
 *                       is plenty fast for ≤ 20 agents
 *   - source_hash     : sha256 prefix of the agent's source text (description +
 *                       keywords); changes invalidate the cached embedding
 *   - embedding_model : e.g., "text-embedding-3-small" — lets us add a second
 *                       provider in parallel without losing the first
 *
 * UNIQUE (agent_name, embedding_model) so the same agent can have one row per
 * embedding provider while remaining safe under ON CONFLICT DO UPDATE.
 *
 * No `organization_id` — AGENT_TOOL_MAP is global, so embeddings are too.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_embeddings (
        id SERIAL PRIMARY KEY,
        agent_name VARCHAR(80) NOT NULL,
        embedding JSONB NOT NULL,
        source_hash VARCHAR(64) NOT NULL,
        embedding_model VARCHAR(80) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (agent_name, embedding_model)
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS agent_embeddings_model_idx
        ON verifywise.agent_embeddings (embedding_model)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.agent_embeddings_model_idx
    `);
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.agent_embeddings
    `);
  },
};
