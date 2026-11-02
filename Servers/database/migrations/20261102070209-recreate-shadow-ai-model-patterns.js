"use strict";

/**
 * Recreate the global Shadow AI model pattern table.
 *
 * shadow_ai_model_patterns maps a destination + URI path to a model name
 * (services/shadowAiModelExtractor.service.ts). Like shadow_ai_tool_registry
 * it is global reference data with no organization_id, it was created and
 * seeded by 20260210000001/20260210000003, and no consolidated migration
 * recreated it. Without it, any ingested event that carries a uri_path fails
 * the whole batch with a 500.
 *
 * This migration:
 *   1. creates verifywise.shadow_ai_model_patterns (original columns, plus a
 *      unique index on name so the copy and seed are idempotent; duplicate
 *      names in a pre-existing verifywise table are removed first, keeping
 *      the lowest id — nothing references these ids);
 *   2. copies rows from a legacy public.shadow_ai_model_patterns, if one
 *      exists (it never drops or changes the public table);
 *   3. inserts the shipped patterns, skipping names already present.
 */

const MODEL_PATTERNS = [
  {
    name: "AWS Bedrock",
    domain_pattern: "bedrock-runtime.%.amazonaws.com",
    path_regex: "/model/(?<model>[^/]+)/invoke",
  },
  {
    name: "Azure OpenAI",
    domain_pattern: "%.openai.azure.com",
    path_regex: "/openai/deployments/(?<model>[^/]+)/",
  },
  {
    name: "Google Vertex AI",
    domain_pattern: "%-aiplatform.googleapis.com",
    path_regex: "/v1/projects/[^/]+/locations/[^/]+/publishers/[^/]+/models/(?<model>[^/:]+)",
  },
  {
    name: "Google Gemini API",
    domain_pattern: "generativelanguage.googleapis.com",
    path_regex: "/v1beta/models/(?<model>[^/:]+)",
  },
  {
    name: "OpenAI API",
    domain_pattern: "api.openai.com",
    path_regex: "/v1/(?:chat/completions|completions|embeddings)",
  },
  {
    name: "Anthropic API",
    domain_pattern: "api.anthropic.com",
    path_regex: "/v1/messages",
  },
  {
    name: "Cohere API",
    domain_pattern: "api.cohere.ai",
    path_regex: "/v1/(?:chat|generate|embed)",
  },
  {
    name: "Together AI",
    domain_pattern: "api.together.xyz",
    path_regex: "/v1/(?:chat/completions|completions)",
  },
  {
    name: "Groq API",
    domain_pattern: "api.groq.com",
    path_regex: "/openai/v1/chat/completions",
  },
];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.shadow_ai_model_patterns (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          domain_pattern VARCHAR(512) NOT NULL,
          path_regex TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.shadow_ai_model_patterns a
          USING verifywise.shadow_ai_model_patterns b
          WHERE a.name = b.name AND a.id > b.id;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_shadow_ai_model_patterns_name
          ON verifywise.shadow_ai_model_patterns (name);`,
        { transaction },
      );

      const [[legacy]] = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.shadow_ai_model_patterns') IS NOT NULL AS exists;`,
        { transaction },
      );

      if (legacy.exists) {
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.shadow_ai_model_patterns
            (name, domain_pattern, path_regex, created_at)
          SELECT name, domain_pattern, path_regex, COALESCE(created_at, NOW())
          FROM public.shadow_ai_model_patterns
          WHERE name IS NOT NULL AND domain_pattern IS NOT NULL AND path_regex IS NOT NULL
          ORDER BY id
          ON CONFLICT (name) DO NOTHING;`,
          { transaction },
        );
      }

      for (const pattern of MODEL_PATTERNS) {
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.shadow_ai_model_patterns (name, domain_pattern, path_regex)
          VALUES (:name, :domain_pattern, :path_regex)
          ON CONFLICT (name) DO NOTHING;`,
          { replacements: pattern, transaction },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    // Only the verifywise copy is this migration's; a legacy
    // public.shadow_ai_model_patterns is left exactly as it was.
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.shadow_ai_model_patterns;",
    );
  },
};
