"use strict";

/**
 * Convert `api_tokens.expires_at`, `created_at`, and `last_used_at` from naive
 * `TIMESTAMP` to `TIMESTAMPTZ`.
 *
 * Why: the columns were created as bare `TIMESTAMP` (no time zone). The auth
 * hot path compares `expires_at > NOW()` in getActiveApiTokenByHashQuery, and
 * `NOW()` is `timestamptz`. Comparing a naive `TIMESTAMP` against `NOW()`
 * forces Postgres to reinterpret the stored value in the *session* timezone,
 * so the effective expiry shifts by the session's UTC offset (and across DST).
 * A negative-offset session would let an expired token authenticate longer —
 * a security-relevant drift. Values are written as JS `Date` (UTC instants),
 * so making the columns timezone-aware is the correct fix.
 *
 * This mirrors 20260409010003-advisor-conversations-timestamptz.js, which
 * fixed the same column-type class on another table.
 *
 * Conversion semantics: existing naive values were written as UTC instants, so
 * the explicit `USING ... AT TIME ZONE 'UTC'` reinterprets them as UTC
 * deterministically, independent of the migration session's timezone.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.api_tokens
        ALTER COLUMN expires_at TYPE TIMESTAMPTZ
          USING expires_at AT TIME ZONE 'UTC',
        ALTER COLUMN created_at TYPE TIMESTAMPTZ
          USING created_at AT TIME ZONE 'UTC',
        ALTER COLUMN last_used_at TYPE TIMESTAMPTZ
          USING last_used_at AT TIME ZONE 'UTC';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.api_tokens
        ALTER COLUMN expires_at TYPE TIMESTAMP
          USING expires_at AT TIME ZONE 'UTC',
        ALTER COLUMN created_at TYPE TIMESTAMP
          USING created_at AT TIME ZONE 'UTC',
        ALTER COLUMN last_used_at TYPE TIMESTAMP
          USING last_used_at AT TIME ZONE 'UTC';
    `);
  },
};
