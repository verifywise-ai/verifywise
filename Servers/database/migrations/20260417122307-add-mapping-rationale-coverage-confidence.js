'use strict';

/**
 * Adds rationale, coverage, and confidence columns to the
 * master_control_framework_mappings table.
 *
 * - rationale: free-text explanation of why this control satisfies the requirement
 * - coverage: full | partial — whether the control fully or partially covers the requirement
 * - confidence: direct_match | strong_analogy | partial_overlap — transparency about seed quality
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.master_control_framework_mappings
        ADD COLUMN IF NOT EXISTS rationale TEXT,
        ADD COLUMN IF NOT EXISTS coverage VARCHAR(10) DEFAULT 'full'
          CHECK (coverage IN ('full', 'partial')),
        ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'direct_match'
          CHECK (confidence IN ('direct_match', 'strong_analogy', 'partial_overlap'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.master_control_framework_mappings
        DROP COLUMN IF EXISTS confidence,
        DROP COLUMN IF EXISTS coverage,
        DROP COLUMN IF EXISTS rationale;
    `);
  },
};
