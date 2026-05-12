"use strict";

/**
 * AI Detection finding suppression and allowlisting (Issue #3518).
 *
 * Adds:
 *   - verifywise.ai_detection_suppressions: org-scoped rules that auto-mark
 *     matching findings during scan completion (forward-only).
 *   - verifywise.ai_detection_findings.suppressed: boolean audit flag set by
 *     the matching engine at insert time.
 *   - verifywise.ai_detection_findings.suppression_rule_id: FK back to the
 *     rule that matched (nullable; SET NULL on rule delete to preserve audit).
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.ai_detection_suppressions (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('exact', 'pattern')),
          field VARCHAR(50) NOT NULL CHECK (field IN ('name', 'finding_type', 'category', 'provider')),
          value TEXT NOT NULL,
          reason TEXT,
          expires_at TIMESTAMP WITH TIME ZONE,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_ai_detection_suppressions_org_field
          ON verifywise.ai_detection_suppressions (organization_id, field);
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_ai_detection_suppressions_expires_at
          ON verifywise.ai_detection_suppressions (expires_at);
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.ai_detection_findings
          ADD COLUMN IF NOT EXISTS suppressed BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS suppression_rule_id INTEGER
            REFERENCES verifywise.ai_detection_suppressions(id) ON DELETE SET NULL;
      `,
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.ai_detection_findings
          DROP COLUMN IF EXISTS suppression_rule_id,
          DROP COLUMN IF EXISTS suppressed;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.ai_detection_suppressions;",
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
