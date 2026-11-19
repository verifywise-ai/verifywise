/**
 * The extra models the demo-org seeder (demoOrg.ts) adds through the API.
 *
 * Kept apart from demoOrg.ts so tests can import it: importing demoOrg.ts runs
 * the seed.
 */

// The extra models this step owns, keyed by provider_model. Kept as a constant
// so both the insert and the idempotent pre-delete reference the same set.
const MODELS = [
  {
    provider_model: "GPT-4o",
    model: "GPT-4o",
    provider: "OpenAI",
    version: "2024-08",
    status: "Approved",
    hosting_provider: "Azure",
  },
  {
    provider_model: "GPT-4o mini",
    model: "GPT-4o mini",
    provider: "OpenAI",
    version: "2024-07",
    status: "Approved",
    hosting_provider: "Azure",
  },
  {
    provider_model: "o1",
    model: "o1",
    provider: "OpenAI",
    version: "1",
    status: "Approved",
    hosting_provider: "Azure",
  },
  {
    provider_model: "GPT-4.1",
    model: "GPT-4.1",
    provider: "OpenAI",
    version: "2025-04",
    status: "Pending",
    hosting_provider: "Azure",
  },
  {
    provider_model: "Claude Sonnet 4.5",
    model: "Claude Sonnet 4.5",
    provider: "Anthropic",
    version: "4.5",
    status: "Approved",
    hosting_provider: "AWS Bedrock",
  },
  {
    provider_model: "Claude Opus 4.1",
    model: "Claude Opus 4.1",
    provider: "Anthropic",
    version: "4.1",
    status: "Approved",
    hosting_provider: "AWS Bedrock",
  },
  {
    provider_model: "Llama 3.1 70B",
    model: "Llama 3.1 70B",
    provider: "Meta",
    version: "3.1",
    status: "Restricted",
    hosting_provider: "Self-hosted",
  },
];

// Marked as demo data, so "Delete demo data" (DELETE /api/autoDrivers)
// removes them with the rest of the demo.
export const EXTRA_MODELS = MODELS.map((m) => ({ ...m, is_demo: true as const }));
