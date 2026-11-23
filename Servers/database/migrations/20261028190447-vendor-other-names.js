"use strict";

// A vendor can list the other names it is known by ("Facebook" for "Meta Platforms"), as a text of
// names separated by commas. The research names the vendor by them as well, so a source that uses
// only one of them is still a source about the vendor. A vendor from before the column has none.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendors
        ADD COLUMN IF NOT EXISTS other_names TEXT;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendors
        DROP COLUMN IF EXISTS other_names;
    `);
  },
};
