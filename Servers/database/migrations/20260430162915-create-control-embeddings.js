"use strict";

/**
 * Create `control_embeddings` table for the embedding-based control matcher.
 *
 * The Evidence Analyzer's controlMatcher pre-filters candidate controls by
 * semantic similarity to the analysis text. Computing embeddings on every
 * analyze call would burn API budget — so we cache them per (framework, control)
 * row, invalidating via `source_hash` when the source title/description changes.
 *
 * Storage: JSONB float arrays (no pgvector dependency). For our control catalog
 * (~50–100 controls per framework), JSONB + JS-side cosine similarity is fast
 * enough (<10 ms per pre-filter pass).
 *
 * No `organization_id` — control_struct rows are global, so embeddings are too.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.control_embeddings (
        id SERIAL PRIMARY KEY,
        framework_type VARCHAR(50) NOT NULL,
        control_id INTEGER NOT NULL,
        embedding JSONB NOT NULL,
        source_hash VARCHAR(64) NOT NULL,
        embedding_model VARCHAR(80) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (framework_type, control_id, embedding_model)
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS control_embeddings_framework_idx
        ON verifywise.control_embeddings (framework_type)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.control_embeddings_framework_idx
    `);
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.control_embeddings
    `);
  },
};
