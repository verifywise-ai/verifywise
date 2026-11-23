"use strict";

/**
 * Vendor research: the live progress of a run. A running run writes where it is (the phase, the
 * turns of the research loop, the searches and the pages so far, the categories worked on) at every
 * step, and the page reads it while the run is going. It holds counts and closed words only, and no
 * run keeps it after it ends, so the column is NULL for every row that is not running.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_research_runs
        ADD COLUMN IF NOT EXISTS progress JSONB;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_research_runs
        DROP COLUMN IF EXISTS progress;
    `);
  },
};
