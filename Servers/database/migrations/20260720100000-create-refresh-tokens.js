"use strict";

/**
 * Refresh token persistence for rotation + revocation.
 *
 * Stores a SHA-256 hash of every issued refresh token, grouped into
 * rotation "families". Rotating on every refresh and revoking the whole
 * family when an already-rotated (reused) token is presented limits the
 * damage of a stolen refresh token and enables server-side logout.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        family_id UUID NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON verifywise.refresh_tokens(user_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON verifywise.refresh_tokens(family_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.refresh_tokens;`);
  },
};
