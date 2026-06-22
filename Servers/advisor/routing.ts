/**
 * Agent-scoped tool subsetting (Phase 1 — keyword router).
 *
 * Given a user message and the master tool catalogue, return only the
 * subset of tools that the relevant agents are likely to need. This:
 *   - Cuts prompt token cost (fewer tool definitions per call).
 *   - Improves tool-selection accuracy (LLM picks from a focused list).
 *   - Stays model-independent (works with any provider).
 *
 * Strategy:
 *   1. Score each agent in AGENT_TOOL_MAP by how many keywords appear in
 *      the user message (case-insensitive substring match).
 *   2. Pick the top-K agents by score (default K=3).
 *   3. Active set = (union of those agents' tools) ∪ (universal tools).
 *      Universal = any tool in the master catalogue NOT claimed by any
 *      agent in AGENT_TOOL_MAP — keeps unclaimed tools (search, notes,
 *      automation, generate_chart, etc.) always available.
 *   4. Fallback paths (return full catalogue):
 *      - No keyword match in any agent
 *      - Empty / very short user message
 *      - Subsetting disabled by feature flag
 *      - Subset has fewer than `minActiveTools` entries (defensive guard
 *        against pathological configs)
 *
 * Phase 2 (later): swap keyword scoring for embedding similarity using the
 * same infrastructure built for control matching. The public API stays the
 * same.
 */

import logger from "../utils/logger/fileLogger";
import { AGENT_TOOL_MAP, type AgentToolEntry } from "./agents/agentToolMap";
import {
  rankAgentsByEmbedding,
  type EmbeddingProviderKey,
  type RankedAgent,
} from "./agents/agentEmbeddingMatcher";

export interface RoutingResult<TAvailable, TDef> {
  availableTools: TAvailable;
  toolsDefinition: TDef[];
  /** Names of agents whose tools were included (empty when fallback). */
  selectedAgents: string[];
  /** Why the subset was chosen (for telemetry / debugging). */
  reason:
    | "subset_embedding_match"
    | "subset_keyword_match"
    | "fallback_no_match"
    | "fallback_too_few_tools"
    | "fallback_empty_message"
    | "fallback_disabled"
    | "fallback_error";
  /** Tool count metrics (helpful in logs). */
  metrics: {
    fullCount: number;
    activeCount: number;
    universalCount: number;
  };
  /**
   * Optional similarity score per selected agent (only set when the
   * embedding ranker fired). Useful for telemetry/debugging.
   */
  similarities?: Array<{ agent: string; similarity: number }>;
}

export interface SelectActiveToolsParams<TAvailable, TDef> {
  message: string;
  availableTools: TAvailable;
  toolsDefinition: TDef[];
  enabled?: boolean;
  topK?: number;
  /** Minimum active-set size before falling back to full catalogue. */
  minActiveTools?: number;
  /**
   * Optional OpenAI-compatible key. When present, the router uses
   * embedding similarity instead of keyword scoring. On any embedding
   * failure (network, key invalid, etc.) the router silently falls
   * back to keyword scoring.
   */
  embeddingKey?: EmbeddingProviderKey;
}

const MIN_USEFUL_MESSAGE_CHARS = 4;

/* ------------------------------------------------------------------ */
/* Universal tool detection                                           */
/* ------------------------------------------------------------------ */

/**
 * Build the set of tool names claimed by at least one agent. Used to
 * derive the universal complement from the master catalogue.
 */
function buildClaimedToolNameSet(): Set<string> {
  const claimed = new Set<string>();
  for (const agent of AGENT_TOOL_MAP) {
    for (const t of agent.tools) claimed.add(t);
  }
  return claimed;
}

/* ------------------------------------------------------------------ */
/* Keyword scoring                                                    */
/* ------------------------------------------------------------------ */

interface ScoredAgent {
  agent: AgentToolEntry;
  hits: number;
  matchedKeywords: string[];
}

