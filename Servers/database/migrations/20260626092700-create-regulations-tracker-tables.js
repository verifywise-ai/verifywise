"use strict";

/**
 * Regulations Tracker module tables.
 *
 * `regulation_countries` and `regulation_tracker_meta` are GLOBAL (no
 * organization_id): the Global AI Regulations feed is public reference data,
 * identical for every org. Tenancy is enforced only on
 * `regulation_tracked_countries` and `regulation_tracker_settings`.
 *
 * Tracking links to a country by `country_slug` (the feed's stable identity),
 * intentionally WITHOUT a foreign key, so a feed re-import can never
 * cascade-delete durable user tracking.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_countries (
        id                SERIAL PRIMARY KEY,
        slug              VARCHAR(120) NOT NULL UNIQUE,
        name              VARCHAR(255) NOT NULL,
        region            VARCHAR(50),
        regulation_count  SMALLINT,
        data              JSONB NOT NULL,
        hash              VARCHAR(80) NOT NULL,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        removed_at        TIMESTAMPTZ,
        last_changed_at   TIMESTAMPTZ,
        last_fetched_at   TIMESTAMPTZ
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_reg_countries_active_region
        ON verifywise.regulation_countries(is_active, region);
      CREATE INDEX IF NOT EXISTS idx_reg_countries_name
        ON verifywise.regulation_countries(name);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_tracked_countries (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        country_slug     VARCHAR(120) NOT NULL,
        tracked_by       INTEGER REFERENCES verifywise.users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, country_slug)
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_reg_tracked_org
        ON verifywise.regulation_tracked_countries(organization_id);
      CREATE INDEX IF NOT EXISTS idx_reg_tracked_slug
        ON verifywise.regulation_tracked_countries(country_slug);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_tracker_settings (
        organization_id     INTEGER PRIMARY KEY REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        recipient_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
        recipient_emails    JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by          INTEGER,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.regulation_tracker_meta (
        id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        seeded_at       TIMESTAMPTZ,
        last_good_count INTEGER,
        last_run_week   VARCHAR(10)
      );
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.regulation_tracker_meta (id)
      VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_tracked_countries CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_tracker_settings CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_tracker_meta CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.regulation_countries CASCADE",
    );
  },
};
