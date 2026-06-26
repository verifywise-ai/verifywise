"use strict";

/**
 * AI Trust Index module tables.
 *
 * `ai_trust_index_apps` and `ai_trust_index_meta` are GLOBAL (no
 * organization_id): the AI Trust Index feed is public reference data,
 * identical for every org. Tenancy is enforced only on
 * `ai_trust_index_tracked_apps` and `ai_trust_index_settings`.
 *
 * Apps are linked from tracking by `app_slug` (the feed's stable identity),
 * intentionally WITHOUT a foreign key, so a feed re-import can never
 * cascade-delete durable user tracking.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_apps (
        id                SERIAL PRIMARY KEY,
        slug              VARCHAR(120) NOT NULL UNIQUE,
        name              VARCHAR(255) NOT NULL,
        vendor            VARCHAR(255),
        category          VARCHAR(100),
        letter_grade      VARCHAR(2),
        score_out_of_100  SMALLINT,
        data              JSONB NOT NULL,
        material_hash     CHAR(64) NOT NULL,
        full_hash         CHAR(64) NOT NULL,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        removed_at        TIMESTAMPTZ,
        last_changed_at   TIMESTAMPTZ,
        last_fetched_at   TIMESTAMPTZ
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ati_apps_active_category
        ON verifywise.ai_trust_index_apps(is_active, category);
      CREATE INDEX IF NOT EXISTS idx_ati_apps_active_grade
        ON verifywise.ai_trust_index_apps(is_active, letter_grade);
      CREATE INDEX IF NOT EXISTS idx_ati_apps_name
        ON verifywise.ai_trust_index_apps(name);
      CREATE INDEX IF NOT EXISTS idx_ati_apps_vendor
        ON verifywise.ai_trust_index_apps(vendor);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_tracked_apps (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        app_slug         VARCHAR(120) NOT NULL,
        tracked_by       INTEGER REFERENCES verifywise.users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, app_slug)
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ati_tracked_org
        ON verifywise.ai_trust_index_tracked_apps(organization_id);
      CREATE INDEX IF NOT EXISTS idx_ati_tracked_slug
        ON verifywise.ai_trust_index_tracked_apps(app_slug);
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_settings (
        organization_id     INTEGER PRIMARY KEY REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        recipient_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
        recipient_emails    JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by          INTEGER REFERENCES verifywise.users(id),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_trust_index_meta (
        id              SMALLINT PRIMARY KEY DEFAULT 1,
        seeded_at       TIMESTAMPTZ,
        last_good_count INTEGER,
        last_run_week   VARCHAR(10),
        CONSTRAINT ai_trust_index_meta_singleton CHECK (id = 1)
      );
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.ai_trust_index_meta (id)
      VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_tracked_apps CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_settings CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_meta CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_trust_index_apps CASCADE",
    );
  },
};
