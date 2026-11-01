/**
 * Search through the web search of the LLM provider: the engine of a research key whose provider
 * has one, and the wrapper that moves a run to another engine when the key turns out not to be
 * allowed to search. Only Claude's web search is built. An OpenAI key searches the news through
 * GDELT (see gdeltSearch.ts), like every other key, until a person has read OpenAI's Service Terms.
 *
 * A search is one `generateText` call that offers the model the `web_search` server tool, limited
 * to one use, and asks it to run the tool once with the query and to say nothing else. The API runs
 * the search itself and puts the results into the reply, so the text of the model is never read:
 * the results are the `sources` of the reply, and nothing else of it is kept.
 *
 * - The tool is `web_search_20250305`, the basic version. Claude calls it directly, and it is
 *   eligible for zero data retention. From `web_search_20260209` on the tool runs inside code
 *   execution (dynamic filtering), which is not.
 * - The tool is not forced. A reply in which the model did not search is a failed search, not an
 *   empty answer. A search that ran and matched nothing is an answer: an empty list.
 * - A source has an address, a title and `page_age`, which is when the page was last updated and
 *   not when it was published. So a result has no date and no snippet; the page is read when it
 *   matters. The sources are shown as links, which the provider requires.
 * - The call is billed to the research key, about 10 dollars for 1,000 searches plus the tokens of
 *   the call. The tokens of each call go to `onCall`, for the trace.
 * - The SDK retries nothing (`maxRetries` 0). A 429 is an ordinary failed search, and a retry would
 *   hold one of the four places of the engine for seconds while it waited.
 *
 * There are two kinds of failure, and `withFallback` needs to tell them apart:
 *
 * - A search that failed: a rate limit, an error of the provider, a network error, an error code
 *   in the result (too_many_requests, invalid_tool_input, max_uses_exceeded, query_too_long,
 *   request_too_large, unavailable), a reply with no search, an abort. The next search may work.
 *   It is a `SearchEngineError`.
 * - A key that cannot search: the API answers the request with a 400 or a 404. An administrator
 *   can turn web search off for an organisation, and the API then answers a request that offers
 *   the tool with a 400 `invalid_request_error`; a model or a tool the key cannot use is a 400 or
 *   a 404 too. The request differs only in its query, so no other query would work either. It is a
 *   `SearchUnavailableError`, which is a `SearchEngineError`, and `withFallback` takes it as the
 *   sign to answer the rest of the run from another engine.
 *
 * Whatever goes wrong comes out as one of the two, with the fixed message of `SearchEngineError`.
 * The query, the message of the provider and the body of its answer are never logged, kept or put
 * in an error, and nothing is logged here.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { LanguageModel, ToolSet } from "ai";
import type { TokenUsage } from "../../advisor/llmSelfCorrect";
import { MAX_SNIPPET_CHARS, cleanText, cutAtCodePoint } from "../vendorResearch/text";
import { type Limiter, createLimiter } from "./limiter";
import { parsePublicUrl } from "./publicUrl";
import {
  MAX_RESULTS,
  type SearchEngine,
  SearchEngineError,
  type SearchEngineId,
  type SearchKind,
  type SearchResult,
} from "./webSearch";

/** The name the tool has in the call, and so in its reply. */
const SEARCH_TOOL = "web_search";

/**
 * The most the model may write. The call of the tool is part of it (a query of 200 characters is
 * about 60 tokens, and the model may write a line before it), so a cap of a few words would cut the
 * call short and fail the search. What follows the search is one word, which the instructions ask for.
 */
const MAX_OUTPUT_TOKENS = 200;

/** The calls one engine has under way at the same time. One engine is made for each run. */
const MAX_CALLS_AT_ONCE = 4;

/** The longest query: the limit the research loop puts on the queries the model writes. */
const MAX_QUERY_CHARS = 200;

/** The answers of the API that mean the key cannot search, whatever the query. */
const REFUSAL_STATUSES: ReadonlySet<number> = new Set([400, 404]);

