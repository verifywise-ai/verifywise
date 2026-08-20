"use strict";

/**
 * RLS Phase 1: tenant-isolation policies on the registry tables.
 *
 * Creates a `tenant_isolation` policy on every table covered by the
 * tenant-isolation test registry (tests/integration/tenant-isolation/
 * tenantIsolation.registry.ts) and enables row-level security on them.
 *
 * Behavior today: UNCHANGED. The application connects as the table owner,
 * and PostgreSQL does not apply RLS to the table owner unless FORCE ROW
 * LEVEL SECURITY is set. This migration only installs the safety net.
 *
 * Activation (Phase 2) is documented in docs/technical/security/rls-rollout.md:
 * switch the app to a non-owner role and set `app.current_org` per
 * transaction; the policies below then enforce isolation in the database
 * itself, independent of application-level WHERE clauses.
 *
 * Policy semantics for non-owner roles:
 *   - Reads/updates/deletes only see rows where
 *     organization_id = current_setting('app.current_org')::int
 *   - Writes (WITH CHECK) can only create rows for that organization
 *   - When the GUC is unset it evaluates to NULL -> no rows match
 *     (fail-closed)
 */
const TABLES = [
  "projects",
  "files",
  "users",
  "risks",
  "projects_risks",
  "tasks",
  "task_assignees",
  "vendors",
  "vendors_projects",
  "assessments",
  "controls_eu",
  "subcontrols_eu",
  "projects_frameworks",
  "evidence_hub",
  "audit_ledger",
  "event_logs",
  "file_entity_links",
  "file_change_history",
  "mrm_validations",
  "mrm_findings",
  "mrm_model_roles",
  "mrm_metric_keys",
  "mrm_thresholds",
  "mrm_metrics",
  "mrm_metric_evaluations",
  "mrm_ingestion_tokens",
  "mrm_revalidation_events",
  "mrm_org_settings",
  "mrm_alert_recipients",
];

module.exports = {
  async up(queryInterface) {
    const tableList = TABLES.map((t) => `'${t}'`).join(", ");
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE t text;
      BEGIN
        FOREACH t IN ARRAY ARRAY[${tableList}] LOOP
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
    const tableList = TABLES.map((t) => `'${t}'`).join(", ");
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE t text;
      BEGIN
        FOREACH t IN ARRAY ARRAY[${tableList}] LOOP
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON verifywise.%I', t);
          EXECUTE format('ALTER TABLE verifywise.%I DISABLE ROW LEVEL SECURITY', t);
        END LOOP;
      END $$;
    `);
  },
};
