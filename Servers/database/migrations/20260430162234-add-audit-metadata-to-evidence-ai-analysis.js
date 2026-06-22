"use strict";

/**
 * Add `audit_metadata JSONB` column to evidence_ai_analysis.
 *
 * The Evidence Analyzer v2 produces detailed audit data:
 *   - per-dimension rationales (relevance / completeness / specificity / recency / reliability)
 *   - LLM-detected document signals (authority, draft, version, dates, metrics, owner)
 *   - quote-grounded findings (text + verbatim evidence_quote + relevance level)
 *   - abstain reason (if document was unscoreable)
 *   - char_count, truncated flag, analyzer_version
 *
 * Storing this in a JSONB column keeps the existing analysis row contract
 * intact while making "Why this score?" UI affordances and calibration
 * regression tests possible.
 *
 * Existing rows default to NULL — backward compatible. The frontend treats
 * NULL audit_metadata as "no rationale available" and hides the expander.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_ai_analysis
        ADD COLUMN IF NOT EXISTS audit_metadata JSONB
    `);

    // GIN index lets us query by abstain_reason / analyzer_version for
    // calibration tooling without scanning the whole table.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS evidence_ai_analysis_audit_metadata_gin
        ON verifywise.evidence_ai_analysis USING GIN (audit_metadata)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.evidence_ai_analysis_audit_metadata_gin
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_ai_analysis
        DROP COLUMN IF EXISTS audit_metadata
    `);
  },
};
