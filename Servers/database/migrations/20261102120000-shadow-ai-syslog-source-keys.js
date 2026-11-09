"use strict";

/**
 * Per-source keys and listener stats for shadow_ai_syslog_config.
 *
 * - key_hash / key_prefix: SHA-256 of the source key and its first 16 chars.
 *   Existing rows stay NULL until a key is generated for them. The unique
 *   index allows many NULLs (PostgreSQL treats NULLs as distinct).
 * - last_event_at, events_accepted, events_dropped, last_drop_reason: updated
 *   by the TCP listener.
 * - source_identifier is the allowed sender IP. It was already nullable and is
 *   left alone: legacy rows may hold a hostname that is no longer valid input
 *   but must survive.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      ALTER TABLE verifywise.shadow_ai_syslog_config
        ADD COLUMN IF NOT EXISTS key_hash VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS events_accepted BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS events_dropped BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_drop_reason VARCHAR(50) NULL;
    `);

    await sql.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS shadow_ai_syslog_config_key_hash_uq
        ON verifywise.shadow_ai_syslog_config (key_hash);
    `);
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`DROP INDEX IF EXISTS verifywise.shadow_ai_syslog_config_key_hash_uq;`);
    await sql.query(`
      ALTER TABLE verifywise.shadow_ai_syslog_config
        DROP COLUMN IF EXISTS key_hash,
        DROP COLUMN IF EXISTS key_prefix,
        DROP COLUMN IF EXISTS last_event_at,
        DROP COLUMN IF EXISTS events_accepted,
        DROP COLUMN IF EXISTS events_dropped,
        DROP COLUMN IF EXISTS last_drop_reason;
    `);
  },
};
