"use strict";

/**
 * Add columns to the regulation_tracker_meta singleton to cache the three
 * global, non-tenant feeds the Regulations Tracker mirrors from the website:
 *  - horizon    : the curated dated changelog (/api/regulations/horizon)
 *  - deadlines  : forward-looking effective-date milestones (/api/regulations/deadlines)
 *  - frameworks : the international AI governance frameworks (/api/regulations/snapshot -> frameworks)
 *
 * These are public reference data identical for every org, so they live on the
 * existing global singleton (id=1) rather than a tenant table. Stored as JSONB
 * so the Browse/Horizon/Deadlines/Frameworks pages render from our DB
 * (offline-safe), with the weekly sync refreshing them.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.regulation_tracker_meta
        ADD COLUMN IF NOT EXISTS horizon    JSONB,
        ADD COLUMN IF NOT EXISTS deadlines  JSONB,
        ADD COLUMN IF NOT EXISTS frameworks JSONB;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.regulation_tracker_meta
        DROP COLUMN IF EXISTS horizon,
        DROP COLUMN IF EXISTS deadlines,
        DROP COLUMN IF EXISTS frameworks;
    `);
  },
};
