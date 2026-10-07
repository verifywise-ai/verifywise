import { RiskCatalogEntry } from "../../structures/risk-catalogs/types";

/**
 * MIT catalog pre-filter for the risk-suggestion prompt.
 *
 * 611 entries with full descriptions is far past a sensible prompt budget, so
 * the model sees only the top MIT_CANDIDATE_LIMIT entries, ranked by token
 * overlap between the use-case text and the entry's summary + categories.
 * Descriptions stay server-side even for the survivors (roughly a 4x token
 * cut); the model matches on summary and category vocabulary alone, and the
 * service hydrates full fields for the ids it returns.
 *
 * The IBM catalog (113 entries) is small enough to send whole and is not
 * scored here.
 *
 * Pure and exported so it can be tested without a paid network call.
 */

export const MIT_CANDIDATE_LIMIT = 40;

/**
 * English stop words plus governance filler ("risk", "system", ...) that
 * appears in nearly every entry and use case alike. Kept small on purpose:
 * over-filtering costs recall, which the LLM pass then has to recover.
 */
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "are",
  "was",
  "were",
  "will",
  "would",
  "can",
  "could",
  "may",
  "might",
  "its",
  "their",
  "our",
  "your",
  "use",
  "used",
  "using",
  "such",
  "other",
  "into",
  "over",
  "under",
  "about",
  "based",
  "via",
  "per",
  "any",
  "all",
  "not",
  "but",
  "out",
  "who",
  "how",
  "what",
  "when",
  "where",
  "which",
  "while",
  "than",
  "then",
  "them",
  "they",
  "these",
  "those",
  "have",
  "has",
  "had",
  "been",
  "being",
  "also",
]);

/** Lowercase, strip everything but [a-z0-9 ], split, drop stop words and tokens of length <= 2. */
export function tokenizeUseCaseText(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function entryTokens(entry: RiskCatalogEntry): Set<string> {
  return tokenizeUseCaseText(`${entry.summary} ${entry.riskCategories.join(" ")}`);
}

/**
 * Rank `catalog` against `useCaseText` by shared-token count (summary +
 * category vocabulary), descending; ties break on catalog id ascending so the
 * result is deterministic across runs. Returns at most `limit` entries.
 *
 * An empty use-case text tokenizes to nothing, every score is 0, and the
 * first `limit` entries by id come back — a valid, if uninformative,
 * candidate set rather than a crash.
 */
export function rankCatalogCandidates(
  catalog: RiskCatalogEntry[],
  useCaseText: string,
  limit: number = MIT_CANDIDATE_LIMIT,
): RiskCatalogEntry[] {
  const queryTokens = tokenizeUseCaseText(useCaseText);

  const scored = catalog.map((entry) => {
    let overlap = 0;
    for (const token of entryTokens(entry)) {
      if (queryTokens.has(token)) overlap += 1;
    }
    return { entry, overlap };
  });

  scored.sort((a, b) => b.overlap - a.overlap || a.entry.id - b.entry.id);
  return scored.slice(0, limit).map((s) => s.entry);
}
