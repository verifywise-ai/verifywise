/**
 * Evidence Analyzer — Semantic control matcher.
 *
 * Strategy:
 *   1. Pre-filter: keyword/area overlap to narrow ~hundreds of controls
 *      down to ≤25 candidates per framework. This keeps the LLM prompt
 *      focused and the cost low.
 *   2. LLM scoring: pass the analysis (summary + findings + areas) and
 *      candidates to a deterministic LLM call. The LLM scores each
 *      candidate's match strength on the 0-100 ladder.
 *   3. Code merge: combine cross-framework results, sort by score, cap at 10.
 */

import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { controlMatchListSchema, type ControlMatchOutput } from "./schema";
import { generateObjectWithSelfCorrection } from "../llmSelfCorrect";
import { buildControlMatcherSystemPrompt, buildControlMatcherUserPrompt } from "./prompts";
import {
  rankControlsByEmbedding,
  buildQueryTextForEmbedding,
  type EmbeddingMatcherKey,
} from "./embeddingMatcher";

interface ControlCandidate {
  control_id: number;
  framework_type: string;
  control_title: string;
  control_description?: string;
}

interface MatchControlsParams {
  model: any; // AI SDK LanguageModel — typed loosely to avoid leaking provider types here
  summary: string;
  keyFindings: string[];
  complianceAreas: string[];
  preFilterMaxPerFramework?: number;
  finalCap?: number;
  /**
   * Optional OpenAI key for embedding-based pre-filter. When present,
   * candidates are ranked by cosine similarity instead of keyword overlap.
   * Falls back to keyword pre-filter on any failure.
   */
  embeddingKey?: EmbeddingMatcherKey;
}

export interface MatchedControl {
  control_id: number;
  control_title: string;
  framework_type: string;
  match_score: number;
  matched_areas: string[];
  rationale: string;
}

/**
 * Fetch the full per-framework candidate list (no pre-filter applied).
 * The caller chooses between keyword and embedding pre-filtering.
 */
async function fetchAllControls(): Promise<ControlCandidate[]> {
  const list: ControlCandidate[] = [];

  try {
    const [euRows] = await sequelize.query(
      `SELECT id, title as control_title, description as control_description
       FROM controls_struct_eu
       WHERE title IS NOT NULL
       ORDER BY id ASC
       LIMIT 200`,
    );
    list.push(
      ...(euRows as any[]).map((r) => ({
        control_id: r.id as number,
        framework_type: "eu_ai_act",
        control_title: r.control_title as string,
        control_description: r.control_description as string | undefined,
      })),
    );
  } catch (err) {
    logger.warn("[evidenceAnalyzer] EU AI Act control fetch failed", err);
  }

  try {
    const [isoRows] = await sequelize.query(
      `SELECT id, title as control_title, description as control_description
       FROM annexcategories_struct_iso
       WHERE title IS NOT NULL
       ORDER BY id ASC
       LIMIT 200`,
    );
    list.push(
      ...(isoRows as any[]).map((r) => ({
        control_id: r.id as number,
        framework_type: "iso_42001",
        control_title: r.control_title as string,
        control_description: r.control_description as string | undefined,
      })),
    );
  } catch (err) {
    logger.warn("[evidenceAnalyzer] ISO 42001 control fetch failed", err);
  }

  return list;
}

/**
 * Keyword-based pre-filter — ranks each control by area-keyword overlap and
 * keeps up to `perFramework` candidates per framework. This is the fallback
 * when embeddings are not available.
 */
function keywordPreFilter(
  controls: ControlCandidate[],
  complianceAreas: string[],
  perFramework: number,
): ControlCandidate[] {
  const areaTerms = complianceAreas.map((a) => a.toLowerCase().trim()).filter((a) => a.length >= 3);

  const byFramework = new Map<string, ControlCandidate[]>();
  for (const c of controls) {
    const arr = byFramework.get(c.framework_type) ?? [];
    arr.push(c);
    byFramework.set(c.framework_type, arr);
  }

  const out: ControlCandidate[] = [];
  for (const [, list] of byFramework) {
    out.push(...rankAndCap(list, areaTerms, perFramework));
  }
  return out;
}

