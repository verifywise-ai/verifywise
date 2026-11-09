"use strict";

/**
 * RLS Phase 1 for the bias audit corpus tables: the same tenant_isolation
 * policy the registry tables carry (see 20260801133236). Behaviour today is
 * unchanged because the app connects as the table owner; this installs the
 * net so the tables fail closed, not open, once RLS_ENFORCEMENT_ENABLED is on.
 * See docs/technical/security/rls-rollout.md.
 */
const TABLES = ["bias_audit_corpora", "bias_audit_corpus_records"];

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
