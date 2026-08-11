"use strict";

/**
 * Evidence AI quality: switch from a 0-100 integer score to an A–F letter grade.
 * Drops the numeric overall_quality_score column (and its index) and adds
 * overall_quality_grade VARCHAR(2) with its own index. quality_score JSONB now
 * holds per-dimension letters instead of numbers (no DDL change needed for it).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.idx_evidence_ai_quality;
      ALTER TABLE verifywise.evidence_ai_analysis DROP COLUMN IF EXISTS overall_quality_score;
      ALTER TABLE verifywise.evidence_ai_analysis ADD COLUMN IF NOT EXISTS overall_quality_grade VARCHAR(2);
      CREATE INDEX IF NOT EXISTS idx_evidence_ai_quality_grade
        ON verifywise.evidence_ai_analysis (overall_quality_grade, organization_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.idx_evidence_ai_quality_grade;
      ALTER TABLE verifywise.evidence_ai_analysis DROP COLUMN IF EXISTS overall_quality_grade;
      ALTER TABLE verifywise.evidence_ai_analysis ADD COLUMN IF NOT EXISTS overall_quality_score INTEGER;
      CREATE INDEX IF NOT EXISTS idx_evidence_ai_quality
        ON verifywise.evidence_ai_analysis (overall_quality_score, organization_id);
    `);
  },
};
