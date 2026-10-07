/**
 * Gateway configuration catalog for the demo: provider API keys, endpoints and
 * virtual keys. Names tie each app back to the demo use cases seeded by the
 * autoDriver (gateway tables have no FK to projects, so the link is by name).
 *
 * Model ids follow what the real gateway stores:
 *   - endpoint.model is provider-prefixed, exactly as the endpoint form builds it
 *     (`${provider}/${litellmId}`, hence "gemini/gemini/gemini-2.5-flash");
 *   - spend-log model on success is the id the provider returns (unprefixed,
 *     usually dated), on error it is the endpoint's prefixed model.
 */

import crypto from "crypto";
import { Transaction } from "sequelize";
import { sequelize } from "../../../database/db";
import { encrypt } from "../../../utils/encryption.utils";
import {
  batchInsert,
  DAY_MS,
  markedTs,
  pgIntArray,
  pgTextArray,
  SeededRandom,
  sha256Hex,
} from "./common";

// ---------------------------------------------------------------------------
// Pricing (per token, litellm model_prices) and latency profiles
// ---------------------------------------------------------------------------

export interface ModelProfile {
  /** id the provider returns on success, logged in spend_logs.model */
  returnedModel: string;
  inputPerToken: number;
  outputPerToken: number;
  /** latency = baseMs * jitter + completion_tokens * perOutputTokenMs */
  baseLatencyMs: number;
  perOutputTokenMs: number;
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  "anthropic/claude-sonnet-4-5": {
    returnedModel: "claude-sonnet-4-5-20250929",
    inputPerToken: 3e-6,
    outputPerToken: 1.5e-5,
    baseLatencyMs: 900,
    perOutputTokenMs: 11,
  },
  "anthropic/claude-haiku-4-5": {
    returnedModel: "claude-haiku-4-5-20251001",
    inputPerToken: 1e-6,
    outputPerToken: 5e-6,
    baseLatencyMs: 420,
    perOutputTokenMs: 5,
  },
  "openai/gpt-4.1": {
    returnedModel: "gpt-4.1-2025-04-14",
    inputPerToken: 2e-6,
    outputPerToken: 8e-6,
    baseLatencyMs: 700,
    perOutputTokenMs: 10,
  },
  "openai/gpt-4o": {
    returnedModel: "gpt-4o-2024-08-06",
    inputPerToken: 2.5e-6,
    outputPerToken: 1e-5,
    baseLatencyMs: 650,
    perOutputTokenMs: 12,
  },
  "openai/gpt-4o-mini": {
    returnedModel: "gpt-4o-mini-2024-07-18",
    inputPerToken: 1.5e-7,
    outputPerToken: 6e-7,
    baseLatencyMs: 380,
    perOutputTokenMs: 7,
  },
  "openai/text-embedding-3-small": {
    returnedModel: "text-embedding-3-small",
    inputPerToken: 2e-8,
    outputPerToken: 0,
    baseLatencyMs: 190,
    perOutputTokenMs: 0,
  },
  "gemini/gemini/gemini-2.5-flash": {
    returnedModel: "gemini-2.5-flash",
    inputPerToken: 3e-7,
    outputPerToken: 2.5e-6,
    baseLatencyMs: 450,
    perOutputTokenMs: 4,
  },
};

export function costFor(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PROFILES[model];
  return promptTokens * p.inputPerToken + completionTokens * p.outputPerToken;
}

// ---------------------------------------------------------------------------
// Provider API keys
// ---------------------------------------------------------------------------

interface ApiKeyDefinition {
  key_name: string;
  provider: string;
  /** Obviously fake, format-correct provider key (never a real secret). */
  plaintext: (rng: SeededRandom) => string;
  createdDaysAgo: number;
}

export const API_KEYS: ApiKeyDefinition[] = [
  {
    key_name: "OpenAI production",
    provider: "openai",
    plaintext: (rng) => `sk-proj-demo${rng.hex(40)}`,
    createdDaysAgo: 92,
  },
  {
    key_name: "Anthropic production",
    provider: "anthropic",
    plaintext: (rng) => `sk-ant-api03-demo${rng.hex(40)}`,
    createdDaysAgo: 92,
  },
  {
    key_name: "Google AI Studio",
    provider: "gemini",
    plaintext: (rng) => `AIzaSyDemo${rng.hex(29)}`,
    createdDaysAgo: 125,
  },
];

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export interface EndpointDefinition {
  slug: string;
  display_name: string;
  provider: string;
  model: string;
  apiKeyName: string;
  max_tokens: number | null;
  temperature: number | null;
  system_prompt: string | null;
  rate_limit_rpm: number | null;
  fallbackSlug: string | null;
  cache_enabled: boolean;
  cache_ttl_seconds: number;
  /** Prompt slug bound in the endpoint form (display only at runtime). */
  promptSlug: string | null;
  createdDaysAgo: number;
}

