"use strict";

/**
 * OAuth for the MCP server (/api/mcp): an MCP client such as Claude Code signs
 * in through the browser instead of being given an API token.
 *
 * - oauth_clients: clients registered through dynamic client registration
 *   (RFC 7591). A confidential client's secret is stored encrypted.
 * - oauth_authorization_codes: single-use codes issued when a user allows a
 *   client, stored as SHA-256 hashes, bound to the PKCE challenge, redirect URI
 *   and resource they were issued for.
 * - oauth_grants: one per allowed connection (client, user, organization).
 *   Revoking it stops its access and refresh tokens at once.
 * - oauth_refresh_tokens: SHA-256 hashes of issued refresh tokens, rotated on
 *   every use; presenting a rotated one revokes the grant.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.oauth_clients (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(64) NOT NULL UNIQUE,
        client_info JSONB NOT NULL,
        client_secret_encrypted TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.oauth_authorization_codes (
        id SERIAL PRIMARY KEY,
        code_hash VARCHAR(64) NOT NULL UNIQUE,
        client_id VARCHAR(64) NOT NULL REFERENCES verifywise.oauth_clients(client_id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        redirect_uri TEXT NOT NULL,
        code_challenge VARCHAR(128) NOT NULL,
        resource TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.oauth_grants (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(64) NOT NULL REFERENCES verifywise.oauth_clients(client_id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_grants_user ON verifywise.oauth_grants(user_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.oauth_refresh_tokens (
        id SERIAL PRIMARY KEY,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        grant_id INTEGER NOT NULL REFERENCES verifywise.oauth_grants(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        rotated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_grant ON verifywise.oauth_refresh_tokens(grant_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.oauth_refresh_tokens;`);
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.oauth_grants;`);
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS verifywise.oauth_authorization_codes;`,
    );
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.oauth_clients;`);
  },
};
