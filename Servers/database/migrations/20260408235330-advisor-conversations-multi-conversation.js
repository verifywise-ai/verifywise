'use strict';

/**
 * Add multi-conversation support to `advisor_conversations`.
 *
 * Original shape enforced exactly one conversation per (organization_id,
 * user_id, domain) via the unique constraint added in the previous
 * migration. This migration:
 *
 *   1. Drops that unique constraint — users can now have many conversations
 *      per advisor domain.
 *   2. Adds `title VARCHAR(120)` so each conversation has a label (derived
 *      from the first user message at save time, backfilled here for any
 *      pre-existing rows).
 *   3. Adds `last_message_at TIMESTAMPTZ` for ordering the conversation list
 *      (the UI shows most-recently-active first). Backfilled from
 *      `updated_at` for existing rows.
 *   4. Adds a composite index on `(organization_id, user_id, domain,
 *      last_message_at DESC)` so listing a user's conversations per domain
 *      is a single index scan.
 *
 * Backfill strategy for existing rows: titles default to the text of the
 * first user message (truncated to 80 chars) or the string 'Conversation'
 * if no user message exists. `last_message_at` copies `updated_at`.
 */

module.exports = {
  async up(queryInterface) {
    // 1. Drop the unique constraint that enforced one-per-domain
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.advisor_conversations
        DROP CONSTRAINT IF EXISTS advisor_conversations_org_user_domain_unique;
    `);

    // 2. Add title and last_message_at columns (nullable for the backfill step)
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.advisor_conversations
        ADD COLUMN IF NOT EXISTS title VARCHAR(120),
        ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
    `);

    // 3. Backfill last_message_at from updated_at for existing rows
    await queryInterface.sequelize.query(`
      UPDATE verifywise.advisor_conversations
         SET last_message_at = updated_at
       WHERE last_message_at IS NULL;
    `);

    // 4. Backfill title from the first user message in the JSONB messages
    //    array. Falls back to 'Conversation' when there are no user messages.
    //    `messages` is JSONB DEFAULT '[]' so jsonb_array_elements is safe.
    await queryInterface.sequelize.query(`
      UPDATE verifywise.advisor_conversations AS c
         SET title = COALESCE(
           (
             SELECT LEFT(msg->>'content', 80)
               FROM jsonb_array_elements(c.messages) AS msg
              WHERE msg->>'role' = 'user'
                AND COALESCE(msg->>'content', '') <> ''
              LIMIT 1
           ),
           'Conversation'
         )
       WHERE title IS NULL;
    `);

    // 5. Composite index for the listConversations query path. DESC on
    //    last_message_at matches the ORDER BY in listConversationsQuery so
    //    Postgres can walk the index without a sort step.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS advisor_conversations_list_idx
        ON verifywise.advisor_conversations
          (organization_id, user_id, domain, last_message_at DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.advisor_conversations_list_idx;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.advisor_conversations
        DROP COLUMN IF EXISTS last_message_at,
        DROP COLUMN IF EXISTS title;
    `);

    // Best-effort: if pre-existing data violates the old unique constraint
    // (which is now possible because users may have created multiple
    // conversations per domain), the down migration cannot reinstate it
    // without deleting rows. We leave the constraint off on rollback — the
    // previous migration's down() handled that case too.
  },
};
