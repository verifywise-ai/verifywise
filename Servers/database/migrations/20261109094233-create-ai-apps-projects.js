"use strict";

/**
 * ai_apps_projects: which use cases an AI app serves (#5259). Many-to-many, one
 * row per pair; `organization_id` is stamped from the caller and both sides are
 * checked against it on write. Removing either side removes the link.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.transaction(async (transaction) => {
      await sql.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ai_apps_projects (
           ai_app_id INTEGER NOT NULL
             REFERENCES verifywise.ai_apps(id) ON DELETE CASCADE,
           project_id INTEGER NOT NULL
             REFERENCES verifywise.projects(id) ON DELETE CASCADE,
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           created_by INTEGER
             REFERENCES verifywise.users(id) ON DELETE SET NULL,
           created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
           PRIMARY KEY (ai_app_id, project_id)
         );`,
        { transaction },
      );

      await sql.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_apps_projects_org_project
           ON verifywise.ai_apps_projects(organization_id, project_id);`,
        { transaction },
      );

      await sql.query(
        `ALTER TABLE verifywise.ai_apps_projects ENABLE ROW LEVEL SECURITY;
         DROP POLICY IF EXISTS tenant_isolation ON verifywise.ai_apps_projects;
         CREATE POLICY tenant_isolation ON verifywise.ai_apps_projects
           USING (organization_id = current_setting('app.current_org', true)::int)
           WITH CHECK (organization_id = current_setting('app.current_org', true)::int);`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_apps_projects CASCADE;",
    );
  },
};
