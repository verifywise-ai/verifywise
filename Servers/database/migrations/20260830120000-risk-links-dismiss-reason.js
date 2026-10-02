"use strict";

module.exports = {
  async up(queryInterface) {
    // Both nullable with no default. NULL means "dismissed without saying
    // why", which is a legitimate expected state, not missing data — the
    // reason is optional on purpose, because a required one just gets the
    // first radio clicked.
    //
    // No CHECK on dismiss_reason: relation_type and status have none on this
    // table either, and the vocabulary lives in
    // Servers/services/riskLinks/dismissReason.ts. dismiss_note carries its
    // width because a length is a storage bound, not a vocabulary.
    //
    // No index. The reporting query is a hand-run aggregate over thousands of
    // rows, not millions; a seq scan is the correct plan.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD COLUMN IF NOT EXISTS dismiss_reason VARCHAR(20),
        ADD COLUMN IF NOT EXISTS dismiss_note   VARCHAR(500);
    `);
  },

  async down(queryInterface) {
    // Unlike the C1 migration there is nothing to preserve: the columns did
    // not exist before, so nothing is lost that this migration did not add.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        DROP COLUMN IF EXISTS dismiss_reason,
        DROP COLUMN IF EXISTS dismiss_note;
    `);
  },
};