export const SUPPORT_SYSTEM_PROMPT =
  "You are the customer support assistant for our online store. Answer questions about orders, " +
  "shipping, returns and accounts using the help-center policies you were given. Be concise and " +
  "friendly. Never ask for full card numbers or passwords. If a request needs a human (refund " +
  "disputes, legal complaints, account security), say you are handing over to an agent.";

export const FAQ_SYSTEM_PROMPT =
  "Answer the customer's question in two or three sentences using only the help-center FAQ. " +
  "If the FAQ does not cover it, reply exactly: I'll connect you with an agent.";

export const ENDPOINTS: EndpointDefinition[] = [
  {
    slug: "support-assistant",
    display_name: "Customer support assistant",
    provider: "anthropic",
    model: "anthropic/claude-sonnet-4-5",
    apiKeyName: "Anthropic production",
    max_tokens: 1024,
    temperature: 0.3,
    system_prompt: SUPPORT_SYSTEM_PROMPT,
    rate_limit_rpm: 600,
    fallbackSlug: "support-assistant-fallback",
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: "support-agent-system",
    createdDaysAgo: 90,
  },
  {
    slug: "support-assistant-fallback",
    display_name: "Customer support assistant (fallback)",
    provider: "anthropic",
    model: "anthropic/claude-haiku-4-5",
    apiKeyName: "Anthropic production",
    max_tokens: 1024,
    temperature: 0.3,
    system_prompt: SUPPORT_SYSTEM_PROMPT,
    rate_limit_rpm: null,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: null,
    createdDaysAgo: 90,
  },
  {
    slug: "support-faq",
    display_name: "Support FAQ answers",
    provider: "openai",
    model: "openai/gpt-4o-mini",
    apiKeyName: "OpenAI production",
    max_tokens: 300,
    temperature: 0.2,
    system_prompt: FAQ_SYSTEM_PROMPT,
    rate_limit_rpm: 1200,
    fallbackSlug: null,
    cache_enabled: true,
    cache_ttl_seconds: 86400,
    promptSlug: null,
    createdDaysAgo: 84,
  },
  {
    slug: "coding-assistant-gpt-4-1",
    display_name: "Internal coding assistant (GPT-4.1)",
    provider: "openai",
    model: "openai/gpt-4.1",
    apiKeyName: "OpenAI production",
    max_tokens: 4096,
    temperature: 0.2,
    system_prompt: null,
    rate_limit_rpm: 300,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: null,
    createdDaysAgo: 86,
  },
  {
    slug: "coding-assistant-sonnet",
    display_name: "Internal coding assistant (Claude Sonnet)",
    provider: "anthropic",
    model: "anthropic/claude-sonnet-4-5",
    apiKeyName: "Anthropic production",
    max_tokens: 8192,
    temperature: null,
    system_prompt: null,
    rate_limit_rpm: 300,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: null,
    createdDaysAgo: 80,
  },
  {
    slug: "recommendation-explanations",
    display_name: "Recommendation explanations",
    provider: "openai",
    model: "openai/gpt-4o-mini",
    apiKeyName: "OpenAI production",
    max_tokens: 200,
    temperature: 0.5,
    system_prompt:
      "Write one short, friendly sentence explaining why a product was recommended to a shopper. " +
      "Only use the signals provided. Never mention age, gender or other protected attributes.",
    rate_limit_rpm: 2000,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: "recommendation-explanation",
    createdDaysAgo: 89,
  },
  {
    slug: "catalog-embeddings",
    display_name: "Product catalog embeddings",
    provider: "openai",
    model: "openai/text-embedding-3-small",
    apiKeyName: "OpenAI production",
    max_tokens: null,
    temperature: null,
    system_prompt: null,
    rate_limit_rpm: null,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: null,
    createdDaysAgo: 89,
  },
  {
    slug: "forecast-narratives",
    display_name: "Demand forecast narratives",
    provider: "openai",
    model: "openai/gpt-4o",
    apiKeyName: "OpenAI production",
    max_tokens: 1500,
    temperature: 0.2,
    system_prompt:
      "You are a supply-chain analyst. Summarize the demand forecast for the planner: key " +
      "changes versus last week, the drivers, stock-out risks and recommended reorder actions.",
    rate_limit_rpm: null,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: null,
    createdDaysAgo: 75,
  },
  {
    slug: "recruitment-cv-summarizer",
    display_name: "Recruitment CV summarizer",
    provider: "openai",
    model: "openai/gpt-4o-mini",
    apiKeyName: "OpenAI production",
    max_tokens: 800,
    temperature: 0,
    system_prompt:
      "Summarize the candidate's experience against the job description in neutral language. " +
      "List matched and missing requirements. Do not infer or mention age, gender, ethnicity, " +
      "nationality, disability or family status, and do not score or rank the candidate.",
    rate_limit_rpm: 60,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: null,
    createdDaysAgo: 46,
  },
  {
    slug: "sandbox-gemini-flash",
    display_name: "Experimentation sandbox (Gemini Flash)",
    provider: "gemini",
    model: "gemini/gemini/gemini-2.5-flash",
    apiKeyName: "Google AI Studio",
    max_tokens: 2048,
    temperature: 0.7,
    system_prompt: null,
    rate_limit_rpm: null,
    fallbackSlug: null,
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    promptSlug: null,
    createdDaysAgo: 124,
  },
];

