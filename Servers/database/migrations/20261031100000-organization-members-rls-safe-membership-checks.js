"use strict";

/**
 * Membership checks that must see every organization, not only the current one.
 *
 * organization_members carries the tenant_isolation policy. With
 * RLS_ENFORCEMENT_ENABLED=true a request runs as verifywise_app with
 * app.current_org set, so "does this user belong to any organization?" only
 * sees the current organization's rows. Removing a user from one organization
 * would then delete their account even when they still belong to another, and
 * the deferred orphan check would refuse a removal that leaves other
 * memberships in place.
 *
 * - verifywise.user_has_organization_membership(user_id) answers that question
 *   as the owner, who is not subject to RLS (no FORCE ROW LEVEL SECURITY).
 * - The two orphan trigger functions run as the owner for the same reason.
 *
 * All three set search_path so a caller cannot substitute objects.
 */
const TRIGGER_FUNCTIONS = [
  "verifywise.check_orphan_user_has_superadmin()",
  "verifywise.protect_orphan_superadmin_delete()",
];

module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      CREATE OR REPLACE FUNCTION verifywise.user_has_organization_membership(p_user_id INTEGER)
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = verifywise, pg_temp
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM verifywise.organization_members WHERE user_id = p_user_id
        );
      $$;
    `);

    for (const fn of TRIGGER_FUNCTIONS) {
      await sql.query(
        `ALTER FUNCTION ${fn} SECURITY DEFINER SET search_path = verifywise, pg_temp;`,
      );
    }
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;

    for (const fn of TRIGGER_FUNCTIONS) {
      await sql.query(`ALTER FUNCTION ${fn} SECURITY INVOKER RESET search_path;`);
    }
    await sql.query(
      `DROP FUNCTION IF EXISTS verifywise.user_has_organization_membership(INTEGER);`,
    );
  },
};
