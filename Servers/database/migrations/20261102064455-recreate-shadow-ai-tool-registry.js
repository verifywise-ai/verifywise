"use strict";

/**
 * Recreate the global Shadow AI tool registry.
 *
 * shadow_ai_tool_registry is the catalogue of known AI tools (name, vendor,
 * domains, risk flags) that services/shadowAiToolMatcher.service.ts matches
 * event destinations against. It is global reference data with no
 * organization_id: every organization matches against the same catalogue, and
 * a match is copied into the org's own shadow_ai_tools row by name.
 *
 * It was created and seeded by 20260210000001/20260210000003, which were
 * folded away when the schema was consolidated into `verifywise`, and no
 * consolidated migration recreated it. Fresh installs therefore had no
 * registry, and older installs kept theirs in `public`, which the app never
 * reads (search_path is `verifywise` only).
 *
 * This migration:
 *   1. creates verifywise.shadow_ai_tool_registry (original columns, plus a
 *      unique index on name so the seed and copy are idempotent; duplicate
 *      names in a pre-existing verifywise table are removed first, keeping
 *      the lowest id — tenant tools copy by name, so nothing references
 *      these ids);
 *   2. inserts the shipped catalogue, skipping names already present;
 *   3. copies rows from a legacy public.shadow_ai_tool_registry, if one
 *      exists, for names the shipped catalogue does not cover (custom
 *      additions). The app never read the public copy (search_path is
 *      `verifywise` only), so the shipped entries win; the public table is
 *      never dropped or changed.
 *
 * Matching is host-only (shadowAiToolMatcher compares the destination host),
 * so every domain is a bare host: the original Grok entry's "x.com/i/grok"
 * could never match and is replaced by grok.com.
 */

