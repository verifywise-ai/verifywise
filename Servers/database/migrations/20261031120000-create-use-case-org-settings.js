"use strict";

/**
 * use_case_org_settings — what a new use case starts with in an organization.
 * One row per org, lazily created; a missing row means no defaults (Global,
 * no frameworks), which is how use cases were created before. Follows the
 * file_org_settings pattern.
 *
 * - default_geography: one of the use case geography ids (1 Global, 2 Europe,
 *   3 North America, 4 South America, 5 Asia, 6 Africa), or NULL.
 * - default_framework_ids: project-level frameworks (frameworks.is_organizational
 *   = false) attached to a new use case. The API checks the ids; the column
 *   only rules out NULL entries.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.use_case_org_settings (
        organization_id INTEGER PRIMARY KEY
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        default_geography INTEGER NULL
          CHECK (default_geography BETWEEN 1 AND 6),
        default_framework_ids INTEGER[] NOT NULL DEFAULT '{}'
          CHECK (array_position(default_framework_ids, NULL) IS NULL),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);

    await sql.query(`
      ALTER TABLE verifywise.use_case_org_settings ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON verifywise.use_case_org_settings;
      CREATE POLICY tenant_isolation ON verifywise.use_case_org_settings
        USING (organization_id = current_setting('app.current_org', true)::int)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.use_case_org_settings CASCADE;",
    );
  },
};
