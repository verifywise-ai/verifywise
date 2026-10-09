/**
 * @fileoverview API types for POST /api/projectRisks/suggest-ai — AI-assisted
 * risk suggestions combining catalog matches (MIT/IBM) with free-form LLM risks.
 *
 * Pure domain types with no framework dependencies.
 */

/**
 * Origin catalog of a matched risk entry.
 */
export type RiskSuggestionSource = "mit" | "ibm";

/**
 * A risk catalog entry (MIT AI Risk Repository / IBM AI Risk Atlas) the LLM
 * judged relevant to the use case.
 */
export interface MatchedCatalogRisk {
  source: RiskSuggestionSource;
  id: number;
  summary: string;
  description: string;
  /** Normalized to the 15 project risk category names. */
  risk_category: string[];
  /** Catalog string, e.g. "Possible"; MIT may use "Almost certain". */
  likelihood: string;
  /** Catalog string, e.g. "Moderate". */
  severity: string;
  /** LLM's relevance rationale (sanitized). */
  reason: string;
  /** One of the 7 lifecycle phase names, when the LLM proposed one. */
  ai_lifecycle_phase?: string;
}

/**
 * A free-form risk suggested by the LLM from the use case description.
 */
export interface SuggestedFreeformRisk {
  risk_name: string;
  risk_description: string;
  /** Category enum strings; may be empty. */
  risk_category: string[];
  ai_lifecycle_phase?: string;
  /** Integer 1-5. */
  likelihood: number;
  /** Integer 1-5. */
  severity: number;
  impact: string;
  mitigation_plan: string;
}

export interface SuggestRisksRequest {
  projectId: number;
  technologySummary?: string;
  llmKeyId?: number;
}

export interface SuggestRisksResponse {
  matched: MatchedCatalogRisk[];
  suggested: SuggestedFreeformRisk[];
  suppressed_count: number;
}
