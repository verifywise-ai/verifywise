"use strict";

/**
 * RLS Phase 1, continued: tenant-isolation policies on the vendor research tables.
 *
 * The vendor research and vendor risk database work added six tables to the
 * tenant-isolation registry (tenantIsolation.registry.ts) without the policy
 * that every registry table carries. Under Phase 2 (the app connected as the
 * non-owner verifywise_app role, which 20260721090000 grants DML on every table
 * in the schema, future ones included) they would fail OPEN: a query missing its
 * WHERE organization_id would return other tenants' rows with no database
 * backstop. Same gap and same fix as 20260801133236 for the reporting tables.
 *
 * All six have organization_id NOT NULL (vendor_research_settings has it as its
 * primary key), so they all take the standard strict policy. The shared vrdb_*
 * lists hold no tenant data and have no organization_id; they stay without RLS.
 *
 * Behavior today is unchanged: the app connects as the table owner and
 * PostgreSQL does not apply RLS to the owner without FORCE ROW LEVEL SECURITY.
 * This only installs the net. See docs/technical/security/rls-rollout.md.
 */

const TABLES = [
  "vendor_research_runs",
  "vendor_research_settings",
  "vendor_research_sources",
  "vendor_research_snapshots",
  "vendor_vrdb_matches",
  "vendor_risk_findings",
];

function list(tables) {
  return tables.map((t) => `'${t}'`).join(", ");
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE t text;
      BEGIN
        FOREACH t IN ARRAY ARRAY[${list(TABLES)}] LOOP
          EXECUTE format('ALTER TABLE verifywise.%I ENABLE ROW LEVEL SECURITY', t);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON verifywise.%I', t);
          EXECUTE format(
            'CREATE POLICY tenant_isolation ON verifywise.%I
             USING (organization_id = current_setting(''app.current_org'', true)::int)
             WITH CHECK (organization_id = current_setting(''app.current_org'', true)::int)',
            t
          );
        END LOOP;
      END $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE t text;
      BEGIN
        FOREACH t IN ARRAY ARRAY[${list(TABLES)}] LOOP
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON verifywise.%I', t);
          EXECUTE format('ALTER TABLE verifywise.%I DISABLE ROW LEVEL SECURITY', t);
        END LOOP;
      END $$;
    `);
  },
};
