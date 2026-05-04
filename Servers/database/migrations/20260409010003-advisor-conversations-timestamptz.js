"use strict";

/**
 * Convert `advisor_conversations.created_at` and `updated_at` from naive
 * `TIMESTAMP` to `TIMESTAMPTZ` so they round-trip correctly through the
 * pg driver as Date objects (which `JSON.stringify` serializes as ISO
 * UTC strings — what the frontend expects).
 *
 * Why: the original tenant-tables migration created these columns as
 * `TIMESTAMP DEFAULT NOW()`. Postgres stores naive timestamps in the
 * session timezone with no offset attached, and the pg driver returns
 * them as plain strings ("2026-04-09 04:00:00.123") with no `Z` suffix.
 * On the frontend `dayjs(string).fromNow()` interprets such strings in
 * the user's local timezone, which is wrong by exactly the difference
 * between the server's session TZ and the user's browser TZ.
 *
 * The fix is to make these columns timezone-aware. `last_message_at`
 * (added by 20260408235330-advisor-conversations-multi-conversation.js)
 * is already `TIMESTAMPTZ` for this same reason — this brings the other
 * two columns in line.
 *
 * Conversion semantics: Postgres reinterprets existing naive values as
 * being in the SESSION timezone when ALTER TYPE runs. We pass an explicit
 * `USING ... AT TIME ZONE 'UTC'` so the conversion is deterministic and
 * does not depend on whatever the migration session happens to be in.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.advisor_conversations
        ALTER COLUMN created_at TYPE TIMESTAMPTZ
          USING created_at AT TIME ZONE 'UTC',
        ALTER COLUMN updated_at TYPE TIMESTAMPTZ
          USING updated_at AT TIME ZONE 'UTC';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.advisor_conversations
        ALTER COLUMN created_at TYPE TIMESTAMP
          USING created_at AT TIME ZONE 'UTC',
        ALTER COLUMN updated_at TYPE TIMESTAMP
          USING updated_at AT TIME ZONE 'UTC';
    `);
  },
};
