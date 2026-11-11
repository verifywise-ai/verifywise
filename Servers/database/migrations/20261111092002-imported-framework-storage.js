"use strict";

/**
 * Imported framework storage (#5254, VW-CQ-02).
 *
 * Imported frameworks live in their own organization-scoped tables and never
 * in verifywise.frameworks. That table is the GLOBAL bundled catalog (EU AI
 * Act, ISO 42001, ... ids 1-25 plus the ids reserved for future bundled
 * frameworks): every org reads it, use cases attach to it through
 * projects_frameworks, and the per-framework struct tables reference it.
 * Keeping imports out of it means:
 *   - no generic framework reader can show one org's import to another org;
 *   - an import can never take an id a future bundled framework needs;
 *   - an import cannot be attached to a use case (it has no struct tables).
 *
 *   imported_frameworks          — one row per imported framework per org
 *   imported_framework_topics    — one row per topic
 *   imported_framework_subtopics — one row per subtopic under a topic
 *
 * All three carry organization_id and get the standard tenant_isolation RLS
 * policy (mirrors 20261108165215-create-dashboard-preferences.js).
 */
const TABLES = ["imported_frameworks", "imported_framework_topics", "imported_framework_subtopics"];

module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.imported_frameworks (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_by      INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Upsert key: one imported framework name per organization,
      -- case-insensitive ("Acme policy" and "acme policy" are the same).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_frameworks_org_name
        ON verifywise.imported_frameworks(organization_id, lower(name));
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.imported_framework_topics (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        framework_id    INTEGER NOT NULL
          REFERENCES verifywise.imported_frameworks(id) ON DELETE CASCADE,
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

    for (const table of TABLES) {
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
    // Children first so no FK blocks a drop.
    for (const table of [...TABLES].reverse()) {
      await sql.query(`
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.${table};
        DROP TABLE IF EXISTS verifywise.${table};
      `);
    }
  },
};