function scoreAgentsByKeywords(message: string, agents: AgentToolEntry[]): ScoredAgent[] {
  const m = message.toLowerCase();
  return agents
    .map((agent) => {
      const matched: string[] = [];
      for (const kw of agent.keywords) {
        if (m.includes(kw.toLowerCase())) matched.push(kw);
      }
      return { agent, hits: matched.length, matchedKeywords: matched };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

/* ------------------------------------------------------------------ */
/* Main entry                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build the active-set + filtered tools given a list of selected agents.
 * Shared by both the embedding and keyword paths.
 */
function buildSubset<
  TAvailable extends Record<string, unknown>,
  TDef extends { function?: { name?: string }; name?: string },
>(
  selectedAgents: AgentToolEntry[],
  params: SelectActiveToolsParams<TAvailable, TDef>,
): {
  availableTools: TAvailable;
  toolsDefinition: TDef[];
  activeNames: Set<string>;
  universalCount: number;
} {
  const claimedByAll = buildClaimedToolNameSet();

  // Universal tools = catalogue entries not claimed by any agent in the map.
  const universalNames = new Set<string>();
  const allDefNames = new Set<string>();
  for (const def of params.toolsDefinition) {
    const name = (def?.function?.name || (def as { name?: string }).name) as string | undefined;
    if (!name) continue;
    allDefNames.add(name);
    if (!claimedByAll.has(name)) universalNames.add(name);
  }

  const activeNames = new Set<string>(universalNames);
  for (const a of selectedAgents) {
    for (const t of a.tools) {
      if (allDefNames.has(t)) activeNames.add(t);
    }
  }

  const activeAvailableTools = {} as TAvailable;
  for (const key of Object.keys(params.availableTools) as Array<keyof TAvailable>) {
    if (activeNames.has(key as string)) {
      (activeAvailableTools as Record<string, unknown>)[key as string] = params.availableTools[key];
    }
  }

  const activeToolsDefinition = params.toolsDefinition.filter((def) => {
    const name = (def?.function?.name || (def as { name?: string }).name) as string | undefined;
    return !!name && activeNames.has(name);
  });

  return {
    availableTools: activeAvailableTools,
    toolsDefinition: activeToolsDefinition,
    activeNames,
    universalCount: universalNames.size,
  };
}

export async function selectActiveTools<
  TAvailable extends Record<string, unknown>,
  TDef extends { function?: { name?: string }; name?: string },
>(params: SelectActiveToolsParams<TAvailable, TDef>): Promise<RoutingResult<TAvailable, TDef>> {
  const fullCount = params.toolsDefinition.length;
  const enabled = params.enabled !== false;
  const topK = params.topK ?? 3;
  const minActiveTools = params.minActiveTools ?? 6;

  const fullResult = (
    reason: RoutingResult<TAvailable, TDef>["reason"],
    universalCount = fullCount,
  ): RoutingResult<TAvailable, TDef> => ({
    availableTools: params.availableTools,
    toolsDefinition: params.toolsDefinition,
    selectedAgents: [],
    reason,
    metrics: {
      fullCount,
      activeCount: fullCount,
      universalCount,
    },
  });

  if (!enabled) {
    return fullResult("fallback_disabled");
  }

  if (!params.message || params.message.trim().length < MIN_USEFUL_MESSAGE_CHARS) {
    return fullResult("fallback_empty_message");
  }

  try {
    // ---- Path A: embedding-based ranking (preferred when key present) ----
    let topAgents: AgentToolEntry[] = [];
    let similarities: Array<{ agent: string; similarity: number }> | undefined;
    let usedEmbedding = false;

    if (params.embeddingKey?.apiKey) {
      const ranked: RankedAgent[] | null = await rankAgentsByEmbedding({
        message: params.message,
        topK,
        llmKey: params.embeddingKey,
      });
      if (ranked && ranked.length > 0) {
        topAgents = ranked.map((r) => r.agent);
        similarities = ranked.map((r) => ({
          agent: r.agent.name,
          similarity: Number(r.similarity.toFixed(4)),
        }));
        usedEmbedding = true;
      }
      // ranked === null → embedding path failed silently; fall through to keyword.
      // ranked === [] → embedding succeeded but no agent passed similarity floor.
    }

    // ---- Path B: keyword scoring (fallback or default) ----
    if (!usedEmbedding) {
      const scored = scoreAgentsByKeywords(params.message, AGENT_TOOL_MAP);
      if (scored.length === 0) {
        return fullResult("fallback_no_match");
      }
      topAgents = scored.slice(0, topK).map((s) => s.agent);
    }

    if (topAgents.length === 0) {
      return fullResult("fallback_no_match");
    }

    const subset = buildSubset(topAgents, params);

    if (subset.activeNames.size < minActiveTools) {
      return fullResult("fallback_too_few_tools", subset.universalCount);
    }

    return {
      availableTools: subset.availableTools,
      toolsDefinition: subset.toolsDefinition,
      selectedAgents: topAgents.map((a) => a.name),
      reason: usedEmbedding ? "subset_embedding_match" : "subset_keyword_match",
      metrics: {
        fullCount,
        activeCount: subset.activeNames.size,
        universalCount: subset.universalCount,
      },
      similarities,
    };
  } catch (err) {
    logger.warn("[routing] selectActiveTools failed; falling back to full catalogue", err);
    return fullResult("fallback_error");
  }
}
