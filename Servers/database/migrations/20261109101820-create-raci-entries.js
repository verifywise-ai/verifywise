"use strict";

/**
 * raci_entries — manual changes to a use case's RACI matrix (#5255).
 *
 * The matrix itself is derived when it is read (owner, members, approvers, task
 * assignees), so these rows are overrides on top of it and never a copy of it:
 * `assigned` adds a role the person would not otherwise hold, `removed` takes
 * away one they would. Groups (#5253) will add a nullable group_id with a CHECK.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.raci_entries (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL
            REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL
            REFERENCES verifywise.users(id) ON DELETE CASCADE,
          raci_role CHAR(1) NOT NULL CHECK (raci_role IN ('R', 'A', 'C', 'I')),
          state VARCHAR(10) NOT NULL CHECK (state IN ('assigned', 'removed')),
          updated_by INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          UNIQUE (project_id, user_id, raci_role)
        );
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_raci_entries_org_project
          ON verifywise.raci_entries(organization_id, project_id);
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.raci_entries ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.raci_entries;
        CREATE POLICY tenant_isolation ON verifywise.raci_entries
          USING (organization_id = current_setting('app.current_org', true)::int)
          WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.raci_entries CASCADE;");
  },
};
