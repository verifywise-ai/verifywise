"use strict";

/**
 * RLS Phase 1, continued: tenant-isolation policies on the reporting tables.
 *
 * 20260720100200 installed the safety net on "every table covered by the
 * tenant-isolation test registry" via a hardcoded list. This branch added four
 * tables to that registry (tenantIsolation.registry.ts) after that list was
 * written, so they carry no policy at all. Under Phase 2 — app connected as the
 * non-owner verifywise_app role, which 20260721090000 grants DML on every table
 * in the schema — the 29 listed tables fail closed while these four would fail
 * OPEN: any missing or malformed WHERE organization_id in a reporting query
 * would return other tenants' rows with no database backstop, in a deployment
 * whose operators believe the registry is covered.
 *
 * report_templates needs a different policy from the other three. Its
 * organization_id is nullable by design (20260619190359) because system
 * templates are shared across tenants with organization_id IS NULL. The
 * standard predicate evaluates to NULL for those rows, which under RLS means
 * "no match" — a naive copy would empty the entire system template library for
 * every organization. USING therefore admits the shared rows; WITH CHECK stays
 * strict so a tenant cannot write one.
 *
 * Behavior today is unchanged: the app connects as the table owner and
 * PostgreSQL does not apply RLS to the owner without FORCE ROW LEVEL SECURITY.
 * This only installs the net. See docs/technical/security/rls-rollout.md.
 */

/** Tables whose organization_id is NOT NULL — the standard strict policy. */
const STRICT_TABLES = ["report_runs", "report_run_analyses", "scheduled_reports"];

/** Tables that also hold cross-tenant shared rows with a NULL organization_id. */
const SHARED_ROW_TABLES = ["report_templates"];

const ALL_TABLES = [...STRICT_TABLES, ...SHARED_ROW_TABLES];

function list(tables) {
  return tables.map((t) => `'${t}'`).join(", ");
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE t text;
      BEGIN
        FOREACH t IN ARRAY ARRAY[${list(STRICT_TABLES)}] LOOP
          EXECUTE format('ALTER TABLE verifywise.%I ENABLE ROW LEVEL SECURITY', t);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON verifywise.%I', t);
          EXECUTE format(
            'CREATE POLICY tenant_isolation ON verifywise.%I
             USING (organization_id = current_setting(''app.current_org'', true)::int)
             WITH CHECK (organization_id = current_setting(''app.current_org'', true)::int)',
            t
          );
        END LOOP;

        FOREACH t IN ARRAY ARRAY[${list(SHARED_ROW_TABLES)}] LOOP
          EXECUTE format('ALTER TABLE verifywise.%I ENABLE ROW LEVEL SECURITY', t);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON verifywise.%I', t);
          EXECUTE format(
            'CREATE POLICY tenant_isolation ON verifywise.%I
             USING (organization_id IS NULL
                    OR organization_id = current_setting(''app.current_org'', true)::int)
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
        FOREACH t IN ARRAY ARRAY[${list(ALL_TABLES)}] LOOP
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON verifywise.%I', t);
          EXECUTE format('ALTER TABLE verifywise.%I DISABLE ROW LEVEL SECURITY', t);
        END LOOP;
      END $$;
    `);
  },
};
