/**
 * 90 days of gateway traffic, generated in memory first (so the risk, budget
 * and virtual-key aggregates can be computed from exactly what is inserted),
 * then written with batched INSERTs.
 *
 * Shapes follow the two real write paths:
 *   - virtual-key path (/v1): user_id NULL, metadata {"virtual_key_id": "<id>"};
 *     cache hits carry {"cache_hit": true, "original_cost_usd": x}, cost 0 and
 *     latency 0; errors are status 500 with metadata {}, no error_message,
 *     zero tokens and the endpoint's prefixed model;
 *   - playground path: user_id set, no virtual key, metadata {}; errors carry a
 *     litellm exception string (truncated to 500 chars) and responses are not
 *     stored (streamed).
 * Status codes are only 200 or 500 (4xx rejections never produce a row).
 * Request/response bodies are only present for the last 14 days (body logging
 * was switched on two weeks ago in the story).
 */

import { Transaction } from "sequelize";
import {
  batchInsert,
  canonicalJsonPython,
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  SeededRandom,
  sha256Hex,
  usd,
} from "./common";
import { costFor, endpointBySlug, MODEL_PROFILES } from "./catalog";
import {
  CODING_CONTENT,
  ContentPair,
  EMBEDDING_INPUTS,
  FAQ_CONTENT,
  FORECAST_CONTENT,
  MASKED_RECRUITMENT_MESSAGES,
  MASKED_SUPPORT_MESSAGES,
  MaskedMessage,
  RECOMMENDATION_CONTENT,
  RECRUITMENT_CONTENT,
  SANDBOX_CONTENT,
  SUPPORT_CONTENT,
} from "./content";

export const HISTORY_DAYS = 90;
export const BODY_LOGGING_DAYS = 14;
/** Provider outage (Anthropic 5xx) — days ago, UTC hours. */
export const OUTAGE_DAYS_AGO = 12;
const OUTAGE_HOURS: [number, number] = [12.5, 17];
/** Forecast batch re-run with oversized prompts — days ago. */
export const COST_ANOMALY_DAYS_AGO = 3;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface SpendRow {
  endpointSlug: string;
  vkName: string | null;
  playground: boolean;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  latencyMs: number;
  status: number;
  metadata: Record<string, unknown>;
  requestMessages: unknown[] | null;
  responseText: string | null;
  errorMessage: string | null;
  createdAt: Date;
  agentRunId: string | null;
}

export interface GuardrailLogRow {
  guardrailName: string;
  endpointSlug: string;
  guardrailType: "pii" | "content_filter";
  actionTaken: "blocked" | "mask";
  matchedText: string;
  entityType: string;
  executionTimeMs: number;
  createdAt: Date;
}

export interface CacheRow {
  endpointSlug: string;
  promptHash: string;
  model: string;
  promptPreview: string;
  responseBody: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  hitCount: number;
  ttlSeconds: number;
  createdAt: Date;
  expiresAt: Date;
  lastHitAt: Date | null;
}

export interface TrafficResult {
  spend: SpendRow[];
  guardrailLogs: GuardrailLogRow[];
  cache: CacheRow[];
}

// ---------------------------------------------------------------------------
// Guardrail timeline (names match the guardrail rules seeded in guardrails.ts)
// ---------------------------------------------------------------------------

export const GUARDRAIL_ACTIVE_WINDOWS: Record<string, [number, number]> = {
  // name -> [created days ago, deactivated days ago (0 = still active)]
  "Email addresses": [80, 0],
  "Phone numbers": [80, 0],
  "Credit card numbers": [80, 0],
  "US Social Security numbers": [46, 0],
  "Person names": [70, 55],
  "Prompt injection (basic)": [80, 0],
  "AWS credentials": [60, 0],
};

function guardrailActive(name: string, daysAgo: number): boolean {
  const [from, to] = GUARDRAIL_ACTIVE_WINDOWS[name];
  return daysAgo <= from && daysAgo > to;
}

// ---------------------------------------------------------------------------
// Call builder
// ---------------------------------------------------------------------------

