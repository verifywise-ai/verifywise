"use strict";

/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion)
 *
 * mrm_ingestion_tokens: per-org, named, revocable machine-to-machine tokens
 * used by a customer's headless pipeline to push metrics. The plaintext token
 * is shown once on creation; only a HASH is stored here (never the plaintext).
 *
 * - model_inventory_id NULL  => org-wide token (may push for any model in the org)
 * - model_inventory_id set    => token scoped to a single model
 * - revoked_at   NULL => active; set => revoked (soft, keeps the audit record)
 *
 * Every ingested metric records which token wrote it (mrm_metrics.ingestion_token_id).
 * Tenant-scoped by organization_id.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_ingestion_tokens (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          -- Only the hash of the token is stored. The plaintext is shown once on creation.
          -- UNIQUE: a token hash is a global identifier; the auth path matches
          -- exactly one row. Without this, a lookup could return multiple rows and
          -- silently pick a revoked token over the active one.
          token_hash VARCHAR(255) NOT NULL UNIQUE,
          -- NULL = org-wide token; set = scoped to a single model.
          model_inventory_id INTEGER REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
          last_used_at TIMESTAMP WITH TIME ZONE,
          -- NULL = active; set = revoked (soft delete, preserved for audit).
          revoked_at TIMESTAMP WITH TIME ZONE,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_ingestion_tokens_org
          ON verifywise.mrm_ingestion_tokens(organization_id);
        -- No separate token_hash index needed: the UNIQUE constraint above already
        -- creates one, which the hash-lookup auth path uses.
      `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.mrm_ingestion_tokens CASCADE;",
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
