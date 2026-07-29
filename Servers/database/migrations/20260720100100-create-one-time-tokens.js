"use strict";

/**
 * One-time tokens (password reset links).
 *
 * Password-reset tokens were previously stateless, 1-week, multi-use JWTs:
 * anyone holding the link could reset the account password repeatedly.
 * This table stores a SHA-256 hash of each issued token so the reset
 * middleware can atomically consume it (single-use) and reject expired ones.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.one_time_tokens (
        id SERIAL PRIMARY KEY,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL,
        purpose VARCHAR(32) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_one_time_tokens_email ON verifywise.one_time_tokens(email);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.one_time_tokens;`);
  },
};
