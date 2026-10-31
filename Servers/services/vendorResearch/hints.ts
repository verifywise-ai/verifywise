/**
 * Search queries from what the model remembers about a vendor. A model knows a good deal about the
 * vendors that are well known: an incident that made the news, a settlement, an outage, the kind
 * of matter a vendor of its sort attracts. The baseline searches of `gather.ts` ask for
 * `data breach`, `security incident`, `lawsuit`, `fined` and `outage` and find what those words
 * find; one cheap call asks
 * the model for one more query for each news category, about the matter it remembers, and the
 * code searches for it with the others.
 *
 * What the model says here is only ever a query. It is never put in the ledger, in the briefing
 * as a fact or before the analysis: a hint that is wrong finds nothing about the vendor, and the
 * relevance rule of the session keeps whatever it does find out of the evidence unless the
 * result names the vendor. The call has no web content in its prompt (the vendor's record, escaped,
 * is all it gets), so nothing a third party wrote can steer it, and the query that comes out is
 * made the shape the feed answers best (the vendor's name and at most three topic words) like any
 * query of the model.
 *
 * It never fails a run: a model that does not answer in time or at all, or that answers badly,
 * gives no hints, and the run goes on with the baseline searches.
 */
import { z } from "zod";
import type { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { REPEATED_QUERY_JACCARD, queryWords, similarity } from "../webResearch/queryMatch";
import type { SearchPlan } from "./gather";
import { shortName } from "./identity";
import { buildHintsSystemPrompt, buildHintsTaskPrompt } from "./prompts";
import { normalizeQuery, suggestedQueries } from "./queries";
import { ResearchTarget } from "./target";

/** The call is cheap and short; a model that needs longer is left out. */
export const HINTS_TIMEOUT_MS = 15_000;
/** The queries of one category that are searched. Each costs a search and an interval of the queue. */
export const MAX_HINTS_PER_CATEGORY = 1;
/** The queries an answer may hold, so that a model that writes a few too many costs no retry. */
const MAX_HINTS_IN_ANSWER = 6;
const MAX_HINT_QUERY_CHARS = 120;

/** The categories that search the news: the ones a hint is for. */
export const HINT_CATEGORIES = [
  "security_incidents",
  "legal_regulatory",
  "availability",
  "financial_health",
] as const;

export const hintsSchema = z.object({
  queries: z
    .array(
      z.object({
        category: z.enum(HINT_CATEGORIES),
        query: z.string().min(1).max(MAX_HINT_QUERY_CHARS),
      }),
    )
    .max(MAX_HINTS_IN_ANSWER),
});

export type Hints = z.infer<typeof hintsSchema>;

/**
 * The searches that hints make: for each category the first hint that is any use, in the order of
 * the categories. A hint is no use when its category is not researched, when it has no topic word
 * after the vendor's name (the name alone is no search of the news), or when it repeats a query
 * that the code makes anyway or an earlier hint: the session would refuse it.
 */
export function hintSearchesOf(
  hints: Hints["queries"],
  target: ResearchTarget,
  researchable: readonly ResearchCategory[],
): SearchPlan[] {
  const baseline = suggestedQueries(target, researchable);
  const asked = Object.values(baseline)
    .flat()
    .map((query) => queryWords(query));
  // A query that is only a name of the vendor is no search of the news, whichever name it is.
  const names = new Set([target.name, ...(target.aliases ?? [])].map(shortName));
  const taken = new Map<ResearchCategory, number>();
  const plans: SearchPlan[] = [];
  for (const hint of hints) {
    if (baseline[hint.category] === undefined) continue;
    if ((taken.get(hint.category) ?? 0) >= MAX_HINTS_PER_CATEGORY) continue;
    const query = normalizeQuery(hint.query, target);
    if (names.has(query)) continue;
    const words = queryWords(query);
    if (asked.some((earlier) => similarity(earlier, words) >= REPEATED_QUERY_JACCARD)) continue;
    asked.push(words);
    taken.set(hint.category, (taken.get(hint.category) ?? 0) + 1);
    plans.push({ category: hint.category, query });
  }
  return RESEARCH_CATEGORIES.flatMap((category) =>
    plans.filter((plan) => plan.category === category),
  );
}

/**
 * Asks the model for the hints and returns the searches they make. `generate` is the call of the
 * run, so that the call is in the run's trace and a provider that rejects `json_schema` is learnt
 * from. Nothing is asked when no category of the run searches the news.
 */
export async function requestHints(
  input: {
    target: ResearchTarget;
    researchable: readonly ResearchCategory[];
    model: unknown;
    signal?: AbortSignal;
  },
  deps: { generate: typeof generateObjectWithSelfCorrection },
): Promise<SearchPlan[]> {
  const { target, researchable, model, signal } = input;
  if (Object.keys(suggestedQueries(target, researchable)).length === 0) return [];
  try {
    const answer = await deps.generate({
      model,
      schema: hintsSchema,
      system: buildHintsSystemPrompt(),
      prompt: buildHintsTaskPrompt({ target, researchable }),
      temperature: 0,
      innerMaxRetries: 1,
      maxSelfCorrectionAttempts: 0,
      extra: {
        abortSignal: AbortSignal.any(
          signal === undefined
            ? [AbortSignal.timeout(HINTS_TIMEOUT_MS)]
            : [AbortSignal.timeout(HINTS_TIMEOUT_MS), signal],
        ),
      },
    });
    return hintSearchesOf(answer.object.queries, target, researchable);
  } catch {
    // The hints are a help and not part of the research: a model that gives none changes nothing.
    return [];
  }
}
