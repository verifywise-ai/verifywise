"use strict";

// A finding says why it has the likelihood and the severity it has: one sentence by the model. A
// finding from before the column, and one whose model gave none, has no rationale.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_risk_findings
        ADD COLUMN IF NOT EXISTS rationale TEXT;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_risk_findings
        DROP COLUMN IF EXISTS rationale;
    `);
  },
};
