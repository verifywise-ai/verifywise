"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_impact_analysis (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        country_slug     VARCHAR(120) NOT NULL,
        regulation_hash  VARCHAR(120) NOT NULL,
        result           JSONB,
        status           VARCHAR(120) NOT NULL,
        model            VARCHAR(255),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        refreshed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, country_slug)
      );
    `);
    // NOTE: no explicit index on (organization_id, country_slug) — the UNIQUE
    // constraint above already creates a B-tree index on exactly those columns,
    // which serves every lookup (all reads are by org+slug). A separate index
    // would be a pure duplicate (extra storage + write cost, no query benefit).
    // Settings columns for the impact toggle + last-run line (§5a)
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.regulation_tracker_settings
        ADD COLUMN IF NOT EXISTS impact_enabled      BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS last_impact_run_at  TIMESTAMPTZ;
    `);
  },
  async down(queryInterface) {
    // ALTER TABLE IF EXISTS so an out-of-order rollback (settings table already
    // dropped by an earlier migration's down) is a no-op instead of throwing.
    await queryInterface.sequelize.query(`
      ALTER TABLE IF EXISTS verifywise.regulation_tracker_settings
        DROP COLUMN IF EXISTS impact_enabled,
        DROP COLUMN IF EXISTS last_impact_run_at;
    `);
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.regulation_impact_analysis;
    `);
  },
};
