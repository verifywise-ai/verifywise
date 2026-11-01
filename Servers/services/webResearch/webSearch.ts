/**
 * The search interface of the web research toolkit: the `SearchEngine` a research session is given,
 * the `SearchResult` it answers with, the error that every failed search comes out as, and the
 * queue that spaces the requests of one engine.
 *
 * The engines are in modules of their own: the web search of the LLM provider of the research key
 * (providerSearch.ts), the news of the GDELT Project (gdeltSearch.ts) and, for the evaluation, a
 * replay of a recording (vendorResearch/eval/replay.ts). Which of them a run uses is told from the
 * research key (vendorResearch/searchEngineOf.ts). The RSS feeds of Bing, which this module used to
 * read, are gone: the notice in every feed allows only personal, non-commercial display in an RSS
 * reader and asks for Microsoft's written permission for any other use, and the robots.txt of Bing
 * disallows the web feed. A commercial product that hands the results to an LLM provider is
 * outside that notice.
 */

export type SearchKind = "web" | "news";

export interface SearchResult {
  title: string;
  /** A public address that passed `parsePublicUrl`. */
  url: string;
  /** At most MAX_SNIPPET_CHARS characters of plain text; empty for an engine that gives none. */
  snippet: string;
  /**
   * ISO 8601, or null when the engine knows no date. For a result of a web search this is at best
   * the day the engine saw the page, not the day it was published; the web session uses it only as
   * an upper bound and does not keep it (see webSession.ts).
   */
  publishedAt: string | null;
  /** The publisher's name or domain, for news; null for web results. */
  source: string | null;
}

export const MAX_RESULTS = 10;

/** Thrown for every failed search. The message is fixed: it repeats nothing of the query or the answer. */
export class SearchEngineError extends Error {
  constructor() {
    super("The search is not available right now");
    this.name = "SearchEngineError";
  }
}

/**
 * Who an engine is, as the run record and the cache name it: the search of the Claude and OpenAI
 * providers, the news of the GDELT Project, or a replay of a recording.
 */
export type SearchEngineId = "anthropic" | "openai" | "gdelt" | "replay";

export interface SearchEngine {
  /** Which engine this is. A wrapper reports the engine that answers now. */
  readonly id: SearchEngineId;
  /**
   * The kinds of search the engine answers. The web session refuses a search of another kind before
   * it reaches the engine, and an engine that is asked for one anyway fails it with a
   * SearchEngineError. A wrapper reports the kinds of the engine that answers now, so read this at
   * the time of a search, not when the engine is made.
   */
  readonly kinds: readonly SearchKind[];
  /**
   * How far back the news of this engine reaches, in months; null when it has no such limit. The
   * prompts tell the model about it, since an event older than that is not in the news.
   */
  readonly newsWindowMonths: number | null;
  /**
   * At most MAX_RESULTS results, possibly none: an empty list is an answer. Rejects with a
   * SearchEngineError when the search failed for any reason, an abort included.
   */
  search(query: string, kind: SearchKind, signal?: AbortSignal): Promise<SearchResult[]>;
}

/**
 * Runs the tasks it is given one at a time, each starting at least `minGapMs` after the previous
 * one started. A task that fails does not stop the ones behind it. When `signal` aborts while a task
 * is still waiting, for its turn or for the gap, it rejects with an AbortError and never runs;
 * once a task has started, the signal is the task's own business.
 */
export type SearchQueue = <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

function abortError(): Error {
  const error = new Error("The search was cancelled");
  error.name = "AbortError";
  return error;
}

/** setTimeout as a promise that rejects with an AbortError, and frees its timer, on abort. */
export function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A queue for the searches of one engine. The gap is the engine's own, since what a service allows
 * differs (GDELT asks for five seconds), so the caller states it: there is no default, and a gap
 * that is missing or that is not a number of milliseconds is refused, because a queue made without
 * one would space nothing.
 */
export function createSearchQueue(options: {
  minGapMs: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): SearchQueue {
  const minGapMs = options?.minGapMs;
  if (typeof minGapMs !== "number" || !Number.isFinite(minGapMs) || minGapMs < 0) {
    throw new RangeError("A search queue needs a gap of zero or more milliseconds");
  }
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? sleepUnlessAborted;
  let lastStartedAt: number | undefined;
  // Every turn catches its own errors, so the chain never rejects and one failure ends nothing.
  let tail: Promise<void> = Promise.resolve();

  return <T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      let waiting = true;
      const onAbort = () => {
        waiting = false;
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      tail = tail.then(async () => {
        try {
          if (waiting && lastStartedAt !== undefined) {
            const wait = lastStartedAt + minGapMs - now();
            if (wait > 0) await sleep(wait, signal);
          }
          // An abort has rejected the caller already; this turn only has to pass on.
          if (!waiting) return;
          waiting = false;
          signal?.removeEventListener("abort", onAbort);
          lastStartedAt = now();
          resolve(await task());
        } catch (error) {
          reject(error);
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      });
    });
}
