/**
 * AI Gateway demo data for the autoDriver.
 *
 * The AI Gateway (FastAPI service) stores usage/spend in a single fact table,
 * `ai_gateway_spend_logs`, in the same `verifywise` Postgres database. Every
 * spend/usage dashboard is computed on the fly with SUM/COUNT/AVG over that
 * table (there is no rollup table), so seeded rows appear immediately.
 *
 * This module seeds a small, realistic set of gateway config (endpoints +
 * virtual keys) and ~30 days of spend logs so the AI Gateway spend dashboard,
 * logs table, and by-endpoint/provider/user/tag breakdowns are populated for a
 * demo organization without any real LLM traffic.
 *
 * It participates in the autoDriver transaction and mirrors the
 * insert/delete + existence-guard + idempotency conventions of
 * shadowAiDemoData.ts.
 */

import { Transaction, QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic output)
// ---------------------------------------------------------------------------

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  /** true with probability p */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

// ---------------------------------------------------------------------------
// Config definitions
// ---------------------------------------------------------------------------

interface EndpointDefinition {
  display_name: string;
  slug: string;
  provider: string;
  model: string;
  // approximate per-1K-token blended cost used to derive realistic cost_usd
  cost_per_1k: number;
  // relative share of traffic
  weight: number;
  avg_latency_ms: number;
  // typical prompt/completion token ranges
  prompt_range: [number, number];
  completion_range: [number, number];
}

const ENDPOINTS: EndpointDefinition[] = [
  {
    display_name: "GPT-4o (chat)",
    slug: "gpt-4o-chat",
    provider: "openai",
    model: "gpt-4o",
    cost_per_1k: 0.005,
    weight: 5,
    avg_latency_ms: 1400,
    prompt_range: [300, 2200],
    completion_range: [120, 900],
  },
  {
    display_name: "Claude Sonnet (chat)",
    slug: "claude-sonnet-chat",
    provider: "anthropic",
    model: "claude-3-5-sonnet",
    cost_per_1k: 0.006,
    weight: 4,
    avg_latency_ms: 1650,
    prompt_range: [400, 2600],
    completion_range: [150, 1100],
  },
  {
    display_name: "Text embeddings",
    slug: "text-embeddings",
    provider: "openai",
    model: "text-embedding-3-small",
    cost_per_1k: 0.00002,
    weight: 3,
    avg_latency_ms: 220,
    prompt_range: [50, 800],
    completion_range: [0, 0],
  },
];

interface VirtualKeyDefinition {
  name: string;
  key_prefix: string;
  key_hash: string;
}

const VIRTUAL_KEYS: VirtualKeyDefinition[] = [
  {
    name: "Recommendation Engine (prod)",
    key_prefix: "vw-demo-rec",
    key_hash: "demo-vk-recommendation-engine-0000000000000000000000000000",
  },
  {
    name: "Coding Assistant (internal)",
    key_prefix: "vw-demo-cod",
    key_hash: "demo-vk-coding-assistant-000000000000000000000000000000000000",
  },
];

// Metadata tags surfaced by the "spend by tag" chart.
const TAGS = ["recommendation-engine", "coding-assistant", "batch-embeddings", "experimentation"];

// ---------------------------------------------------------------------------
// Existence guard
// ---------------------------------------------------------------------------

