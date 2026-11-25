"use strict";

// A finding says whether its sources are search results that nobody confirmed on a page: the check
// after the analysis reads the page of the best source of a finding that cites snippets alone, and
// marks the finding when the page does not hold the quote or could not be read. A finding from
// before the column, and one that rests on a page, is not marked.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_risk_findings
        ADD COLUMN IF NOT EXISTS snippet_only BOOLEAN NOT NULL DEFAULT FALSE;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_risk_findings
        DROP COLUMN IF EXISTS snippet_only;
    `);
  },
};
