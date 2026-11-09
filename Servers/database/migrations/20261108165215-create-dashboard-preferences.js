"use strict";

/**
 * dashboard_preferences — one person's dashboard layout in one organization
 * (#5257). Lazily created; a missing row means the default layout. `layout` is
 * an ordered list of { widgetKey, visible, position }. The widget keys belong
 * to the frontend registry (DashboardOverview/widgetRegistry.ts), so the column
 * only rules out anything that is not a list.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.dashboard_preferences (
        user_id INTEGER NOT NULL
          REFERENCES verifywise.users(id) ON DELETE CASCADE,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        layout JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(layout) = 'array'),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, organization_id)
      );
    `);

    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_dashboard_preferences_org
        ON verifywise.dashboard_preferences(organization_id);
    `);

    await sql.query(`
      ALTER TABLE verifywise.dashboard_preferences ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON verifywise.dashboard_preferences;
      CREATE POLICY tenant_isolation ON verifywise.dashboard_preferences
        USING (organization_id = current_setting('app.current_org', true)::int)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.dashboard_preferences CASCADE;",
    );
  },
};