const TOOL_REGISTRY = [
  // Chatbots & Assistants
  {
    name: "ChatGPT",
    vendor: "OpenAI",
    domains: ["chat.openai.com", "chatgpt.com"],
    category: "chatbot",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
      "o1",
      "o1-mini",
      "o3-mini",
    ],
    trains_on_data: true,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Claude AI",
    vendor: "Anthropic",
    domains: ["claude.ai"],
    category: "chatbot",
    models: ["claude-opus-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Gemini",
    vendor: "Google",
    domains: ["gemini.google.com"],
    category: "chatbot",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    trains_on_data: true,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Copilot",
    vendor: "Microsoft",
    domains: ["copilot.microsoft.com", "copilot.cloud.microsoft"],
    category: "chatbot",
    models: ["gpt-4"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Perplexity",
    vendor: "Perplexity AI",
    domains: ["perplexity.ai", "www.perplexity.ai"],
    category: "chatbot",
    models: ["sonar-pro", "sonar"],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Poe",
    vendor: "Quora",
    domains: ["poe.com"],
    category: "chatbot",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "You.com",
    vendor: "You.com",
    domains: ["you.com"],
    category: "chatbot",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Pi",
    vendor: "Inflection AI",
    domains: ["pi.ai"],
    category: "chatbot",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "DeepSeek",
    vendor: "DeepSeek",
    domains: ["chat.deepseek.com", "deepseek.com"],
    category: "chatbot",
    models: ["deepseek-v3", "deepseek-r1"],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Mistral Chat",
    vendor: "Mistral AI",
    domains: ["chat.mistral.ai"],
    category: "chatbot",
    models: ["mistral-large", "mistral-medium", "mistral-small"],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: true,
  },
  {
    name: "Grok",
    vendor: "xAI",
    domains: ["grok.com", "grok.x.ai"],
    category: "chatbot",
    models: ["grok-2", "grok-3"],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Character.AI",
    vendor: "Character.AI",
    domains: ["character.ai", "beta.character.ai"],
    category: "chatbot",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },

  // Coding Assistants
  {
    name: "GitHub Copilot",
    vendor: "GitHub/Microsoft",
    domains: ["copilot.github.com", "copilot.githubassets.com", "githubcopilot.com"],
    category: "coding_assistant",
    models: ["gpt-4o", "claude-sonnet-4-5"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Cursor",
    vendor: "Anysphere",
    domains: ["cursor.sh", "cursor.com", "api2.cursor.sh"],
    category: "coding_assistant",
    models: ["gpt-4o", "claude-sonnet-4-5"],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Replit AI",
    vendor: "Replit",
    domains: ["replit.com"],
    category: "coding_assistant",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Codeium / Windsurf",
    vendor: "Codeium",
    domains: ["codeium.com", "windsurf.ai"],
    category: "coding_assistant",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Tabnine",
    vendor: "Tabnine",
    domains: ["tabnine.com", "app.tabnine.com"],
    category: "coding_assistant",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Amazon CodeWhisperer",
    vendor: "Amazon",
    domains: ["codewhisperer.aws"],
    category: "coding_assistant",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "v0.dev",
    vendor: "Vercel",
    domains: ["v0.dev"],
    category: "coding_assistant",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Bolt",
    vendor: "StackBlitz",
    domains: ["bolt.new"],
    category: "coding_assistant",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Lovable",
    vendor: "Lovable",
    domains: ["lovable.dev"],
    category: "coding_assistant",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },

  // Image Generation
  {
    name: "Midjourney",
    vendor: "Midjourney",
    domains: ["midjourney.com", "www.midjourney.com"],
    category: "image_gen",
    models: ["midjourney-v6"],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "DALL-E",
    vendor: "OpenAI",
    domains: ["labs.openai.com"],
    category: "image_gen",
    models: ["dall-e-3", "dall-e-2"],
    trains_on_data: true,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Stable Diffusion (DreamStudio)",
    vendor: "Stability AI",
    domains: ["dreamstudio.ai", "stability.ai"],
    category: "image_gen",
    models: ["sdxl", "sd-3"],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Leonardo.AI",
    vendor: "Leonardo.AI",
    domains: ["leonardo.ai", "app.leonardo.ai"],
    category: "image_gen",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Adobe Firefly",
    vendor: "Adobe",
    domains: ["firefly.adobe.com"],
    category: "image_gen",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Ideogram",
    vendor: "Ideogram",
    domains: ["ideogram.ai"],
    category: "image_gen",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },

  // Writing & Content
  {
    name: "Jasper",
    vendor: "Jasper AI",
    domains: ["jasper.ai", "app.jasper.ai"],
    category: "writing",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Grammarly AI",
    vendor: "Grammarly",
    domains: ["grammarly.com", "app.grammarly.com"],
    category: "writing",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Copy.ai",
    vendor: "Copy.ai",
    domains: ["copy.ai", "app.copy.ai"],
    category: "writing",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Writesonic",
    vendor: "Writesonic",
    domains: ["writesonic.com", "app.writesonic.com"],
    category: "writing",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Wordtune",
    vendor: "AI21 Labs",
    domains: ["wordtune.com", "app.wordtune.com"],
    category: "writing",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },

  // Productivity & Enterprise AI
  {
    name: "Notion AI",
    vendor: "Notion",
    domains: ["notion.so", "www.notion.so"],
    category: "productivity",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Glean",
    vendor: "Glean",
    domains: ["glean.com", "app.glean.com"],
    category: "productivity",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },

  // AI API Platforms
  {
    name: "OpenAI API",
    vendor: "OpenAI",
    domains: ["api.openai.com"],
    category: "api_platform",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini", "o3-mini"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Anthropic API",
    vendor: "Anthropic",
    domains: ["api.anthropic.com"],
    category: "api_platform",
    models: ["claude-opus-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Google Vertex AI",
    vendor: "Google",
    domains: [
      "us-central1-aiplatform.googleapis.com",
      "us-east1-aiplatform.googleapis.com",
      "europe-west1-aiplatform.googleapis.com",
    ],
    category: "api_platform",
    models: ["gemini-2.0-flash", "gemini-1.5-pro"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Google Gemini API",
    vendor: "Google",
    domains: ["generativelanguage.googleapis.com"],
    category: "api_platform",
    models: ["gemini-2.0-flash", "gemini-1.5-pro"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "AWS Bedrock",
    vendor: "Amazon",
    domains: [
      "bedrock-runtime.us-east-1.amazonaws.com",
      "bedrock-runtime.us-west-2.amazonaws.com",
      "bedrock-runtime.eu-west-1.amazonaws.com",
    ],
    category: "api_platform",
    models: ["anthropic.claude-v2", "amazon.titan-text-express-v1"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Azure OpenAI",
    vendor: "Microsoft",
    domains: ["openai.azure.com"],
    category: "api_platform",
    models: ["gpt-4o", "gpt-4-turbo"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Cohere",
    vendor: "Cohere",
    domains: ["api.cohere.ai", "dashboard.cohere.ai"],
    category: "api_platform",
    models: ["command-r-plus", "command-r"],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Together AI",
    vendor: "Together AI",
    domains: ["api.together.xyz", "together.ai"],
    category: "api_platform",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Groq",
    vendor: "Groq",
    domains: ["api.groq.com", "groq.com"],
    category: "api_platform",
    models: ["llama-3.1-70b", "mixtral-8x7b"],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Fireworks AI",
    vendor: "Fireworks AI",
    domains: ["api.fireworks.ai", "fireworks.ai"],
    category: "api_platform",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "OpenRouter",
    vendor: "OpenRouter",
    domains: ["openrouter.ai", "api.openrouter.ai"],
    category: "api_platform",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },

  // AI/ML Platforms
  {
    name: "Hugging Face",
    vendor: "Hugging Face",
    domains: ["huggingface.co", "api-inference.huggingface.co"],
    category: "ml_platform",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },
  {
    name: "Replicate",
    vendor: "Replicate",
    domains: ["replicate.com", "api.replicate.com"],
    category: "ml_platform",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Weights & Biases",
    vendor: "Weights & Biases",
    domains: ["wandb.ai", "api.wandb.ai"],
    category: "ml_platform",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },

  // Video & Audio AI
  {
    name: "Runway",
    vendor: "Runway",
    domains: ["runwayml.com", "app.runwayml.com"],
    category: "video_gen",
    models: ["gen-3"],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "ElevenLabs",
    vendor: "ElevenLabs",
    domains: ["elevenlabs.io", "api.elevenlabs.io"],
    category: "audio_gen",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Suno",
    vendor: "Suno",
    domains: ["suno.com", "app.suno.ai"],
    category: "audio_gen",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Udio",
    vendor: "Udio",
    domains: ["udio.com", "www.udio.com"],
    category: "audio_gen",
    models: [],
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Descript",
    vendor: "Descript",
    domains: ["descript.com", "app.descript.com"],
    category: "audio_gen",
    models: [],
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
  },

  // Research & Data
  {
    name: "Elicit",
    vendor: "Elicit",
    domains: ["elicit.com", "elicit.org"],
    category: "research",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
  {
    name: "Consensus",
    vendor: "Consensus",
    domains: ["consensus.app"],
    category: "research",
    models: [],
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
  },
];

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.shadow_ai_tool_registry (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          vendor VARCHAR(255),
          domains TEXT[] NOT NULL,
          category VARCHAR(100),
          models TEXT[],
          trains_on_data BOOLEAN,
          soc2_certified BOOLEAN,
          gdpr_compliant BOOLEAN,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.shadow_ai_tool_registry a
          USING verifywise.shadow_ai_tool_registry b
          WHERE a.name = b.name AND a.id > b.id;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_shadow_ai_tool_registry_name
          ON verifywise.shadow_ai_tool_registry (name);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_shadow_ai_tool_registry_domains
          ON verifywise.shadow_ai_tool_registry USING GIN (domains);`,
        { transaction },
      );

      for (const tool of TOOL_REGISTRY) {
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.shadow_ai_tool_registry
            (name, vendor, domains, category, models,
             trains_on_data, soc2_certified, gdpr_compliant)
          VALUES
            (:name, :vendor, ARRAY[:domains]::text[], :category, ARRAY[:models]::text[],
             :trains_on_data, :soc2_certified, :gdpr_compliant)
          ON CONFLICT (name) DO NOTHING;`,
          {
            replacements: {
              name: tool.name,
              vendor: tool.vendor,
              domains: tool.domains,
              category: tool.category,
              models: tool.models,
              trains_on_data: tool.trains_on_data,
              soc2_certified: tool.soc2_certified,
              gdpr_compliant: tool.gdpr_compliant,
            },
            transaction,
          },
        );
      }

      const [[legacy]] = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.shadow_ai_tool_registry') IS NOT NULL AS exists;`,
        { transaction },
      );

      if (legacy.exists) {
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.shadow_ai_tool_registry
            (name, vendor, domains, category, models,
             trains_on_data, soc2_certified, gdpr_compliant, created_at, updated_at)
          SELECT name, vendor, domains, category, models,
                 trains_on_data, soc2_certified, gdpr_compliant,
                 COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
          FROM public.shadow_ai_tool_registry
          WHERE name IS NOT NULL AND domains IS NOT NULL
          ORDER BY id
          ON CONFLICT (name) DO NOTHING;`,
          { transaction },
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
    // public.shadow_ai_tool_registry is left exactly as it was.
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.shadow_ai_tool_registry;",
    );
  },
};
