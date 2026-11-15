"use strict";

/**
 * Slack connections belong to the organization.
 *
 * slack_webhooks.organization_id has existed since the consolidated schema but
 * was never written by the app (only by the legacy schema-per-tenant import).
 * This migration fills it in and records how far each connection may deliver.
 *
 * - organization_id: rows that already have one keep it. Otherwise it comes
 *   from the owner's organization membership: the single membership, or the
 *   earliest one (joined_at, then organization_id) when the owner has several.
 *   users has no primary or default organization column to prefer. Rows whose
 *   owner is gone (user_id NULL after ON DELETE SET NULL) or has no membership
 *   stay NULL. Delivery always filters by organization, so those rows never
 *   send again; they can only be removed. The column stays nullable for them.
 * - delivery_scope: 'user' for every existing row, so an existing connection
 *   keeps sending only the events its owner triggers (quiet start) until an
 *   Admin saves its routing again. New rows default to 'organization'.
 * - Index on organization_id, and the tenant_isolation RLS policy used on
 *   every registry table (inert while the app connects as the table owner).
 *
 * down() drops delivery_scope, the index and the policy. organization_id
 * values written here are left in place: nothing read the column before this
 * migration, and up() only fills NULLs, so running it again is harmless.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const sql = queryInterface.sequelize;

      // ADD COLUMN with a DEFAULT fills existing rows with it; the default for
      // new rows changes right after.
      await sql.query(
        `
        ALTER TABLE verifywise.slack_webhooks
          ADD COLUMN delivery_scope TEXT NOT NULL DEFAULT 'user';
        ALTER TABLE verifywise.slack_webhooks
          ALTER COLUMN delivery_scope SET DEFAULT 'organization';
        ALTER TABLE verifywise.slack_webhooks
          ADD CONSTRAINT slack_webhooks_delivery_scope_check
          CHECK (delivery_scope IN ('user', 'organization'));
      `,
        { transaction },
      );

      const [backfilled] = await sql.query(
        `
        UPDATE verifywise.slack_webhooks sw
           SET organization_id = m.organization_id
          FROM (
            SELECT DISTINCT ON (user_id) user_id, organization_id
              FROM verifywise.organization_members
             ORDER BY user_id, joined_at ASC, organization_id ASC
          ) m
         WHERE sw.organization_id IS NULL
           AND sw.user_id = m.user_id
        RETURNING sw.id;
      `,
        { transaction },
      );

      const [[{ count: orphaned }]] = await sql.query(
        `SELECT COUNT(*)::int AS count FROM verifywise.slack_webhooks WHERE organization_id IS NULL;`,
        { transaction },
      );

      console.log(
        `[slack-webhooks-organization-scope] organization_id backfilled on ${backfilled.length} row(s); ` +
          `${orphaned} row(s) have no owner organization and will not send.`,
      );

      await sql.query(
        `
        CREATE INDEX IF NOT EXISTS idx_slack_webhooks_organization_id
          ON verifywise.slack_webhooks (organization_id);

        ALTER TABLE verifywise.slack_webhooks ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.slack_webhooks;
        CREATE POLICY tenant_isolation ON verifywise.slack_webhooks
          USING (organization_id = current_setting('app.current_org', true)::int)
          WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
      `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.slack_webhooks;
        ALTER TABLE verifywise.slack_webhooks DISABLE ROW LEVEL SECURITY;
        DROP INDEX IF EXISTS verifywise.idx_slack_webhooks_organization_id;
        ALTER TABLE verifywise.slack_webhooks
          DROP CONSTRAINT IF EXISTS slack_webhooks_delivery_scope_check;
        ALTER TABLE verifywise.slack_webhooks DROP COLUMN IF EXISTS delivery_scope;
      `,
        { transaction },
      );
    });
  },
};
