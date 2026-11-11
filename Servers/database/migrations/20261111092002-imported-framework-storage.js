"use strict";

/**
 * Imported framework storage (#5254, VW-CQ-02).
 *
 * verifywise.frameworks is the GLOBAL bundled catalog (EU AI Act, ISO 42001,
 * ...). This migration makes it multi-tenant-safe for self-service imports:
 *
 *   organization_id  NULL = bundled/system row (visible to every org),
 *                    set  = imported row owned by exactly one organization
 *   source           'bundled' (default) | 'imported'
 *
 * CHECK guarantees imported rows always carry an organization, and a partial
 * unique index makes (organization, name) unique among imported rows — the
 * upsert key the framework-import extension uses for idempotent re-uploads.
 *
 * Imported structure lives in two generic tables (the bundled frameworks keep
 * their per-framework struct/impl tables; those are untouched):
 *
 *   imported_framework_topics    — one row per topic per imported framework
 *   imported_framework_subtopics — one row per subtopic under a topic
 *
 * Both carry organization_id and get the standard tenant_isolation RLS
 * policy (mirrors 20261108165215-create-dashboard-preferences.js).
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      ALTER TABLE verifywise.frameworks
        ADD COLUMN IF NOT EXISTS organization_id INTEGER
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'bundled';

      ALTER TABLE verifywise.frameworks
        ADD CONSTRAINT frameworks_source_chk
          CHECK (source IN ('bundled','imported')),
        ADD CONSTRAINT frameworks_imported_has_org_chk
          CHECK (source = 'bundled' OR organization_id IS NOT NULL);

      -- Upsert key for the framework-import extension: one imported framework
      -- name per organization. Bundled rows (organization_id IS NULL) stay
      -- outside the index so their historical uniqueness is untouched.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_frameworks_imported_org_name
        ON verifywise.frameworks(organization_id, name)
        WHERE source = 'imported';

      CREATE INDEX IF NOT EXISTS idx_frameworks_organization_id
        ON verifywise.frameworks(organization_id)
        WHERE organization_id IS NOT NULL;
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.imported_framework_topics (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        framework_id    INTEGER NOT NULL
          REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
        topic_number    VARCHAR(50) NOT NULL,
        name            VARCHAR(500) NOT NULL,
        description     TEXT,
        order_no        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, framework_id, topic_number)
      );

      CREATE INDEX IF NOT EXISTS idx_imported_framework_topics_framework
        ON verifywise.imported_framework_topics(organization_id, framework_id);
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.imported_framework_subtopics (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        topic_id        INTEGER NOT NULL
          REFERENCES verifywise.imported_framework_topics(id) ON DELETE CASCADE,
        subtopic_number VARCHAR(50) NOT NULL,
        name            VARCHAR(500) NOT NULL,
        description     TEXT,
        order_no        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, topic_id, subtopic_number)
      );

      CREATE INDEX IF NOT EXISTS idx_imported_framework_subtopics_topic
        ON verifywise.imported_framework_subtopics(organization_id, topic_id);
    `);

    // Tenant isolation on the imported-structure tables (the global
    // frameworks catalog itself stays un-RLS'd — bundled rows are shared).
    for (const table of [
      "imported_framework_topics",
      "imported_framework_subtopics",
    ]) {
      await sql.query(`
        ALTER TABLE verifywise.${table} ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.${table};
        CREATE POLICY tenant_isolation ON verifywise.${table}
          USING (organization_id = current_setting('app.current_org', true)::int)
          WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
      `);
    }
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;

    for (const table of [
      "imported_framework_subtopics",
      "imported_framework_topics",
    ]) {
      await sql.query(`
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.${table};
        DROP TABLE IF EXISTS verifywise.${table};
      `);
    }

    await sql.query(`
      DROP INDEX IF EXISTS verifywise.idx_frameworks_imported_org_name;
      DROP INDEX IF EXISTS verifywise.idx_frameworks_organization_id;

      ALTER TABLE verifywise.frameworks
        DROP CONSTRAINT IF EXISTS frameworks_imported_has_org_chk,
        DROP CONSTRAINT IF EXISTS frameworks_source_chk;

      ALTER TABLE verifywise.frameworks
        DROP COLUMN IF EXISTS organization_id,
        DROP COLUMN IF EXISTS source;
    `);
  },
};
