"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_runs DROP COLUMN IF EXISTS search_provider;",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_runs ADD COLUMN IF NOT EXISTS pages_read INTEGER NOT NULL DEFAULT 0;",
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_runs DROP COLUMN IF EXISTS pages_read;",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_runs ADD COLUMN IF NOT EXISTS search_provider VARCHAR(255);",
    );
  },
};
