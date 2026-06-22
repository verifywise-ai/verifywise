/**
 * Evidence Analyzer — Embedding-based control matcher.
 *
 * Replaces the keyword pre-filter in `controlMatcher.ts` when an OpenAI key
 * is available. Strategy:
 *
 *   1. Fetch (or lazy-compute and cache) embeddings for every control in the
 *      candidate frameworks.
 *   2. Embed the analysis text (summary + key findings + compliance areas).
 *   3. Rank controls by cosine similarity.
 *   4. Return the top-N candidates for the LLM scorer.
 *
 * Caching: `verifywise.control_embeddings(framework_type, control_id, embedding_model)`
 * is unique-keyed. We invalidate via `source_hash` when title/description changes.
 *
 * Cost: each control is embedded once, ever (until source changes). Each
 * analyze call adds one query embedding. With OpenAI text-embedding-3-small
 * at ~$0.02/M tokens and a typical analysis ~500 tokens, the cost is
 * negligible (~$0.00001 per analysis).
 *
 * Failure mode: any error in this module is swallowed and returns null —
 * the caller falls back to keyword pre-filter.
 */

import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createHash } from "crypto";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims, ~$0.02/M tokens

export interface EmbeddingControl {
  control_id: number;
  framework_type: string;
  control_title: string;
  control_description?: string;
}

export interface EmbeddingMatcherKey {
  apiKey: string;
  baseURL?: string;
  headers?: Record<string, string>;
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
/* Hashing — invalidates cached embeddings when source text changes   */
/* ------------------------------------------------------------------ */

function hashSource(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function controlSourceText(c: EmbeddingControl): string {
  return `${c.control_title}\n${c.control_description ?? ""}`.trim();
}

/* ------------------------------------------------------------------ */
/* Cache lookup + lazy compute                                        */
/* ------------------------------------------------------------------ */

interface CachedEmbedding {
  control_id: number;
  framework_type: string;
  embedding: number[];
  source_hash: string;
}

async function fetchCachedEmbeddings(
  controls: EmbeddingControl[],
): Promise<Map<string, CachedEmbedding>> {
  if (controls.length === 0) return new Map();

  const keys = controls.map((c) => `${c.framework_type}|${c.control_id}`);
  const [rows] = await sequelize.query(
    `SELECT framework_type, control_id, embedding, source_hash
     FROM control_embeddings
     WHERE embedding_model = :model
       AND (framework_type, control_id) IN (
         ${controls.map((_, i) => `(:fw${i}, :id${i})`).join(", ")}
       )`,
    {
      replacements: {
        model: EMBEDDING_MODEL,
        ...controls.reduce<Record<string, string | number>>((acc, c, i) => {
          acc[`fw${i}`] = c.framework_type;
          acc[`id${i}`] = c.control_id;
          return acc;
        }, {}),
      },
    },
  );

  const map = new Map<string, CachedEmbedding>();
  for (const row of rows as any[]) {
    const key = `${row.framework_type}|${row.control_id}`;
    const embedding = typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding;
    map.set(key, {
      control_id: row.control_id,
      framework_type: row.framework_type,
      embedding,
      source_hash: row.source_hash,
    });
  }
  // Defensive: even if the SQL above produces unused keys, return only matches.
  void keys;
  return map;
}

async function persistEmbeddings(
  rows: Array<{
    control_id: number;
    framework_type: string;
    embedding: number[];
    source_hash: string;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO control_embeddings
         (framework_type, control_id, embedding, source_hash, embedding_model)
       VALUES (:framework_type, :control_id, :embedding::jsonb, :source_hash, :model)
       ON CONFLICT (framework_type, control_id, embedding_model)
       DO UPDATE SET embedding = EXCLUDED.embedding,
                     source_hash = EXCLUDED.source_hash,
                     created_at = NOW()`,
      {
        replacements: {
          framework_type: r.framework_type,
          control_id: r.control_id,
          embedding: JSON.stringify(r.embedding),
          source_hash: r.source_hash,
          model: EMBEDDING_MODEL,
        },
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Public — rank controls by cosine similarity                        */
/* ------------------------------------------------------------------ */

export interface RankedControl {
  control: EmbeddingControl;
  similarity: number;
}

/**
 * Rank `controls` against `queryText` by cosine similarity. Returns the
 * top-K (ordered descending). Falls back to null if anything fails — the
 * caller should use the keyword pre-filter instead.
 */
export async function rankControlsByEmbedding(params: {
  controls: EmbeddingControl[];
  queryText: string;
  topK: number;
  llmKey: EmbeddingMatcherKey;
}): Promise<RankedControl[] | null> {
  const { controls, queryText, topK, llmKey } = params;
  if (controls.length === 0 || !queryText.trim()) return [];

  try {
    const provider = createOpenAI({
      apiKey: llmKey.apiKey,
      baseURL: llmKey.baseURL,
      headers: llmKey.headers,
    });
    const model = provider.textEmbeddingModel(EMBEDDING_MODEL);

    // 1. Look up cached embeddings.
    const cache = await fetchCachedEmbeddings(controls);

    // 2. Identify controls that need (re)computing.
    const toCompute: Array<{ control: EmbeddingControl; sourceHash: string }> = [];
    for (const c of controls) {
      const key = `${c.framework_type}|${c.control_id}`;
      const sourceHash = hashSource(controlSourceText(c));
      const cached = cache.get(key);
      if (!cached || cached.source_hash !== sourceHash) {
        toCompute.push({ control: c, sourceHash });
      }
    }

    // 3. Embed missing controls in one batch call.
    if (toCompute.length > 0) {
      const { embeddings } = await embedMany({
        model,
        values: toCompute.map((x) => controlSourceText(x.control)),
      });
      const persistRows = toCompute.map((x, i) => ({
        control_id: x.control.control_id,
        framework_type: x.control.framework_type,
        embedding: embeddings[i],
        source_hash: x.sourceHash,
      }));
      await persistEmbeddings(persistRows);
      // Update in-memory cache for ranking below.
      for (const row of persistRows) {
        cache.set(`${row.framework_type}|${row.control_id}`, row);
      }
    }

    // 4. Embed the query text.
    const { embedding: queryEmbedding } = await embed({
      model,
      value: queryText.slice(0, 8000), // hard cap to keep token cost bounded
    });

    // 5. Compute similarity for each control and pick top K.
    const ranked: RankedControl[] = [];
    for (const c of controls) {
      const cached = cache.get(`${c.framework_type}|${c.control_id}`);
      if (!cached) continue;
      const sim = cosineSimilarity(queryEmbedding, cached.embedding);
      ranked.push({ control: c, similarity: sim });
    }
    ranked.sort((a, b) => b.similarity - a.similarity);
    return ranked.slice(0, topK);
  } catch (err) {
    logger.warn("[evidenceAnalyzer/embeddingMatcher] failed; caller should fall back", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Helper — build the analysis query text                             */
/* ------------------------------------------------------------------ */

export function buildQueryTextForEmbedding(input: {
  summary: string;
  keyFindings: string[];
  complianceAreas: string[];
}): string {
  const parts = [
    input.summary,
    ...input.keyFindings.slice(0, 5),
    `Compliance areas: ${input.complianceAreas.join(", ")}`,
  ].filter((p) => p && p.trim().length > 0);
  return parts.join("\n\n");
}
