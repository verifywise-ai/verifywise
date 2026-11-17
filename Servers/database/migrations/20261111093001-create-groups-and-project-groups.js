"use strict";

/**
 * groups + group_members + project_groups (#5253, VW-CQ-01).
 *
 * Organisations can now create named groups/teams (e.g. a "Model risk team")
 * and grant use-case access at group level: a row in project_groups makes
 * every member of the group a member of that use case, resolved at check
 * time by utils/projectVisibility.utils.ts (the same pattern
 * rolePermissions.utils.ts uses for roles).
 *
 * All three tables are organization-scoped and carry the standard
 * tenant_isolation RLS policy.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.groups (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER     NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        created_by      INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT groups_unique_name_per_org
          UNIQUE (organization_id, name)
      );
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.group_members (
        group_id        INTEGER NOT NULL
          REFERENCES verifywise.groups(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL
          REFERENCES verifywise.users(id) ON DELETE CASCADE,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      );
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.project_groups (
        project_id      INTEGER NOT NULL
          REFERENCES verifywise.projects(id) ON DELETE CASCADE,
        group_id        INTEGER NOT NULL
          REFERENCES verifywise.groups(id) ON DELETE CASCADE,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, group_id)
      );
    `);

    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_groups_org
        ON verifywise.groups(organization_id);
      CREATE INDEX IF NOT EXISTS idx_group_members_org_user
        ON verifywise.group_members(organization_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_project_groups_org_project
        ON verifywise.project_groups(organization_id, project_id);
      CREATE INDEX IF NOT EXISTS idx_project_groups_org_group
        ON verifywise.project_groups(organization_id, group_id);
    `);

    await sql.query(`
      ALTER TABLE verifywise.groups ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON verifywise.groups;
      CREATE POLICY tenant_isolation ON verifywise.groups
        USING (organization_id = current_setting('app.current_org', true)::int)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::int);

      ALTER TABLE verifywise.group_members ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON verifywise.group_members;
      CREATE POLICY tenant_isolation ON verifywise.group_members
        USING (organization_id = current_setting('app.current_org', true)::int)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::int);

      ALTER TABLE verifywise.project_groups ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON verifywise.project_groups;
      CREATE POLICY tenant_isolation ON verifywise.project_groups
        USING (organization_id = current_setting('app.current_org', true)::int)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.project_groups CASCADE;
      DROP TABLE IF EXISTS verifywise.group_members CASCADE;
      DROP TABLE IF EXISTS verifywise.groups CASCADE;
    `);
  },
};
