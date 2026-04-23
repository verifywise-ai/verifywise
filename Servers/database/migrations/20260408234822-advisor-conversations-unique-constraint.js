'use strict';

/**
 * Add the unique constraint on `(organization_id, user_id, domain)` that
 * `upsertConversationQuery` in `utils/advisorConversation.utils.ts` depends on.
 *
 * The original table (from 20260226234302-tenant-tables.js) was created
 * without this constraint, so every POST to `/advisor/conversations/:domain`
 * returned a Postgres error:
 *   "there is no unique or exclusion constraint matching the ON CONFLICT
 *   specification"
 *
 * The frontend's save path was fire-and-forget with a `.catch(console.error)`
 * so this failed silently — users saw the chat state while the tab was open
 * but lost everything on refresh because nothing was ever persisted.
 *
 * Since saves have never succeeded, no deduplication is needed before adding
 * the constraint — the table is guaranteed to have at most one row per
 * (organization_id, user_id, domain) tuple (in fact, likely empty).
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.advisor_conversations
        ADD CONSTRAINT advisor_conversations_org_user_domain_unique
        UNIQUE (organization_id, user_id, domain);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.advisor_conversations
        DROP CONSTRAINT IF EXISTS advisor_conversations_org_user_domain_unique;
    `);
  },
};
