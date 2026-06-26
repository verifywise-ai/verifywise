"use strict";

/**
 * Add run-observability columns to the regulation_tracker_meta singleton so the
 * app can show when the weekly sync last ran and whether it succeeded. Without
 * these, a feed that is down for weeks (or failing emails) is invisible in-app —
 * only the server logs know.
 *
 *  - last_run_at     : timestamp of the most recent sync attempt (any outcome)
 *  - last_run_status : short outcome string ("ok", "skipped: ...", "fetch failed", etc.)
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.regulation_tracker_meta
        ADD COLUMN IF NOT EXISTS last_run_at     TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_run_status VARCHAR(120);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.regulation_tracker_meta
        DROP COLUMN IF EXISTS last_run_at,
        DROP COLUMN IF EXISTS last_run_status;
    `);
  },
};
