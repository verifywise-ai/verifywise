/**
 * Replay: a search engine, a page reader and a model that answer from a recording (see types.ts),
 * so that the real researcher and the real analysis run over a case with no network and no key.
 *
 * A search is found by its kind and its words, with the case and the spacing ignored. A search the
 * recording does not hold throws: the steps of a case and its searches were written together, so a
 * miss is a mistake in the case and must not pass as an empty answer. A page the recording does not
 * hold answers `not_found`, as the web would.
 *
 * The scripted model reports tokens like a real one does, estimated from the text (one for every
 * four characters), so that a change that makes the prompts longer shows in the measure.
 */
import type { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import type { ResearchCategory } from "../../../domain.layer/interfaces/i.vendorResearch";
import { PageReadError, type PageReader } from "../../webResearch/readPage";
import type { SearchEngine, SearchKind, SearchResult } from "../../webResearch/webSearch";
import { hintsSchema } from "../hints";
import { loopScopeOf } from "../prompts";
import { credibilityOutputSchema, researchOutputSchema } from "../schema";
import { verifierSchema } from "../verifier";
import type { Recording } from "./types";

/** The words of a query as they are compared: lower case, one space between words. */
const normalised = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ");

export interface ReplayEngine extends SearchEngine {
  /** The feed that returned an address, once a search has; undefined for an address no search returned. */
  feedOf(url: string): SearchKind | undefined;
}

export function createReplayEngine(searches: Recording["searches"]): ReplayEngine {
  const feeds = new Map<string, SearchKind>();
  return {
    async search(query, kind) {
      const wanted = normalised(query);
      const recorded = searches.find(
        (entry) => entry.kind === kind && normalised(entry.query) === wanted,
      );
      if (recorded === undefined) {
        throw new Error(`replay: no recorded search for ${kind} "${query}"`);
      }
      const results: SearchResult[] = recorded.results.map((result) => ({ ...result }));
      for (const result of results) if (!feeds.has(result.url)) feeds.set(result.url, kind);
      return results;
    },
    feedOf: (url) => feeds.get(url),
  };
}

export function createReplayPageReader(pages: Recording["pages"]): PageReader {
  return async (url) => {
    const recorded = pages.find((entry) => entry.url === url);
    if (recorded === undefined) throw new PageReadError("not_found");
    if ("failure" in recorded) throw new PageReadError(recorded.failure);
    return { ...recorded.page, links: recorded.page.links.map((link) => ({ ...link })) };
  };
}

/** One token for every four characters, rounded up: the estimate of a replayed call. */
export const approximateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * A stand-in for `generateObjectWithSelfCorrection`. The analysis, the call for hints and the
 * verifier (each recognised by its schema) get the recorded answer, the hints and the verifier none
 * (nobody is failed) when the recording has none; the analysis under the credibility rules gets the
 * recorded answer too, whose confidence its schema drops;
 * every other call is a step of a loop and gets the next recorded step, and when they run out the
 * model finishes. The loop of one category (its task names the category, see `loopScopeOf`) has its
 * own list of steps, `loops`, and the loop of all the categories has `steps`; loops that run at
 * once cannot be answered in one order, which is why each has a list. Each answer is held to the
 * schema it was asked for, as the real call holds the model's, so a case that is written wrongly
 * fails where it is wrong.
 */
export function createScriptedGenerate(
  recording: Pick<Recording, "steps" | "analysis" | "hints" | "loops" | "verifier">,
): typeof generateObjectWithSelfCorrection {
  let next = 0;
  const nextOfLoop = new Map<ResearchCategory, number>();
  /** The next recorded step of the loop the prompt is for, or none when its steps ran out. */
  const stepOf = (prompt: string): unknown => {
    const scope = loopScopeOf(prompt);
    if (scope === null) return recording.steps[next++];
    const index = nextOfLoop.get(scope) ?? 0;
    nextOfLoop.set(scope, index + 1);
    return recording.loops?.[scope]?.[index];
  };
  const scripted = async (params: {
    schema: { parse(value: unknown): unknown };
    system: string;
    prompt: string;
    onUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
  }) => {
    const schema = params.schema as unknown;
    const raw =
      schema === researchOutputSchema || schema === credibilityOutputSchema
        ? recording.analysis
        : schema === hintsSchema
          ? (recording.hints ?? { queries: [] })
          : schema === verifierSchema
            ? (recording.verifier ?? { verdicts: [] })
            : (stepOf(params.prompt) ?? {
                thought: "Nothing is left to do.",
                actions: [{ action: "finish" }],
              });
    const object = params.schema.parse(raw);

    const inputTokens = approximateTokens(params.system) + approximateTokens(params.prompt);
    const outputTokens = approximateTokens(JSON.stringify(object));
    const usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    params.onUsage?.(usage);
    return { object, attempts: 1, selfCorrected: false, usage };
  };
  return scripted as unknown as typeof generateObjectWithSelfCorrection;
}