/**
 * Score each candidate by area-keyword overlap and keep the top N.
 * If no terms match, fall back to the first N controls (safer than
 * dropping everything).
 */
function rankAndCap(
  list: ControlCandidate[],
  areaTerms: string[],
  cap: number,
): ControlCandidate[] {
  if (areaTerms.length === 0) {
    return list.slice(0, cap);
  }

  const scored = list.map((c) => {
    const haystack = `${c.control_title} ${c.control_description ?? ""}`.toLowerCase();
    let hits = 0;
    for (const term of areaTerms) {
      if (haystack.includes(term)) hits += 1;
    }
    return { c, hits };
  });

  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, cap).map((s) => s.c);
}

/**
 * Public entry — match controls semantically using the LLM.
 *
 * If `embeddingKey` is provided, the pre-filter step uses cosine similarity
 * (cached embeddings via OpenAI text-embedding-3-small). Otherwise we fall
 * back to keyword overlap on `complianceAreas`. The downstream LLM scorer
 * is identical in both modes.
 */
export async function matchControlsSemantic(
  params: MatchControlsParams,
): Promise<MatchedControl[]> {
  const all = await fetchAllControls();
  if (all.length === 0) return [];

  const perFramework = params.preFilterMaxPerFramework ?? 18;
  let candidates: ControlCandidate[];
  let preFilterMethod = "keyword";

  if (params.embeddingKey?.apiKey) {
    const queryText = buildQueryTextForEmbedding({
      summary: params.summary,
      keyFindings: params.keyFindings,
      complianceAreas: params.complianceAreas,
    });
    // Rank globally then take top-N per framework so the LLM still sees a
    // mix of frameworks rather than only the strongest one.
    const ranked = await rankControlsByEmbedding({
      controls: all,
      queryText,
      topK: perFramework * 4, // wider net before per-framework cap
      llmKey: params.embeddingKey,
    });
    if (ranked) {
      const perFrameworkCount = new Map<string, number>();
      candidates = [];
      for (const r of ranked) {
        const fw = r.control.framework_type;
        const used = perFrameworkCount.get(fw) ?? 0;
        if (used >= perFramework) continue;
        candidates.push(r.control);
        perFrameworkCount.set(fw, used + 1);
      }
      preFilterMethod = "embedding";
    } else {
      candidates = keywordPreFilter(all, params.complianceAreas, perFramework);
    }
  } else {
    candidates = keywordPreFilter(all, params.complianceAreas, perFramework);
  }

  if (candidates.length === 0) {
    return [];
  }

  logger.debug(
    `[evidenceAnalyzer] control matcher pre-filter via ${preFilterMethod}: ${candidates.length} candidates`,
  );

  const userPrompt = buildControlMatcherUserPrompt({
    summary: params.summary,
    keyFindings: params.keyFindings,
    complianceAreas: params.complianceAreas,
    candidates,
  });

  let result: ControlMatchOutput;
  try {
    const sc = await generateObjectWithSelfCorrection({
      model: params.model,
      schema: controlMatchListSchema,
      system: buildControlMatcherSystemPrompt(),
      prompt: userPrompt,
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
    });
    result = sc.object;
    if (sc.selfCorrected) {
      logger.debug(
        `[evidenceAnalyzer] control matcher self-corrected after ${sc.attempts} attempts`,
      );
    }
  } catch (err) {
    logger.warn("[evidenceAnalyzer] semantic control matching failed, returning empty", err);
    return [];
  }

  // Build a lookup so we can attach control_title and framework_type
  // back from the candidate list (LLM only returns id + score).
  const lookup = new Map<number, ControlCandidate>();
  for (const c of candidates) lookup.set(c.control_id, c);

  const merged: MatchedControl[] = [];
  for (const m of result.matches) {
    const cand = lookup.get(m.control_id);
    if (!cand) continue; // LLM hallucinated an id — drop
    if (m.match_score < 50) continue; // double-guard
    merged.push({
      control_id: cand.control_id,
      control_title: cand.control_title,
      framework_type: cand.framework_type,
      match_score: m.match_score,
      matched_areas: m.matched_areas,
      rationale: m.rationale,
    });
  }

  merged.sort((a, b) => b.match_score - a.match_score);
  return merged.slice(0, params.finalCap ?? 10);
}
