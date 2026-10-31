"use strict";

/**
 * A machine-readable reason on retention runs, so the Data retention page can
 * tell why a run failed (for example the AI Gateway refusing the purge over
 * its internal key) without matching the stored English error text. Nullable:
 * most runs have no code, and older rows keep none.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.data_retention_runs
        ADD COLUMN IF NOT EXISTS error_code VARCHAR(64);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.data_retention_runs
        DROP COLUMN IF EXISTS error_code;
    `);
  },
};