const PLAYGROUND_ERRORS: Record<string, string[]> = {
  anthropic: [
    'litellm.RateLimitError: AnthropicException - {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit (https://docs.anthropic.com/en/api/rate-limits); see the response headers for current usage. Please reduce the prompt length or the maximum tokens requested, or try again later."}}',
    'litellm.InternalServerError: AnthropicException - {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
  ],
  openai: [
    "litellm.RateLimitError: RateLimitError: OpenAIException - Rate limit reached for gpt-4o in organization org-demo on tokens per min (TPM): Limit 800000, Used 792331, Requested 12040. Please try again in 906ms.",
    "litellm.APIConnectionError: APIConnectionError: OpenAIException - Connection timed out",
    "litellm.Timeout: APITimeoutError - Request timed out. Error_str: Request timed out.",
  ],
  gemini: [
    'litellm.RateLimitError: litellm.RateLimitError: VertexAIException - {"error":{"code":429,"message":"Resource exhausted. Please try again later.","status":"RESOURCE_EXHAUSTED"}}',
  ],
};

const OUTAGE_ERROR =
  'litellm.InternalServerError: AnthropicException - {"type":"error","error":{"type":"api_error","message":"Internal server error"}}';

interface CallOptions {
  endpointSlug: string;
  vkName: string | null;
  vkId?: number;
  createdAt: Date;
  promptTokens: number;
  completionTokens: number;
  isError: boolean;
  errorMessage?: string;
  content: ContentPair | null;
  withBodies: boolean;
  agentRunId?: string | null;
}

