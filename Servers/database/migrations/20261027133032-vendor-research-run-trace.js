"use strict";

module.exports = {
  async up(queryInterface) {
    // What a run did and what became of it (services/vendorResearch/trace.ts). Read by
    // administrators only, so it is not one of the columns that every role gets with a run.
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_runs ADD COLUMN IF NOT EXISTS trace JSONB;",
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_runs DROP COLUMN IF EXISTS trace;",
    );
  },
};
