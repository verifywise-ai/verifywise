"use strict";

/**
 * Imported framework assessment (#5254).
 *
 * Lets a use case attach an organization's imported framework and assess it
 * the way it assesses the bundled frameworks 5-25. Imported frameworks stay
 * out of verifywise.frameworks and verifywise.projects_frameworks (see
 * 20261111092002-imported-framework-storage.js), so they get their own link
 * and impl tables:
 *
 *   projects_imported_frameworks            — one row per (use case, imported framework)
 *   imported_framework_topic_impl           — one assessment row per topic per link (L2)
 *   imported_framework_subtopic_impl        — one assessment row per subtopic per link (L3)
 *   imported_framework_topic_impl__risks    — topic impl ↔ risk
 *   imported_framework_subtopic_impl__risks — subtopic impl ↔ risk
 *
 * The impl columns and status values mirror the bundled impl tables
 * (20260805130326-create-framework-impl-tables.js); status is a VARCHAR with a
 * CHECK of the same eight values instead of a per-table enum type.
 *
 * Topic and subtopic FKs are RESTRICT: a re-import retires (is_retired) a
 * topic or subtopic that has assessment data instead of deleting it, and an
 * imported framework cannot be deleted while a use case uses it.
 *
 * Every new table carries organization_id and gets the standard
 * tenant_isolation RLS policy.
 */

const NEW_TABLES = [
  "projects_imported_frameworks",
  "imported_framework_topic_impl",
  "imported_framework_subtopic_impl",
  "imported_framework_topic_impl__risks",
  "imported_framework_subtopic_impl__risks",
];

const STATUS_CHECK = `status IN (
  'Not started', 'Draft', 'In progress', 'Awaiting review',
  'Awaiting approval', 'Implemented', 'Audited', 'Needs rework'
)`;

const implColumns = `
  implementation_description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'Not started' CHECK (${STATUS_CHECK}),
  owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
  reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
  approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
  due_date DATE,
  auditor_feedback TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()`;