export const ENDPOINT_SLUGS = ENDPOINTS.map((e) => e.slug);

export function endpointBySlug(slug: string): EndpointDefinition {
  const ep = ENDPOINTS.find((e) => e.slug === slug);
  if (!ep) throw new Error(`Unknown demo endpoint ${slug}`);
  return ep;
}

// ---------------------------------------------------------------------------
// Virtual keys
// ---------------------------------------------------------------------------

export interface VirtualKeyDefinition {
  name: string;
  endpointSlugs: string[];
  max_budget_usd: number | null;
  rate_limit_rpm: number | null;
  allowed_providers: string[];
  blocked_models: string[];
  createdDaysAgo: number;
  /** Revoked keys: days ago the key was revoked. */
  revokedDaysAgo: number | null;
}

export const VIRTUAL_KEYS: VirtualKeyDefinition[] = [
  {
    name: "Support chatbot (prod)",
    endpointSlugs: ["support-assistant", "support-assistant-fallback", "support-faq"],
    max_budget_usd: 40,
    rate_limit_rpm: 600,
    allowed_providers: [],
    blocked_models: [],
    createdDaysAgo: 90,
    revokedDaysAgo: null,
  },
  {
    name: "Coding assistant – IDE agents",
    endpointSlugs: ["coding-assistant-gpt-4-1", "coding-assistant-sonnet"],
    max_budget_usd: 100,
    rate_limit_rpm: 300,
    allowed_providers: [],
    blocked_models: [],
    createdDaysAgo: 86,
    revokedDaysAgo: null,
  },
  {
    name: "Recommendation engine (prod)",
    endpointSlugs: ["recommendation-explanations", "catalog-embeddings"],
    max_budget_usd: 5,
    rate_limit_rpm: 2000,
    allowed_providers: ["openai"],
    blocked_models: ["openai/gpt-4o"],
    createdDaysAgo: 89,
    revokedDaysAgo: null,
  },
  {
    name: "Demand forecasting batch",
    endpointSlugs: ["forecast-narratives"],
    max_budget_usd: null,
    rate_limit_rpm: null,
    allowed_providers: [],
    blocked_models: [],
    createdDaysAgo: 75,
    revokedDaysAgo: null,
  },
  {
    name: "Recruitment screening (pilot)",
    endpointSlugs: ["recruitment-cv-summarizer"],
    max_budget_usd: 5,
    rate_limit_rpm: 60,
    allowed_providers: ["openai"],
    blocked_models: [],
    createdDaysAgo: 46,
    revokedDaysAgo: null,
  },
  {
    // Created before the 90-day window, still used a little: stale_virtual_key.
    name: "Data science sandbox",
    endpointSlugs: ["sandbox-gemini-flash", "recommendation-explanations", "forecast-narratives"],
    max_budget_usd: 10,
    rate_limit_rpm: null,
    allowed_providers: [],
    blocked_models: [],
    createdDaysAgo: 121,
    revokedDaysAgo: null,
  },
  {
    name: "Support widget beta",
    endpointSlugs: ["support-faq"],
    max_budget_usd: 5,
    rate_limit_rpm: 120,
    allowed_providers: [],
    blocked_models: [],
    createdDaysAgo: 84,
    revokedDaysAgo: 38,
  },
];

export const VIRTUAL_KEY_NAMES = VIRTUAL_KEYS.map((v) => v.name);

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

export interface CatalogIds {
  apiKeyIdByName: Map<string, number>;
  endpointIdBySlug: Map<string, number>;
  virtualKeyIdByName: Map<string, number>;
}

/**
 * Inserts API keys, endpoints (with fallback links resolved afterwards) and
 * virtual keys. `promptIdBySlug` binds endpoints to seeded prompts when the
 * prompts module ran.
 */
