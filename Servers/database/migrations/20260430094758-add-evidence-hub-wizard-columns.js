"use strict";

/**
 * Adds new columns to the evidence_hub table for the post-upload wizard:
 *   - tags (JSONB)          — categorization tags
 *   - framework_ids (TEXT[])— related frameworks (ISO 42001, SOC 2, etc.)
 *   - reviewer_id (INTEGER) — assigned reviewer / owner
 *   - retention_policy (VARCHAR) — retention or review cycle
 *
 * Implements: Issue #3259
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_hub
        ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS framework_ids TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS reviewer_id INTEGER REFERENCES verifywise.users(id),
        ADD COLUMN IF NOT EXISTS retention_policy VARCHAR(100);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_hub
        DROP COLUMN IF EXISTS tags,
        DROP COLUMN IF EXISTS framework_ids,
        DROP COLUMN IF EXISTS reviewer_id,
        DROP COLUMN IF EXISTS retention_policy;
    `);
  },
};