module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;
    const transaction = await sql.transaction();
    try {
      await sql.query(
        `ALTER TABLE verifywise.imported_framework_topics
           ADD COLUMN IF NOT EXISTS is_retired BOOLEAN NOT NULL DEFAULT FALSE;
         ALTER TABLE verifywise.imported_framework_subtopics
           ADD COLUMN IF NOT EXISTS is_retired BOOLEAN NOT NULL DEFAULT FALSE;`,
        { transaction },
      );

      await sql.query(
        `CREATE TABLE IF NOT EXISTS verifywise.projects_imported_frameworks (
           id SERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           project_id INTEGER NOT NULL
             REFERENCES verifywise.projects(id) ON DELETE CASCADE,
           imported_framework_id INTEGER NOT NULL
             REFERENCES verifywise.imported_frameworks(id) ON DELETE RESTRICT,
           is_demo BOOLEAN NOT NULL DEFAULT FALSE,
           created_at TIMESTAMP NOT NULL DEFAULT NOW(),
           UNIQUE (project_id, imported_framework_id)
         );
         CREATE INDEX IF NOT EXISTS idx_projects_imported_frameworks_org
           ON verifywise.projects_imported_frameworks(organization_id);
         CREATE INDEX IF NOT EXISTS idx_projects_imported_frameworks_framework
           ON verifywise.projects_imported_frameworks(imported_framework_id);`,
        { transaction },
      );

      await sql.query(
        `CREATE TABLE IF NOT EXISTS verifywise.imported_framework_topic_impl (
           id SERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           project_imported_framework_id INTEGER NOT NULL
             REFERENCES verifywise.projects_imported_frameworks(id) ON DELETE CASCADE,
           topic_id INTEGER NOT NULL
             REFERENCES verifywise.imported_framework_topics(id) ON DELETE RESTRICT,
           ${implColumns},
           UNIQUE (project_imported_framework_id, topic_id)
         );
         CREATE INDEX IF NOT EXISTS idx_imported_framework_topic_impl_org
           ON verifywise.imported_framework_topic_impl(organization_id);
         CREATE INDEX IF NOT EXISTS idx_imported_framework_topic_impl_topic
           ON verifywise.imported_framework_topic_impl(topic_id);`,
        { transaction },
      );

      await sql.query(
        `CREATE TABLE IF NOT EXISTS verifywise.imported_framework_subtopic_impl (
           id SERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           project_imported_framework_id INTEGER NOT NULL
             REFERENCES verifywise.projects_imported_frameworks(id) ON DELETE CASCADE,
           subtopic_id INTEGER NOT NULL
             REFERENCES verifywise.imported_framework_subtopics(id) ON DELETE RESTRICT,
           topic_impl_id INTEGER NOT NULL
             REFERENCES verifywise.imported_framework_topic_impl(id) ON DELETE CASCADE,
           ${implColumns},
           UNIQUE (project_imported_framework_id, subtopic_id)
         );
         CREATE INDEX IF NOT EXISTS idx_imported_framework_subtopic_impl_org
           ON verifywise.imported_framework_subtopic_impl(organization_id);
         CREATE INDEX IF NOT EXISTS idx_imported_framework_subtopic_impl_subtopic
           ON verifywise.imported_framework_subtopic_impl(subtopic_id);
         CREATE INDEX IF NOT EXISTS idx_imported_framework_subtopic_impl_parent
           ON verifywise.imported_framework_subtopic_impl(topic_impl_id);`,
        { transaction },
      );

      // Same shape as the bundled <impl>__risks junctions.
      await sql.query(
        `CREATE TABLE IF NOT EXISTS verifywise.imported_framework_topic_impl__risks (
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           topic_impl_id INTEGER NOT NULL
             REFERENCES verifywise.imported_framework_topic_impl(id) ON DELETE CASCADE,
           projects_risks_id INTEGER NOT NULL
             REFERENCES verifywise.risks(id) ON DELETE CASCADE,
           PRIMARY KEY (topic_impl_id, projects_risks_id)
         );
         CREATE INDEX IF NOT EXISTS idx_imported_framework_topic_impl__risks_org
           ON verifywise.imported_framework_topic_impl__risks(organization_id);
         CREATE TABLE IF NOT EXISTS verifywise.imported_framework_subtopic_impl__risks (
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           subtopic_impl_id INTEGER NOT NULL
             REFERENCES verifywise.imported_framework_subtopic_impl(id) ON DELETE CASCADE,
           projects_risks_id INTEGER NOT NULL
             REFERENCES verifywise.risks(id) ON DELETE CASCADE,
           PRIMARY KEY (subtopic_impl_id, projects_risks_id)
         );
         CREATE INDEX IF NOT EXISTS idx_imported_framework_subtopic_impl__risks_org
           ON verifywise.imported_framework_subtopic_impl__risks(organization_id);`,
        { transaction },
      );

      for (const table of NEW_TABLES) {
        await sql.query(
          `ALTER TABLE verifywise.${table} ENABLE ROW LEVEL SECURITY;
           DROP POLICY IF EXISTS tenant_isolation ON verifywise.${table};
           CREATE POLICY tenant_isolation ON verifywise.${table}
             USING (organization_id = current_setting('app.current_org', true)::int)
             WITH CHECK (organization_id = current_setting('app.current_org', true)::int);`,
          { transaction },
        );
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;
    const transaction = await sql.transaction();
    try {
      // Evidence links point at impl ids by value (no FK), so remove them
      // with the impl rows they describe.
      await sql.query(
        `DELETE FROM verifywise.file_entity_links
          WHERE framework_type = 'imported'
            AND entity_type IN ('imported_topic', 'imported_subtopic');`,
        { transaction },
      );
      // Children first so no FK blocks a drop.
      for (const table of [...NEW_TABLES].reverse()) {
        await sql.query(
          `DROP POLICY IF EXISTS tenant_isolation ON verifywise.${table};
           DROP TABLE IF EXISTS verifywise.${table};`,
          { transaction },
        );
      }
      await sql.query(
        `ALTER TABLE verifywise.imported_framework_subtopics DROP COLUMN IF EXISTS is_retired;
         ALTER TABLE verifywise.imported_framework_topics DROP COLUMN IF EXISTS is_retired;`,
        { transaction },
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