const INSTRUCTIONS =
  `You relay one web search. Call the ${SEARCH_TOOL} tool exactly once, with the query the user ` +
  "gives you, and do not search a second time. Do not answer the query: after the search, write " +
  "only the word done.";

const TASKS: Record<SearchKind, string> = {
  web: "Search the web for this query.",
  news: "Search the web for news articles about this query.",
};

/**
 * Thrown by an engine whose key cannot search at all (see the module comment), where a search that
 * merely failed throws a plain SearchEngineError. It is a SearchEngineError with the same fixed
 * message, so whatever treats it as one is right; `withFallback` is what tells them apart.
 */
export class SearchUnavailableError extends SearchEngineError {
  constructor() {
    super();
    this.name = "SearchUnavailableError";
  }
}

/** The options of the call to the model that the engine sets: the ones of `generateText` it uses. */
export interface ProviderSearchRequest {
  model: LanguageModel;
  tools: ToolSet;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  maxRetries: number;
  abortSignal: AbortSignal | undefined;
}

/** The part of the result of `generateText` that the engine reads. */
export interface ProviderSearchReply {
  /**
   * Every part of the reply, in order. The result of the search tool in it shows that a search ran;
   * an error of the tool shows that it failed.
   */
  content?: ReadonlyArray<{ readonly type: string; readonly toolName?: string }>;
  /** The sources of the reply: for a search that ran, its results. */
  sources?: ReadonlyArray<{
    readonly sourceType?: string;
    readonly url?: unknown;
    readonly title?: unknown;
  }>;
  /** What the call used, as the SDK reports it. */
  usage?: unknown;
}

/** `generateText`, as far as the engine uses it. Tests replace it. */
export type ProviderGenerate = (request: ProviderSearchRequest) => PromiseLike<ProviderSearchReply>;

/** What `onCall` is told of a call to the model: what it used and how it ended. */
export interface SearchCall extends TokenUsage {
  /** How long the call took, in milliseconds, without the wait for a place. */
  ms: number;
  /** True when the call returned and its search ran; false when it threw or its search failed. */
  ok: boolean;
}

export interface ProviderSearchDeps {
  /** Whose web search to use. Only Anthropic's is built. */
  provider: "anthropic";
  /**
   * The model of the research key, as the object made from the key, which sends the call to the
   * host of the key. A model id is refused when the engine is made: the SDK would send it through
   * the AI gateway.
   */
  model: LanguageModel;
  /** Replaces `generateText`, for tests. */
  generate?: ProviderGenerate;
  /**
   * The places for the calls of the engine. Four at once by default, for this engine alone: pass
   * one to share the places between engines.
   */
  limit?: Limiter;
  /**
   * Told of each call that was made, whatever became of its search (a call that was never made
   * because the signal had aborted, or the query was empty, is not told). A call that threw is told
   * with no tokens: the SDK does not report what a failed call used. It must not throw; if it does,
   * the search goes on as if it had not.
   */
  onCall?: (call: SearchCall) => void;
}

/**
 * Whether the signal has aborted, read when it is called. A function so that the type checker does
 * not carry what an earlier check showed across an `await`: the signal may abort while a search waits.
 */
const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true;

const countOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** The usage of a call as `TokenUsage`; 0 where the SDK reports none, and a missing total is the sum. */
function usageOf(raw: unknown): TokenUsage {
  const usage = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const inputTokens = countOf(usage.inputTokens) ?? 0;
  const outputTokens = countOf(usage.outputTokens) ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: countOf(usage.totalTokens) ?? inputTokens + outputTokens,
  };
}

/**
 * A text as one line of plain text: control characters and lone surrogates taken out, white space
 * collapsed, cut to `max` units without splitting a pair. A text far longer than it may be is cut
 * first, so that the work does not grow with a hostile one.
 */
function oneLine(text: string, max: number): string {
  const bounded = cutAtCodePoint(text, max * 4);
  return cutAtCodePoint(cleanText(bounded).replace(/\s+/g, " ").trim(), max).trimEnd();
}