async function aiGatewayTablesExist(transaction: Transaction): Promise<boolean> {
  const result = await sequelize.query(`SELECT to_regclass('ai_gateway_spend_logs') AS tbl`, {
    type: QueryTypes.SELECT,
    transaction,
  });
  return !!(result[0] as any)?.tbl;
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

const DAYS_OF_HISTORY = 30;

export async function insertAiGatewayDemoData(
  organizationId: number,
  userId: number,
  transaction: Transaction,
): Promise<void> {
  // Gracefully skip if the AI Gateway tables don't exist (Alembic not run).
  if (!(await aiGatewayTablesExist(transaction))) {
    return;
  }

  // Idempotent: skip if spend logs already seeded for this organization.
  const existing = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ai_gateway_spend_logs WHERE organization_id = :organizationId`,
    { type: QueryTypes.SELECT, transaction, replacements: { organizationId } },
  );
  if (parseInt(existing[0].count) > 0) {
    return;
  }

  const rng = new SeededRandom(1337 + organizationId);
  const now = new Date();

  // ---- 1. Insert endpoints (config) ----
  const endpointIdBySlug = new Map<string, number>();
  for (const ep of ENDPOINTS) {
    const [inserted] = await sequelize.query<{ id: number }>(
      `INSERT INTO ai_gateway_endpoints
        (organization_id, display_name, slug, provider, model, is_active, created_by, created_at, updated_at)
       VALUES
        (:organization_id, :display_name, :slug, :provider, :model, true, :created_by, :created_at, :updated_at)
       RETURNING id`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          organization_id: organizationId,
          display_name: ep.display_name,
          slug: ep.slug,
          provider: ep.provider,
          model: ep.model,
          created_by: userId,
          created_at: now,
          updated_at: now,
        },
      },
    );
    endpointIdBySlug.set(ep.slug, inserted.id);
  }

  // ---- 2. Insert virtual keys (config) ----
  const virtualKeyIds: number[] = [];
  for (const vk of VIRTUAL_KEYS) {
    const [inserted] = await sequelize.query<{ id: number }>(
      `INSERT INTO ai_gateway_virtual_keys
        (organization_id, key_hash, key_prefix, name, allowed_endpoint_ids, current_spend_usd, is_active, created_by, created_at, updated_at)
       VALUES
        (:organization_id, :key_hash, :key_prefix, :name, :allowed_endpoint_ids, 0, true, :created_by, :created_at, :updated_at)
       RETURNING id`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          organization_id: organizationId,
          key_hash: vk.key_hash,
          key_prefix: vk.key_prefix,
          name: vk.name,
          allowed_endpoint_ids: `{${Array.from(endpointIdBySlug.values()).join(",")}}`,
          created_by: userId,
          created_at: now,
          updated_at: now,
        },
      },
    );
    virtualKeyIds.push(inserted.id);
  }

  // Weighted endpoint pool for traffic distribution.
  const endpointPool: EndpointDefinition[] = [];
  for (const ep of ENDPOINTS) {
    for (let i = 0; i < ep.weight; i++) endpointPool.push(ep);
  }

  // ---- 3. Insert spend logs across the history window ----
  const spendByVirtualKey = new Map<number, number>();

  for (let dayOffset = DAYS_OF_HISTORY - 1; dayOffset >= 0; dayOffset--) {
    const dayStart = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const dow = dayStart.getDay();
    const isWeekend = dow === 0 || dow === 6;
    // Moderate volume: fewer requests on weekends.
    const requests = isWeekend ? rng.int(3, 8) : rng.int(12, 25);

    for (let i = 0; i < requests; i++) {
      const ep = rng.pick(endpointPool);

      const promptTokens = rng.int(ep.prompt_range[0], ep.prompt_range[1]);
      const completionTokens =
        ep.completion_range[1] > 0 ? rng.int(ep.completion_range[0], ep.completion_range[1]) : 0;
      const totalTokens = promptTokens + completionTokens;
      const cost = Number(((totalTokens / 1000) * ep.cost_per_1k).toFixed(8));

      // ~4% errors (rate limits / upstream failures).
      const isError = rng.chance(0.04);
      const statusCode = isError ? rng.pick([429, 500, 503]) : 200;
      const latency = isError
        ? rng.int(50, 300)
        : Math.max(60, Math.round(ep.avg_latency_ms * rng.float(0.6, 1.6)));

      // ~70% of traffic via a virtual key, rest via playground (null key).
      const useVirtualKey = rng.chance(0.7);
      const virtualKeyId = useVirtualKey ? rng.pick(virtualKeyIds) : null;

      // Spread each request across working hours of the day.
      const createdAt = new Date(
        dayStart.getTime() +
          rng.int(7, 20) * 60 * 60 * 1000 +
          rng.int(0, 59) * 60 * 1000 +
          rng.int(0, 59) * 1000,
      );

      const metadata = JSON.stringify({ tag: rng.pick(TAGS) });

      await sequelize.query(
        `INSERT INTO ai_gateway_spend_logs
          (organization_id, endpoint_id, user_id, model, provider, prompt_tokens, completion_tokens,
           total_tokens, cost_usd, latency_ms, status_code, metadata, virtual_key_id, created_at)
         VALUES
          (:organization_id, :endpoint_id, :user_id, :model, :provider, :prompt_tokens, :completion_tokens,
           :total_tokens, :cost_usd, :latency_ms, :status_code, CAST(:metadata AS JSONB), :virtual_key_id, :created_at)`,
        {
          transaction,
          replacements: {
            organization_id: organizationId,
            endpoint_id: endpointIdBySlug.get(ep.slug),
            user_id: userId,
            model: ep.model,
            provider: ep.provider,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            cost_usd: cost,
            latency_ms: latency,
            status_code: statusCode,
            metadata,
            virtual_key_id: virtualKeyId,
            created_at: createdAt,
          },
        },
      );

      if (virtualKeyId !== null && !isError) {
        spendByVirtualKey.set(virtualKeyId, (spendByVirtualKey.get(virtualKeyId) ?? 0) + cost);
      }
    }
  }

  // ---- 4. Update virtual-key running spend counters to match seeded logs ----
  for (const [vkId, spend] of spendByVirtualKey.entries()) {
    await sequelize.query(
      `UPDATE ai_gateway_virtual_keys SET current_spend_usd = :spend, updated_at = :now
       WHERE id = :id AND organization_id = :organizationId`,
      {
        transaction,
        replacements: {
          spend: Number(spend.toFixed(8)),
          now,
          id: vkId,
          organizationId,
        },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function deleteAiGatewayDemoData(
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (!(await aiGatewayTablesExist(transaction))) {
    return;
  }

  // FK-safe order: spend logs reference endpoints + virtual keys.
  const tables = ["ai_gateway_spend_logs", "ai_gateway_virtual_keys", "ai_gateway_endpoints"];
  for (const table of tables) {
    try {
      await sequelize.query(`DELETE FROM ${table} WHERE organization_id = :organizationId`, {
        replacements: { organizationId },
        transaction,
      });
    } catch {
      // Table may not exist — safe to skip.
    }
  }
}
