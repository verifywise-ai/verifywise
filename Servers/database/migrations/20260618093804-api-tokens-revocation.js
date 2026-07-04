"use strict";

/**
 * Make api_tokens a first-class, revocable credential.
 *
 * Before this migration the api_tokens table stored the full signed JWT in
 * plaintext and was never consulted by the auth middleware, so tokens could
 * not be revoked and the stored value leaked usable credentials.
 *
 * Changes:
 *   - revoked       BOOLEAN — soft-revoke flag (keeps an audit trail)
 *   - last_used_at  TIMESTAMP — touched on each authenticated request
 *   - the `token` column now stores a SHA-256 hash of the JWT, not the JWT
 *     itself. Any rows created before this migration hold a plaintext JWT and
 *     can no longer authenticate; that is acceptable because those tokens were
 *     never validated against this table and therefore never worked as API
 *     tokens in the first place. They are cleared so stale plaintext secrets
 *     are not left at rest.
 *   - index on (organization_id, token) to make hash lookups on the auth hot
 *     path efficient.
 */
module.exports = {
  async up(queryInterface) {
    // Run all three statements in one transaction so a partial failure (e.g. a
    // lock timeout on CREATE INDEX) rolls back the destructive UPDATE below
    // rather than leaving a half-migrated table.
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.api_tokens
          ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;
      `,
        { transaction },
      );

      // Every row that exists before this migration holds a plaintext JWT in the
      // `token` column, not a hash. Those tokens never authenticated against this
      // table, so retire them: revoke the row and null out the plaintext secret.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.api_tokens SET revoked = true, token = NULL;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_api_tokens_org_token
          ON verifywise.api_tokens (organization_id, token);
      `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_api_tokens_org_token;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.api_tokens
          DROP COLUMN IF EXISTS revoked,
          DROP COLUMN IF EXISTS last_used_at;
      `,
        { transaction },
      );
    });
  },
};