/** The query as one line, at most MAX_QUERY_CHARS long; empty when nothing is left of it. */
const queryOf = (query: unknown): string =>
  typeof query === "string" ? oneLine(query, MAX_QUERY_CHARS) : "";

/**
 * The prompt of a search. The query is written as a JSON string on a line of its own, so that
 * whatever it contains stays inside the quotes: the model is told to search for it, not to read
 * it as instructions.
 */
const promptOf = (query: string, kind: SearchKind): string =>
  `${TASKS[kind] ?? TASKS.web}\nQuery: ${JSON.stringify(query)}`;

/** Whether a search ran in the reply: the web search tool gave a result, not an error. */
const searchRan = (reply: ProviderSearchReply): boolean =>
  (reply.content ?? []).some(
    (part) => part.type === "tool-result" && part.toolName === SEARCH_TOOL,
  );

/**
 * The title of a source: its own, as one line of plain text cut to the length of a snippet, or the
 * host and the path of its address when it has none.
 */
function titleOf(title: unknown, url: URL): string {
  const given = typeof title === "string" ? oneLine(title, MAX_SNIPPET_CHARS) : "";
  if (given !== "") return given;
  return oneLine(`${url.hostname}${url.pathname === "/" ? "" : url.pathname}`, MAX_SNIPPET_CHARS);
}

/**
 * The results of a search that ran: its sources that are web addresses, each address once, at most
 * MAX_RESULTS, in the order of the provider. An address that is not a public one (see
 * `parsePublicUrl`) is left out, and does not count toward the limit.
 */
function resultsOf(sources: ProviderSearchReply["sources"]): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const source of sources ?? []) {
    if (results.length >= MAX_RESULTS) break;
    if (source.sourceType !== "url" || typeof source.url !== "string") continue;
    let url: URL;
    try {
      url = parsePublicUrl(source.url);
    } catch {
      continue;
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    results.push({
      title: titleOf(source.title, url),
      url: url.href,
      // Neither is known: the provider gives no text of the page, and its `page_age` is when the
      // page was last updated, which is not when it was published.
      snippet: "",
      publishedAt: null,
      source: null,
    });
  }
  return results;
}

const statusOf = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null) return null;
  const { statusCode } = error as { statusCode?: unknown };
  return typeof statusCode === "number" ? statusCode : null;
};

/**
 * Whether an error is the API refusing the request for good (see the module comment). The SDK
 * wraps the error that ended its retries in a RetryError; this engine asks for none, but the last
 * error of one is read all the same.
 */
function isRefusal(error: unknown): boolean {
  const last = (error as { lastError?: unknown } | null | undefined)?.lastError;
  const status = statusOf(error) ?? statusOf(last);
  return status !== null && REFUSAL_STATUSES.has(status);
}

/**
 * The search engine on the web search of the Claude API, for one run.
 *
 * A search waits for one of the four places of the engine, then makes one call (see the module
 * comment). It makes no call, and so costs nothing, when its signal has aborted by then or when the
 * query has nothing in it once it is cleaned: control characters and lone surrogates are taken
 * out, white space is collapsed and the length is cut to what the research loop allows.
 */