export async function insertCatalog(
  organizationId: number,
  userId: number,
  now: Date,
  rng: SeededRandom,
  promptIdBySlug: Map<string, number>,
  transaction: Transaction,
): Promise<CatalogIds> {
  const ago = (days: number, extraMs = 0) => new Date(now.getTime() - days * DAY_MS + extraMs);

  // ---- Provider API keys (AES-256-GCM, same format as the gateway) ----
  const apiKeyRows = API_KEYS.map((k) => {
    const createdAt = markedTs(ago(k.createdDaysAgo, rng.int(9, 11) * 3600 * 1000));
    return [
      organizationId,
      k.key_name,
      k.provider,
      encrypt(k.plaintext(rng)),
      true,
      userId,
      createdAt,
      createdAt,
    ];
  });
  const apiKeys = await batchInsert<{ id: number; key_name: string }>(
    "ai_gateway_api_keys",
    [
      "organization_id",
      "key_name",
      "provider",
      "encrypted_key",
      "is_active",
      "created_by",
      "created_at",
      "updated_at",
    ],
    apiKeyRows,
    transaction,
    { returning: "id, key_name" },
  );
  const apiKeyIdByName = new Map(apiKeys.map((r) => [r.key_name, r.id]));

  // ---- Endpoints ----
  const endpointRows = ENDPOINTS.map((ep) => {
    const createdAt = markedTs(ago(ep.createdDaysAgo, rng.int(9, 16) * 3600 * 1000));
    const promptId = ep.promptSlug ? (promptIdBySlug.get(ep.promptSlug) ?? null) : null;
    return [
      organizationId,
      ep.display_name,
      ep.slug,
      ep.provider,
      ep.model,
      apiKeyIdByName.get(ep.apiKeyName) ?? null,
      ep.max_tokens,
      ep.temperature,
      ep.system_prompt,
      ep.rate_limit_rpm,
      true,
      pgIntArray([1, 2, 3, 4]),
      "production",
      promptId,
      ep.cache_enabled,
      ep.cache_ttl_seconds,
      userId,
      createdAt,
      createdAt,
    ];
  });
  const endpoints = await batchInsert<{ id: number; slug: string }>(
    "ai_gateway_endpoints",
    [
      "organization_id",
      "display_name",
      "slug",
      "provider",
      "model",
      "api_key_id",
      "max_tokens",
      "temperature",
      "system_prompt",
      "rate_limit_rpm",
      "is_active",
      "allowed_role_ids",
      "prompt_label",
      "prompt_id",
      "cache_enabled",
      "cache_ttl_seconds",
      "created_by",
      "created_at",
      "updated_at",
    ],
    endpointRows,
    transaction,
    { returning: "id, slug" },
  );
  const endpointIdBySlug = new Map(endpoints.map((r) => [r.slug, r.id]));

  // Fallback links need the ids of both endpoints.
  for (const ep of ENDPOINTS) {
    if (!ep.fallbackSlug) continue;
    await sequelize.query(
      `UPDATE ai_gateway_endpoints SET fallback_endpoint_id = $1 WHERE id = $2 AND organization_id = $3`,
      {
        bind: [
          endpointIdBySlug.get(ep.fallbackSlug),
          endpointIdBySlug.get(ep.slug),
          organizationId,
        ],
        transaction,
      },
    );
  }

  // ---- Virtual keys ----
  // Plaintext keys are random (never derivable), shown once and discarded
  // exactly like the real create flow; only the sha256 hash is stored.
  const vkRows = VIRTUAL_KEYS.map((vk) => {
    const plaintext = `sk-vw-${crypto.randomBytes(16).toString("hex")}`;
    const createdAt = markedTs(ago(vk.createdDaysAgo, rng.int(9, 17) * 3600 * 1000));
    const revokedAt = vk.revokedDaysAgo !== null ? ago(vk.revokedDaysAgo, 15 * 3600 * 1000) : null;
    const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return [
      organizationId,
      sha256Hex(plaintext),
      `${plaintext.slice(0, 12)}...`,
      vk.name,
      pgIntArray(vk.endpointSlugs.map((s) => endpointIdBySlug.get(s) as number)),
      vk.max_budget_usd,
      0,
      nextReset,
      vk.rate_limit_rpm,
      null,
      revokedAt === null,
      revokedAt,
      pgTextArray(vk.allowed_providers),
      pgTextArray(vk.blocked_models),
      userId,
      createdAt,
      revokedAt ? revokedAt.toISOString() : createdAt,
    ];
  });
  const vks = await batchInsert<{ id: number; name: string }>(
    "ai_gateway_virtual_keys",
    [
      "organization_id",
      "key_hash",
      "key_prefix",
      "name",
      "allowed_endpoint_ids",
      "max_budget_usd",
      "current_spend_usd",
      "budget_reset_at",
      "rate_limit_rpm",
      "metadata",
      "is_active",
      "revoked_at",
      "allowed_providers",
      "blocked_models",
      "created_by",
      "created_at",
      "updated_at",
    ],
    vkRows,
    transaction,
    { returning: "id, name" },
  );
  const virtualKeyIdByName = new Map(vks.map((r) => [r.name, r.id]));

  return { apiKeyIdByName, endpointIdBySlug, virtualKeyIdByName };
}
