"use strict";

/**
 * Slack connections with no organization ("unlinked"): clean up the ownerless
 * ones and let the owner see and remove their own.
 *
 * 20261114232015-slack-webhooks-organization-scope left organization_id NULL
 * on connections whose owner belonged to several organizations or to none, or
 * whose owner was deleted (user_id NULL after ON DELETE SET NULL). Those rows
 * never send, and every management route filters by organization, so nobody
 * could list or remove them.
 *
 * - Rows with neither an organization nor an owner are deleted: no one can
 *   ever see or remove them.
 * - verifywise.slack_unlinked_connections(user_id) lists the caller's own
 *   unlinked connections (id, team_name, channel, created_at; no token or
 *   URL), and verifywise.delete_unlinked_slack_connection(id, user_id) deletes
 *   one of them, returning whether a row was deleted. slack_webhooks carries
 *   the tenant_isolation policy, which hides organization_id NULL rows from a
 *   request running as verifywise_app with app.current_org set, so both run
 *   as the owner (SECURITY DEFINER, not subject to RLS without FORCE). Each
 *   filters on organization_id IS NULL and the given user_id, so neither can
 *   reach an organization's connection or another user's row. search_path is
 *   fixed so a caller cannot substitute objects; only the owner and
 *   verifywise_app may execute them.
 *
 * down() drops both functions. The deleted ownerless rows are not restored:
 * they could not send and no one could reach them.
 */
const FUNCTIONS = [
  "verifywise.slack_unlinked_connections(INTEGER)",
  "verifywise.delete_unlinked_slack_connection(INTEGER, INTEGER)",
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const sql = queryInterface.sequelize;

      const [deleted] = await sql.query(
        `DELETE FROM verifywise.slack_webhooks
          WHERE organization_id IS NULL AND user_id IS NULL
          RETURNING id;`,
        { transaction },
      );
      console.log(
        `[slack-webhooks-unlinked-cleanup] deleted ${deleted.length} Slack connection(s) with no organization and no owner.`,
      );

      await sql.query(
        `
        CREATE OR REPLACE FUNCTION verifywise.slack_unlinked_connections(p_user_id INTEGER)
        RETURNS TABLE (id INTEGER, team_name VARCHAR, channel VARCHAR, created_at TIMESTAMP)
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = verifywise, pg_temp
        AS $$
          SELECT sw.id, sw.team_name, sw.channel, sw.created_at
            FROM verifywise.slack_webhooks sw
           WHERE sw.organization_id IS NULL
             AND sw.user_id = p_user_id
           ORDER BY sw.created_at DESC, sw.id ASC;
        $$;

        CREATE OR REPLACE FUNCTION verifywise.delete_unlinked_slack_connection(
          p_id INTEGER,
          p_user_id INTEGER
        )
        RETURNS BOOLEAN
        LANGUAGE sql
        VOLATILE
        SECURITY DEFINER
        SET search_path = verifywise, pg_temp
        AS $$
          WITH removed AS (
            DELETE FROM verifywise.slack_webhooks sw
             WHERE sw.id = p_id
               AND sw.organization_id IS NULL
               AND sw.user_id = p_user_id
            RETURNING sw.id
          )
          SELECT EXISTS (SELECT 1 FROM removed);
        $$;
      `,
        { transaction },
      );

      // Functions are executable by PUBLIC by default. These read and delete
      // rows outside the caller's organization, so only the runtime role may
      // call them (the owner always can).
      for (const fn of FUNCTIONS) {
        await sql.query(
          `
          REVOKE EXECUTE ON FUNCTION ${fn} FROM PUBLIC;
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verifywise_app') THEN
              GRANT EXECUTE ON FUNCTION ${fn} TO verifywise_app;
            END IF;
          END $$;
        `,
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const fn of FUNCTIONS) {
        await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS ${fn};`, { transaction });
      }
    });
  },
};
