"use strict";

/**
 * Copy LLM Evals provider keys into AI Gateway key storage so a single
 * encrypted store backs evals + gateway. Skips when the org already has an
 * active gateway key for the same logical provider (google/gemini treated as one).
 */

module.exports = {
  async up(queryInterface) {
    // Guard: skip if either table doesn't exist yet.
    // ai_gateway_api_keys is created by the AIGateway Alembic migration
    // (AIGateway/src/database/migrations/versions/a0001_create_ai_gateway_tables.py).
    // If the AIGateway hasn't been initialised, this migration is a no-op and
    // the data copy can be triggered manually once AIGateway is running.
    const [[{ exists: gatewayTableExists }]] = await queryInterface.sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'verifywise'
          AND table_name   = 'ai_gateway_api_keys'
      ) AS exists;
    `);

    if (!gatewayTableExists) {
      console.log(
        "[migrate-llm-evals-keys-to-ai-gateway] ai_gateway_api_keys does not exist yet " +
          "(AIGateway not initialised) — skipping data copy.",
      );
      return;
    }

    const [[{ exists: evalsTableExists }]] = await queryInterface.sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'verifywise'
          AND table_name   = 'llm_evals_api_keys'
      ) AS exists;
    `);

    if (!evalsTableExists) {
      console.log(
        "[migrate-llm-evals-keys-to-ai-gateway] llm_evals_api_keys does not exist — nothing to migrate.",
      );
      return;
    }

    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.ai_gateway_api_keys (
        organization_id,
        key_name,
        provider,
        encrypted_key,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        e.organization_id,
        'Migrated from LLM Evals',
        CASE WHEN LOWER(e.provider) = 'google' THEN 'gemini' ELSE LOWER(e.provider) END,
        e.api_key_encrypted,
        true,
        COALESCE(e.created_at, NOW()),
        COALESCE(e.updated_at, NOW())
      FROM verifywise.llm_evals_api_keys e
      WHERE NOT EXISTS (
        SELECT 1
        FROM verifywise.ai_gateway_api_keys g
        WHERE g.organization_id = e.organization_id
          AND g.is_active = true
          AND (
            CASE
              WHEN LOWER(e.provider) IN ('google', 'gemini') THEN
                LOWER(g.provider) IN ('google', 'gemini')
              ELSE LOWER(g.provider) = LOWER(e.provider)
            END
          )
      );
    `);
  },

  async down(queryInterface) {
    const [[{ exists }]] = await queryInterface.sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'verifywise'
          AND table_name   = 'ai_gateway_api_keys'
      ) AS exists;
    `);
    if (!exists) return;

    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.ai_gateway_api_keys
      WHERE key_name = 'Migrated from LLM Evals';
    `);
  },
};