/** Builds one spend row exactly as the gateway would log it for this call. */
export function buildCall(rng: SeededRandom, o: CallOptions): SpendRow {
  const ep = endpointBySlug(o.endpointSlug);
  const profile = MODEL_PROFILES[ep.model];
  const playground = o.vkName === null;
  const isEmbedding = ep.model.indexOf("embedding") >= 0;
  const userText = o.content?.user ?? "";

  let requestMessages: unknown[] | null = null;
  if (o.withBodies && userText && !isEmbedding) {
    if (playground) {
      // Playground stores the last 3 messages including the system prompt (<= 2048 chars each).
      const msgs: { role: string; content: string }[] = [];
      if (ep.system_prompt) msgs.push({ role: "system", content: ep.system_prompt });
      msgs.push({ role: "user", content: userText });
      requestMessages = msgs.slice(-3).map((m) => ({ ...m, content: m.content.slice(0, 2048) }));
    } else {
      requestMessages = [{ role: "user", content: userText }];
    }
  }

  if (o.isError) {
    const message = playground
      ? (o.errorMessage ?? rng.pick(PLAYGROUND_ERRORS[ep.provider] ?? PLAYGROUND_ERRORS.openai))
      : null;
    return {
      endpointSlug: o.endpointSlug,
      vkName: o.vkName,
      playground,
      model: ep.model,
      provider: ep.provider,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      latencyMs: rng.chance(0.15) ? rng.int(28000, 30500) : rng.int(250, 4200),
      status: 500,
      metadata: {},
      requestMessages,
      responseText: null,
      errorMessage: message ? message.slice(0, 500) : null,
      createdAt: o.createdAt,
      agentRunId: o.agentRunId ?? null,
    };
  }

  const cost = usd(costFor(ep.model, o.promptTokens, o.completionTokens));
  const latencyMs = isEmbedding
    ? rng.int(150, 300)
    : Math.round(
        profile.baseLatencyMs * rng.float(0.7, 1.5) +
          o.completionTokens * profile.perOutputTokenMs * rng.float(0.8, 1.2),
      );
  return {
    endpointSlug: o.endpointSlug,
    vkName: o.vkName,
    playground,
    model: profile.returnedModel,
    provider: ep.provider,
    promptTokens: o.promptTokens,
    completionTokens: o.completionTokens,
    cost,
    latencyMs,
    status: 200,
    metadata: playground ? {} : { virtual_key_id: "__VK__" },
    requestMessages,
    responseText:
      !playground && o.withBodies && o.content && !isEmbedding ? o.content.response : null,
    errorMessage: null,
    createdAt: o.createdAt,
    agentRunId: o.agentRunId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Time shape
// ---------------------------------------------------------------------------

// Relative request weight per UTC hour: business hours peak 08:00-19:00.
const BUSINESS_HOUR_WEIGHTS = [
  0.15, 0.1, 0.08, 0.08, 0.1, 0.15, 0.3, 0.6, 1.0, 1.3, 1.4, 1.4, 1.2, 1.3, 1.4, 1.4, 1.3, 1.1, 0.9,
  0.7, 0.5, 0.4, 0.3, 0.2,
];
const HOURS = BUSINESS_HOUR_WEIGHTS.map((_, i) => i);
// Nightly batch jobs run 01:00-03:00 UTC.
const BATCH_HOUR_WEIGHTS = HOURS.map((h) => (h >= 1 && h <= 3 ? 1 : 0));

function dayStartUtc(now: Date, daysAgo: number): Date {
  const d = new Date(now.getTime() - daysAgo * DAY_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function timeInDay(rng: SeededRandom, dayStart: Date, weights: number[]): Date {
  const hour = rng.weighted(HOURS, weights);
  return new Date(
    dayStart.getTime() + hour * HOUR_MS + rng.int(0, 59) * MINUTE_MS + rng.int(0, 59999),
  );
}

/** Adoption ramp: a stream starts at ~35% of its current volume and reaches 100%. */
function adoption(daysAgo: number, startDaysAgo: number): number {
  const age = startDaysAgo - daysAgo;
  const rampDays = Math.max(20, startDaysAgo * 0.8);
  return 0.35 + 0.65 * Math.pow(Math.min(1, age / rampDays), 1.2);
}

function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

// ---------------------------------------------------------------------------
// Traffic streams (one app talking to one endpoint)
// ---------------------------------------------------------------------------

interface Stream {
  endpointSlug: string;
  vkName: string | null;
  perWeekday: number;
  startDaysAgo: number;
  endDaysAgo: number;
  weekendFactor: number;
  playgroundShare: number;
  batch?: boolean;
  prompt: [number, number];
  completion: [number, number];
  content: ContentPair[] | null;
  errorRate: number;
  /** PII masking on this stream: probability a request contains maskable PII. */
  maskRate?: number;
  maskPool?: MaskedMessage[];
  /** Last-24h traffic of this stream is generated from the response cache instead. */
  cached?: boolean;
  cacheHitShare?: number;
}

const STREAMS: Stream[] = [
  {
    endpointSlug: "support-assistant",
    vkName: "Support chatbot (prod)",
    perWeekday: 95,
    startDaysAgo: 88,
    endDaysAgo: 0,
    weekendFactor: 0.6,
    playgroundShare: 0.15,
    prompt: [900, 2500],
    completion: [120, 450],
    content: SUPPORT_CONTENT,
    errorRate: 0.012,
    maskRate: 0.03,
    maskPool: MASKED_SUPPORT_MESSAGES,
  },
  {
    endpointSlug: "support-faq",
    vkName: "Support chatbot (prod)",
    perWeekday: 60,
    startDaysAgo: 82,
    endDaysAgo: 0,
    weekendFactor: 0.6,
    playgroundShare: 0.05,
    prompt: [70, 140],
    completion: [30, 80],
    content: FAQ_CONTENT,
    errorRate: 0.008,
    cached: true,
    cacheHitShare: 0.45,
  },
  {
    endpointSlug: "support-faq",
    vkName: "Support widget beta",
    perWeekday: 18,
    startDaysAgo: 80,
    endDaysAgo: 38,
    weekendFactor: 0.6,
    playgroundShare: 0,
    prompt: [70, 140],
    completion: [30, 80],
    content: FAQ_CONTENT,
    errorRate: 0.01,
    cacheHitShare: 0.4,
  },
  {
    endpointSlug: "coding-assistant-gpt-4-1",
    vkName: "Coding assistant – IDE agents",
    perWeekday: 32,
    startDaysAgo: 84,
    endDaysAgo: 0,
    weekendFactor: 0.12,
    playgroundShare: 0.2,
    prompt: [3000, 12000],
    completion: [300, 1800],
    content: CODING_CONTENT,
    errorRate: 0.012,
  },
  {
    endpointSlug: "coding-assistant-sonnet",
    vkName: "Coding assistant – IDE agents",
    perWeekday: 40,
    startDaysAgo: 78,
    endDaysAgo: 0,
    weekendFactor: 0.12,
    playgroundShare: 0.2,
    prompt: [3000, 12000],
    completion: [300, 2000],
    content: CODING_CONTENT,
    errorRate: 0.012,
  },
  {
    endpointSlug: "recommendation-explanations",
    vkName: "Recommendation engine (prod)",
    perWeekday: 75,
    startDaysAgo: 88,
    endDaysAgo: 0,
    weekendFactor: 0.85,
    playgroundShare: 0.15,
    prompt: [180, 420],
    completion: [25, 60],
    content: RECOMMENDATION_CONTENT,
    errorRate: 0.01,
  },
  {
    endpointSlug: "catalog-embeddings",
    vkName: "Recommendation engine (prod)",
    perWeekday: 60,
    startDaysAgo: 88,
    endDaysAgo: 0,
    weekendFactor: 0.5,
    playgroundShare: 0,
    prompt: [20, 120],
    completion: [0, 0],
    content: null,
    errorRate: 0.006,
  },
  {
    endpointSlug: "forecast-narratives",
    vkName: "Demand forecasting batch",
    perWeekday: 14,
    startDaysAgo: 74,
    endDaysAgo: 0,
    weekendFactor: 1,
    playgroundShare: 0,
    batch: true,
    prompt: [2500, 6000],
    completion: [250, 700],
    content: FORECAST_CONTENT,
    errorRate: 0.01,
  },
  {
    endpointSlug: "forecast-narratives",
    vkName: null,
    perWeekday: 6,
    startDaysAgo: 74,
    endDaysAgo: 0,
    weekendFactor: 0,
    playgroundShare: 1,
    prompt: [2500, 6000],
    completion: [250, 700],
    content: FORECAST_CONTENT,
    errorRate: 0.02,
  },
  {
    endpointSlug: "recruitment-cv-summarizer",
    vkName: "Recruitment screening (pilot)",
    perWeekday: 10,
    startDaysAgo: 45,
    endDaysAgo: 0,
    weekendFactor: 0.05,
    playgroundShare: 0.3,
    prompt: [1500, 3500],
    completion: [200, 500],
    content: RECRUITMENT_CONTENT,
    errorRate: 0.01,
    maskRate: 0.08,
    maskPool: MASKED_RECRUITMENT_MESSAGES,
  },
  {
    endpointSlug: "sandbox-gemini-flash",
    vkName: "Data science sandbox",
    perWeekday: 6,
    startDaysAgo: 89,
    endDaysAgo: 34,
    weekendFactor: 0.2,
    playgroundShare: 0.5,
    prompt: [400, 3000],
    completion: [150, 900],
    content: SANDBOX_CONTENT,
    errorRate: 0.02,
  },
  {
    endpointSlug: "recommendation-explanations",
    vkName: "Data science sandbox",
    perWeekday: 1.5,
    startDaysAgo: 60,
    endDaysAgo: 0,
    weekendFactor: 0,
    playgroundShare: 0,
    prompt: [180, 420],
    completion: [25, 60],
    content: RECOMMENDATION_CONTENT,
    errorRate: 0,
  },
];

function roundCount(rng: SeededRandom, expected: number): number {
  const base = Math.floor(expected);
  return base + (rng.chance(expected - base) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateTraffic(rng: SeededRandom, now: Date): TrafficResult {
  const spend: SpendRow[] = [];
  const guardrailLogs: GuardrailLogRow[] = [];
  const bodyCutoff = now.getTime() - BODY_LOGGING_DAYS * DAY_MS;
  const cacheWindowStart = now.getTime() - DAY_MS;

  for (const s of STREAMS) {
    for (let d = Math.min(HISTORY_DAYS - 1, s.startDaysAgo); d >= s.endDaysAgo; d--) {
      const dayStart = dayStartUtc(now, d);
      const factor = isWeekend(dayStart) ? s.weekendFactor : 1;
      const expected = s.perWeekday * adoption(d, s.startDaysAgo) * factor * rng.float(0.85, 1.15);
      const count = roundCount(rng, expected);

      for (let i = 0; i < count; i++) {
        const createdAt = timeInDay(
          rng,
          dayStart,
          s.batch ? BATCH_HOUR_WEIGHTS : BUSINESS_HOUR_WEIGHTS,
        );
        if (createdAt.getTime() > now.getTime()) continue;
        if (s.endDaysAgo > 0 && createdAt.getTime() > now.getTime() - s.endDaysAgo * DAY_MS)
          continue;

        const playground = rng.chance(s.playgroundShare);
        const vkName = playground ? null : s.vkName;
        // The cached FAQ stream's last 24h come from the cache entries below.
        if (s.cached && !playground && createdAt.getTime() >= cacheWindowStart) continue;

        const ep = endpointBySlug(s.endpointSlug);
        const hourOfDay = (createdAt.getTime() - dayStart.getTime()) / HOUR_MS;
        const inOutage =
          d === OUTAGE_DAYS_AGO &&
          ep.provider === "anthropic" &&
          hourOfDay >= OUTAGE_HOURS[0] &&
          hourOfDay < OUTAGE_HOURS[1];
        const isError = rng.chance(inOutage ? 0.45 : s.errorRate);
        const withBodies = createdAt.getTime() >= bodyCutoff;
        const content = s.content ? rng.pick(s.content) : null;

        // Response-cache hit (virtual-key path only).
        if (!isError && !playground && s.cacheHitShare && rng.chance(s.cacheHitShare) && content) {
          const hit = buildCall(rng, {
            endpointSlug: s.endpointSlug,
            vkName,
            createdAt,
            promptTokens: rng.int(s.prompt[0], s.prompt[1]),
            completionTokens: rng.int(s.completion[0], s.completion[1]),
            isError: false,
            content,
            withBodies,
          });
          spend.push(toCacheHit(hit));
          continue;
        }

        // PII masked in the request (the request still went through).
        let masked: MaskedMessage | undefined;
        if (!isError && s.maskRate && s.maskPool && rng.chance(s.maskRate)) {
          const candidate = rng.pick(s.maskPool);
          const allActive = candidate.entities.every((e) =>
            guardrailActive(e.type === "EMAIL_ADDRESS" ? "Email addresses" : "Phone numbers", d),
          );
          if (allActive) {
            masked = candidate;
            const execMs = rng.int(12, 40);
            for (const e of candidate.entities) {
              guardrailLogs.push({
                guardrailName: e.type === "EMAIL_ADDRESS" ? "Email addresses" : "Phone numbers",
                endpointSlug: s.endpointSlug,
                guardrailType: "pii",
                actionTaken: "mask",
                matchedText: e.text,
                entityType: e.type,
                executionTimeMs: execMs,
                createdAt: new Date(createdAt.getTime() - rng.int(20, 60)),
              });
            }
          }
        }
        // "Person names" was active for two weeks and masked names in support chats.
        if (
          !isError &&
          s.endpointSlug === "support-assistant" &&
          guardrailActive("Person names", d) &&
          rng.chance(0.05)
        ) {
          guardrailLogs.push({
            guardrailName: "Person names",
            endpointSlug: s.endpointSlug,
            guardrailType: "pii",
            actionTaken: "mask",
            matchedText: rng.pick([
              "Jane Doe",
              "Marcus Okafor",
              "Lucas Meyer",
              "Sofia Rossi",
              "Tom",
            ]),
            entityType: "PERSON",
            executionTimeMs: rng.int(14, 40),
            createdAt: new Date(createdAt.getTime() - rng.int(20, 60)),
          });
        }

        const call = buildCall(rng, {
          endpointSlug: s.endpointSlug,
          vkName,
          createdAt,
          promptTokens: rng.int(s.prompt[0], s.prompt[1]),
          completionTokens: s.completion[1] > 0 ? rng.int(s.completion[0], s.completion[1]) : 0,
          isError,
          errorMessage: inOutage && playground ? OUTAGE_ERROR : undefined,
          content: masked ?? content ?? { user: rng.pick(EMBEDDING_INPUTS), response: "" },
          withBodies,
        });
        spend.push(call);

        // Fallback: a failed support call is retried on the Haiku fallback endpoint.
        if (isError && !playground && ep.fallbackSlug) {
          spend.push(
            buildCall(rng, {
              endpointSlug: ep.fallbackSlug,
              vkName,
              createdAt: new Date(createdAt.getTime() + rng.int(300, 1200)),
              promptTokens: rng.int(s.prompt[0], s.prompt[1]),
              completionTokens: rng.int(s.completion[0], s.completion[1]),
              isError: false,
              content,
              withBodies,
            }),
          );
        }
      }
    }
  }

  generateBlockedRequests(rng, now, guardrailLogs);
  generateCostAnomaly(rng, now, spend);
  const cache = generateCache(rng, now, spend);

  spend.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  guardrailLogs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { spend, guardrailLogs, cache };
}

function toCacheHit(row: SpendRow): SpendRow {
  return {
    ...row,
    metadata: { cache_hit: true, original_cost_usd: row.cost },
    cost: 0,
    latencyMs: 0,
  };
}

/** Requests rejected by a blocking guardrail: a log row, but no spend row (400 before logging). */
function generateBlockedRequests(rng: SeededRandom, now: Date, out: GuardrailLogRow[]): void {
  const kinds: {
    guardrail: string;
    type: "pii" | "content_filter";
    entity: string;
    endpoints: string[];
    perDay: number;
    matches: string[];
    extraMask?: boolean;
  }[] = [
    {
      guardrail: "Credit card numbers",
      type: "pii",
      entity: "CREDIT_CARD",
      endpoints: ["support-assistant", "support-assistant", "support-faq"],
      perDay: 0.5,
      matches: ["4111 1111 1111 1111", "5500-0000-0000-0004", "4242424242424242"],
      extraMask: true,
    },
    {
      guardrail: "US Social Security numbers",
      type: "pii",
      entity: "US_SSN",
      endpoints: ["recruitment-cv-summarizer"],
      perDay: 0.3,
      matches: ["078-05-1120", "219-09-9999"],
    },
    {
      guardrail: "Prompt injection (basic)",
      type: "content_filter",
      entity: "Prompt injection (basic)",
      endpoints: ["support-assistant", "support-faq", "recommendation-explanations"],
      perDay: 0.25,
      matches: [
        "Ignore all previous instructions",
        "ignore previous instructions",
        "disregard all prior prompts",
      ],
    },
    {
      guardrail: "AWS credentials",
      type: "content_filter",
      entity: "AWS credentials",
      endpoints: ["coding-assistant-gpt-4-1", "coding-assistant-sonnet"],
      perDay: 0.15,
      matches: ["AKIAIOSFODNN7EXAMPLE", "AKIAI44QH8DHBEXAMPLE"],
    },
  ];

  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const dayStart = dayStartUtc(now, d);
    for (const k of kinds) {
      if (!guardrailActive(k.guardrail, d)) continue;
      const factor = isWeekend(dayStart) ? 0.4 : 1;
      const count = roundCount(rng, k.perDay * factor * rng.float(0.5, 1.5));
      for (let i = 0; i < count; i++) {
        const createdAt = timeInDay(rng, dayStart, BUSINESS_HOUR_WEIGHTS);
        if (createdAt.getTime() > now.getTime()) continue;
        const endpointSlug = rng.pick(k.endpoints);
        const execMs = k.type === "pii" ? rng.int(12, 40) : rng.int(3, 9);
        out.push({
          guardrailName: k.guardrail,
          endpointSlug,
          guardrailType: k.type,
          actionTaken: "blocked",
          matchedText: rng.pick(k.matches),
          entityType: k.entity,
          executionTimeMs: execMs,
          createdAt,
        });
        // Card numbers often arrive with an email in the same message: every
        // detection of a blocked request is logged as "blocked".
        if (k.extraMask && rng.chance(0.3) && guardrailActive("Email addresses", d)) {
          out.push({
            guardrailName: "Email addresses",
            endpointSlug,
            guardrailType: "pii",
            actionTaken: "blocked",
            matchedText: rng.pick(["jane.doe@example.com", "billing@example.org"]),
            entityType: "EMAIL_ADDRESS",
            executionTimeMs: execMs,
            createdAt,
          });
        }
      }
    }
  }
}

/** A forecast batch re-run with oversized prompts on gpt-4o, a few days ago. */
function generateCostAnomaly(rng: SeededRandom, now: Date, out: SpendRow[]): void {
  const dayStart = dayStartUtc(now, COST_ANOMALY_DAYS_AGO);
  const bodyCutoff = now.getTime() - BODY_LOGGING_DAYS * DAY_MS;
  for (let i = 0; i < 350; i++) {
    const createdAt = new Date(dayStart.getTime() + 10 * HOUR_MS + rng.int(0, 150 * 60 * 1000));
    out.push(
      buildCall(rng, {
        endpointSlug: "forecast-narratives",
        vkName: "Demand forecasting batch",
        createdAt,
        promptTokens: rng.int(18000, 32000),
        completionTokens: rng.int(900, 1600),
        isError: rng.chance(0.01),
        content: rng.pick(FORECAST_CONTENT),
        withBodies: createdAt.getTime() >= bodyCutoff,
      }),
    );
  }
}

/**
 * Response cache for the FAQ endpoint. Entries live 24h (endpoint TTL), so
 * the table only holds the last day. The FAQ endpoint's virtual-key traffic of
 * the last 24h is generated from these entries: one miss per entry (which
 * stored it) plus hit_count cache-hit rows, keeping stats and logs consistent.
 */
function generateCache(rng: SeededRandom, now: Date, out: SpendRow[]): CacheRow[] {
  const ep = endpointBySlug("support-faq");
  const profile = MODEL_PROFILES[ep.model];
  const hitTargets: Record<string, number> = {
    "How do I reset my password?": 40,
    "What is your return policy?": 26,
    "How can I track my order?": 31,
    "Do you ship internationally?": 9,
    "Which payment methods do you accept?": 12,
    "How long do refunds take?": 18,
    "Can I cancel my order?": 7,
    "Do you have a size guide?": 5,
  };

  const entries: { pair: ContentPair; hits: number; ageHours: number }[] = [];
  for (const pair of FAQ_CONTENT) {
    entries.push({ pair, hits: hitTargets[pair.user] ?? 3, ageHours: rng.float(14, 23.5) });
  }
  // Long-tail questions asked once or twice.
  for (const pair of SUPPORT_CONTENT.slice(0, 6)) {
    entries.push({ pair, hits: rng.int(0, 1), ageHours: rng.float(0.5, 20) });
  }
  // A few entries that already expired (still in the table until the cleanup job runs).
  for (const pair of SUPPORT_CONTENT.slice(6, 9)) {
    entries.push({ pair, hits: rng.int(1, 4), ageHours: rng.float(25, 30) });
  }

  const cache: CacheRow[] = [];
  for (const e of entries) {
    const createdAt = new Date(now.getTime() - e.ageHours * HOUR_MS);
    const expiresAt = new Date(createdAt.getTime() + ep.cache_ttl_seconds * 1000);
    const promptTokens = rng.int(70, 140);
    const completionTokens = rng.int(30, 80);
    const cost = usd(costFor(ep.model, promptTokens, completionTokens));
    const messages = [
      { role: "system", content: ep.system_prompt ?? "" },
      { role: "user", content: e.pair.user },
    ];
    const promptHash = sha256Hex(
      canonicalJsonPython({
        model: ep.model,
        messages,
        temperature: ep.temperature,
        max_tokens: ep.max_tokens,
      }),
    );
    const createdUnix = Math.floor(createdAt.getTime() / 1000);
    const responseBody = JSON.stringify({
      id: `chatcmpl-${rng.base62(29)}`,
      created: createdUnix,
      model: profile.returnedModel,
      object: "chat.completion",
      system_fingerprint: `fp_${rng.hex(10)}`,
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          message: {
            content: e.pair.response,
            role: "assistant",
            tool_calls: null,
            function_call: null,
          },
        },
      ],
      usage: {
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        total_tokens: promptTokens + completionTokens,
      },
      cost_usd: cost,
    });

    // The miss that stored the entry.
    const miss = buildCall(rng, {
      endpointSlug: "support-faq",
      vkName: "Support chatbot (prod)",
      createdAt,
      promptTokens,
      completionTokens,
      isError: false,
      content: e.pair,
      withBodies: true,
    });
    out.push(miss);

    // Hits between creation and min(now, expiry).
    const hitWindowEnd = Math.min(now.getTime(), expiresAt.getTime());
    let lastHit: Date | null = null;
    for (let h = 0; h < e.hits; h++) {
      const at = new Date(
        createdAt.getTime() + rng.float(0.02, 1) * (hitWindowEnd - createdAt.getTime()),
      );
      if (!lastHit || at > lastHit) lastHit = at;
      const hitRow = buildCall(rng, {
        endpointSlug: "support-faq",
        vkName: "Support chatbot (prod)",
        createdAt: at,
        promptTokens,
        completionTokens,
        isError: false,
        content: e.pair,
        withBodies: true,
      });
      out.push({ ...toCacheHit(hitRow), metadata: { cache_hit: true, original_cost_usd: cost } });
    }

    cache.push({
      endpointSlug: "support-faq",
      promptHash,
      model: profile.returnedModel,
      promptPreview: e.pair.user.slice(0, 200),
      responseBody,
      promptTokens,
      completionTokens,
      cost,
      hitCount: e.hits,
      ttlSeconds: ep.cache_ttl_seconds,
      createdAt,
      expiresAt,
      lastHitAt: lastHit,
    });
  }
  return cache;
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

export async function insertSpendLogs(
  organizationId: number,
  userId: number,
  rows: SpendRow[],
  endpointIdBySlug: Map<string, number>,
  virtualKeyIdByName: Map<string, number>,
  transaction: Transaction,
): Promise<void> {
  const values = rows.map((r) => {
    const vkId = r.vkName ? (virtualKeyIdByName.get(r.vkName) ?? null) : null;
    const metadata =
      r.metadata.virtual_key_id === "__VK__" ? { virtual_key_id: String(vkId) } : r.metadata;
    return [
      organizationId,
      endpointIdBySlug.get(r.endpointSlug) ?? null,
      r.playground ? userId : null,
      r.model,
      r.provider,
      r.promptTokens,
      r.completionTokens,
      r.promptTokens + r.completionTokens,
      r.cost,
      r.latencyMs,
      r.status,
      JSON.stringify(metadata),
      r.requestMessages ? JSON.stringify(r.requestMessages) : null,
      r.responseText,
      r.errorMessage,
      vkId,
      r.createdAt,
      r.agentRunId,
      null,
    ];
  });
  await batchInsert(
    "ai_gateway_spend_logs",
    [
      "organization_id",
      "endpoint_id",
      "user_id",
      "model",
      "provider",
      "prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "cost_usd",
      "latency_ms",
      "status_code",
      "metadata",
      "request_messages",
      "response_text",
      "error_message",
      "virtual_key_id",
      "created_at",
      "agent_run_id",
      "agent_run_path",
    ],
    values,
    transaction,
  );
}

export async function insertCache(
  organizationId: number,
  rows: CacheRow[],
  endpointIdBySlug: Map<string, number>,
  transaction: Transaction,
): Promise<void> {
  await batchInsert(
    "ai_gateway_cache",
    [
      "organization_id",
      "endpoint_id",
      "prompt_hash",
      "model",
      "prompt_preview",
      "response_body",
      "prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "cost_usd",
      "hit_count",
      "ttl_seconds",
      "created_at",
      "expires_at",
      "last_hit_at",
    ],
    rows.map((c) => [
      organizationId,
      endpointIdBySlug.get(c.endpointSlug),
      c.promptHash,
      c.model,
      c.promptPreview,
      c.responseBody,
      c.promptTokens,
      c.completionTokens,
      c.promptTokens + c.completionTokens,
      c.cost,
      c.hitCount,
      c.ttlSeconds,
      c.createdAt,
      c.expiresAt,
      c.lastHitAt,
    ]),
    transaction,
  );
}
