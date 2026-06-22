/**
 * Agent embedding matcher — Phase 2 router.
 *
 * Replaces (or augments) the keyword scoring in `routing.selectActiveTools`
 * with cosine similarity over agent description embeddings. Wins:
 *   - Catches paraphrases ("supplier" → vendor-agent even though the agent's
 *     keywords list only has "vendor"/"third-party")
 *   - Multilingual (English + Turkish + others — embedding model is robust)
 *   - Ranks agents by graded relevance, not binary keyword hits
 *
 * The matcher reuses the same caching pattern as the evidence analyzer's
 * controlMatcher: lazy-compute on first hit, cache by (agent_name,
 * embedding_model), invalidate via source_hash.
 *
 * Failure mode: any error → returns `null`. The caller (`selectActiveTools`)
 * silently falls back to the keyword router. No failure should ever break a
 * chat request.
 */

import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createHash } from "crypto";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { AGENT_TOOL_MAP, type AgentToolEntry } from "./agentToolMap";

/**
 * Same model as the control matcher — keeps both caches consistent and
 * billing predictable. 1536 dims, ~$0.02/M tokens.
 */
const EMBEDDING_MODEL = "text-embedding-3-small";

/** Hard cap on the user message we embed — prevents runaway tokens. */
const QUERY_CHAR_CAP = 4000;

export interface EmbeddingProviderKey {
  apiKey: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

export interface RankedAgent {
  agent: AgentToolEntry;
  similarity: number;
}

/* ------------------------------------------------------------------ */
/* Math                                                               */
/* ------------------------------------------------------------------ */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/* ------------------------------------------------------------------ */
/* Source-hash invalidation                                           */
/* ------------------------------------------------------------------ */

function hashSource(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/**
 * Build the canonical "source text" for an agent — the string we feed to
 * the embedding model. We deliberately concatenate name, keywords, and a
 * short tool-name digest so an agent's vector reflects both its prose
 * description and its capability surface.
 *
 * Kept stable: changing this changes every cached vector. Don't touch unless
 * you bump EMBEDDING_MODEL or are willing to recompute the lot.
 */
export function buildAgentSourceText(agent: AgentToolEntry): string {
  // Tool names give the embedding model a strong signal about what the
  // agent does, but they're underscore-cased, so we pretty-print them.
  const toolHints = agent.tools
    .slice(0, 25)
    .map((t) => t.replace(/^agent_/, "").replace(/_/g, " "))
    .join(", ");
  return [
    `Agent: ${agent.name}`,
    `Keywords: ${agent.keywords.join(", ")}`,
    `Capabilities: ${toolHints}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* DB cache                                                           */
/* ------------------------------------------------------------------ */

interface CachedAgentEmbedding {
  agent_name: string;
  embedding: number[];
  source_hash: string;
}

async function fetchCachedAgentEmbeddings(
  agentNames: string[],
): Promise<Map<string, CachedAgentEmbedding>> {
  if (agentNames.length === 0) return new Map();
  const replacements: Record<string, unknown> = { model: EMBEDDING_MODEL };
  const placeholders = agentNames
    .map((_, i) => {
      replacements[`name${i}`] = agentNames[i];
      return `:name${i}`;
    })
    .join(", ");

  const [rows] = await sequelize.query(
    `SELECT agent_name, embedding, source_hash
       FROM agent_embeddings
       WHERE embedding_model = :model
         AND agent_name IN (${placeholders})`,
    { replacements },
  );

  const map = new Map<string, CachedAgentEmbedding>();
  for (const row of rows as any[]) {
    const embedding = typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding;
    map.set(row.agent_name, {
      agent_name: row.agent_name,
      embedding,
      source_hash: row.source_hash,
    });
  }
  return map;
}

async function persistAgentEmbeddings(
  rows: Array<{
    agent_name: string;
    embedding: number[];
    source_hash: string;
  }>,
): Promise<void> {
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO agent_embeddings
         (agent_name, embedding, source_hash, embedding_model)
       VALUES (:agent_name, :embedding::jsonb, :source_hash, :model)
       ON CONFLICT (agent_name, embedding_model)
       DO UPDATE SET embedding = EXCLUDED.embedding,
                     source_hash = EXCLUDED.source_hash,
                     created_at = NOW()`,
      {
        replacements: {
          agent_name: r.agent_name,
          embedding: JSON.stringify(r.embedding),
          source_hash: r.source_hash,
          model: EMBEDDING_MODEL,
        },
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Public — rank agents by embedding similarity                       */
/* ------------------------------------------------------------------ */

export interface RankAgentsParams {
  message: string;
  /** Defaults to AGENT_TOOL_MAP — overridable for tests. */
  agents?: AgentToolEntry[];
  topK: number;
  llmKey: EmbeddingProviderKey;
  /** Drop matches below this similarity. Default 0.18 — tuned conservatively. */
  similarityFloor?: number;
}

/**
 * Rank `agents` against `message` by cosine similarity. Returns up to
 * `topK` matches above the floor, descending. Returns null on any error so
 * the caller can fall back transparently.
 */
export async function rankAgentsByEmbedding(
  params: RankAgentsParams,
): Promise<RankedAgent[] | null> {
  const message = (params.message || "").slice(0, QUERY_CHAR_CAP).trim();
  if (!message) return [];

  const agents = params.agents ?? AGENT_TOOL_MAP;
  if (agents.length === 0) return [];

  try {
    const provider = createOpenAI({
      apiKey: params.llmKey.apiKey,
      baseURL: params.llmKey.baseURL,
      headers: params.llmKey.headers,
    });
    const model = provider.textEmbeddingModel(EMBEDDING_MODEL);

    // 1. Cache lookup.
    const cache = await fetchCachedAgentEmbeddings(agents.map((a) => a.name));

    // 2. Identify what needs (re)computing.
    const toCompute: Array<{ agent: AgentToolEntry; sourceHash: string }> = [];
    for (const a of agents) {
      const sourceText = buildAgentSourceText(a);
      const sourceHash = hashSource(sourceText);
      const cached = cache.get(a.name);
      if (!cached || cached.source_hash !== sourceHash) {
        toCompute.push({ agent: a, sourceHash });
      }
    }

    // 3. Embed in one batch.
    if (toCompute.length > 0) {
      const { embeddings } = await embedMany({
        model,
        values: toCompute.map((x) => buildAgentSourceText(x.agent)),
      });
      const persistRows = toCompute.map((x, i) => ({
        agent_name: x.agent.name,
        embedding: embeddings[i],
        source_hash: x.sourceHash,
      }));
      await persistAgentEmbeddings(persistRows);
      // Update in-memory cache for ranking below.
      for (const row of persistRows) {
        cache.set(row.agent_name, row);
      }
    }

    // 4. Embed the query.
    const { embedding: queryEmbedding } = await embed({
      model,
      value: message,
    });

    // 5. Score.
    const floor = params.similarityFloor ?? 0.18;
    const ranked: RankedAgent[] = [];
    for (const a of agents) {
      const cached = cache.get(a.name);
      if (!cached) continue;
      const sim = cosineSimilarity(queryEmbedding, cached.embedding);
      if (sim >= floor) ranked.push({ agent: a, similarity: sim });
    }
    ranked.sort((a, b) => b.similarity - a.similarity);
    return ranked.slice(0, params.topK);
  } catch (err) {
    logger.warn("[agentEmbeddingMatcher] failed; caller should fall back to keyword scoring", err);
    return null;
  }
}