export function createProviderSearchEngine(deps: ProviderSearchDeps): SearchEngine {
  if (deps.provider !== "anthropic") {
    throw new RangeError("Only the Anthropic provider has a web search here");
  }
  if (typeof deps.model !== "object" || deps.model === null) {
    // Every search would fail as an ordinary failed search, with nothing to show why.
    throw new TypeError("A provider search needs the model of the research key, not a model id");
  }
  const generate = deps.generate ?? generateText;
  const limit = deps.limit ?? createLimiter(MAX_CALLS_AT_ONCE);
  const tools: ToolSet = { [SEARCH_TOOL]: anthropic.tools.webSearch_20250305({ maxUses: 1 }) };

  const report = (call: SearchCall): void => {
    try {
      deps.onCall?.(call);
    } catch {
      // The trace is not part of the search.
    }
  };

  const ask = async (
    query: string,
    kind: SearchKind,
    signal: AbortSignal | undefined,
  ): Promise<SearchResult[]> => {
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);
    let reply: ProviderSearchReply;
    try {
      reply = await generate({
        model: deps.model,
        tools,
        instructions: INSTRUCTIONS,
        prompt: promptOf(query, kind),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: signal,
      });
    } catch (error) {
      report({ ...usageOf(undefined), ms: elapsed(), ok: false });
      // A run that was cancelled says nothing about the key, whatever the API answered.
      throw !isAborted(signal) && isRefusal(error)
        ? new SearchUnavailableError()
        : new SearchEngineError();
    }
    const ran = searchRan(reply);
    report({ ...usageOf(reply.usage), ms: elapsed(), ok: ran });
    if (!ran) throw new SearchEngineError();
    return resultsOf(reply.sources);
  };

  return {
    id: "anthropic",
    kinds: ["web", "news"],
    newsWindowMonths: null,
    async search(query, kind, signal) {
      const asked = queryOf(query);
      if (asked === "" || isAborted(signal)) throw new SearchEngineError();
      // The wait for a place ends with a failed search when the signal aborts.
      const release = await limit.take(signal, () => new SearchEngineError());
      try {
        // The signal may have aborted while the search waited, and a call that starts is paid for.
        if (isAborted(signal)) throw new SearchEngineError();
        return await ask(asked, kind, signal);
      } finally {
        release();
      }
    },
  };
}

/** An engine with another behind it, which also says which of the two the searches went to. */
export interface FallbackEngine extends SearchEngine {
  /**
   * The id of the engine the searches of the run have gone to: the first engine's until it reports
   * that its key cannot search, the second's from then on. null before the first search, which is
   * what a run record shows for a run that searched nothing.
   */
  usedId(): SearchEngineId | null;
}

/**
 * An engine for one run that answers from `primary` until `primary` throws a
 * SearchUnavailableError, which says its key cannot search. That search, and every later search of
 * the run, then goes to `fallback`. Any other failure of `primary` is an ordinary failed search:
 * it is passed on, and the next search goes to `primary` again.
 *
 * The wrapper reports the engine that answers now: its id, its kinds and its news window are those
 * of `primary` until the switch and those of `fallback` after it, so read them when a search is
 * made, not when the wrapper is made. The search that triggers the switch is handed to `fallback`
 * as it was asked, whatever its kind; a `fallback` that lacks the kind fails it, like any search it
 * cannot answer, and the later searches of that kind are refused by the session before they get here.
 *
 * Searches that are already running on `primary` when one of them triggers the switch are
 * answered by `primary` or, if they are refused as well, by `fallback`. Nothing is shared between
 * wrappers: the next run asks its key again.
 *
 * A cache for the answers of `primary` goes around `primary`, not around the wrapper. A cache builds
 * its key before the call, so around the wrapper it would file the answer of the search that
 * triggers the switch, which is the answer of `fallback`, under the key of `primary`. Around
 * `primary` a hit never reaches the provider, and a SearchUnavailableError passes through the cache
 * untouched: nothing is stored for it.
 */
export function withFallback(primary: SearchEngine, fallback: SearchEngine): FallbackEngine {
  let primaryUnavailable = false;
  let searched = false;
  const live = (): SearchEngine => (primaryUnavailable ? fallback : primary);

  return {
    get id() {
      return live().id;
    },
    get kinds() {
      return live().kinds;
    },
    get newsWindowMonths() {
      return live().newsWindowMonths;
    },
    async search(query, kind, signal) {
      searched = true;
      if (!primaryUnavailable) {
        try {
          return await primary.search(query, kind, signal);
        } catch (error) {
          if (!(error instanceof SearchUnavailableError)) throw error;
          primaryUnavailable = true;
        }
      }
      return fallback.search(query, kind, signal);
    },
    usedId: () => (searched ? live().id : null),
  };
}
