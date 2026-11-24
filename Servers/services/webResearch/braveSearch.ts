/**
 * Search of the web and the news through the Brave Search API, with an organization's own Brave key:
 * the engine of the research keys that have no web search of their own, ahead of GDELT.
 *
 * - kind `web` asks the LLM Context endpoint (`/llm/context`), whose answer holds passages of each
 *   page (`grounding.generic[].snippets`) and the page's age (`sources[url].age[1]`, YYYY-MM-DD).
 *   Not every plan has it: Brave answers a 400 with `error.code` OPTION_NOT_IN_PLAN to a key whose
 *   plan does not. That search, and every later web search of the key in this process, asks the web
 *   search endpoint (`/web/search`) instead, whose answer holds the description of each page
 *   (`web.results[].description`) and its age (`page_age`).
 * - kind `news` asks the news endpoint (`/news/search`), with `text_decorations=false` so the text
 *   comes without highlighting, and `page_age` for the date.
 * - Both are asked with `safesearch=moderate` (news defaults to strict) and ten results.
 * - A query is cut to the endpoint's limits, words first and then characters: 75 words and 600
 *   characters for LLM Context, 50 words and 400 characters for web search and news.
 *
 * Brave's terms (§3(b)(i)) allow the output of a call to be used, not kept: this engine is never
 * wrapped in `withSearchCache`, and what it answers is used during the run only (the run keeps no
 * title or snippet of it; see the plan of 2026-11-23). Nothing is logged here, and no error holds
 * the key, the query or the answer: every failure is a SearchEngineError with its fixed message.
 *
 * The request goes through `safeFetch` (the outbound policy, an agent that checks every resolved
 * address, redirects refused), with the key in `X-Subscription-Token`. `guardedFetch` is not used:
 * it cannot send that header and does not read the body of an error, which is where Brave says that
 * a key is wrong. Each request has 15 seconds and reads at most 2 MB; the requests made with one key
 * are spaced 1.1 seconds apart, since the free plan allows one a second. The spacing holds across the
 * process: every engine built with the same key shares one queue (see `braveQueueFor`), so the runs
 * the worker has going at once do not each send a request a second.
 *
 * Errors:
 * - a key Brave refuses (`error.code` SUBSCRIPTION_TOKEN_INVALID, or a 401 or 403), or a 402 (the
 *   plan does not pay for the request), is a SearchUnavailableError, so `withFallback` answers the
 *   rest of the run from the next engine;
 * - a 400 OPTION_NOT_IN_PLAN from LLM Context moves the web searches of the engine to web search (see
 *   above); from web search or news, it is a SearchUnavailableError, like a 402;
 * - a 429 whose `X-RateLimit-Remaining` shows 0 in any entry after the first (the first is the
 *   per-second window, the others the longer ones, such as the month) is a quota that is used up: a
 *   SearchUnavailableError at once, with no wait;
 * - any other 429 is waited out once, for the first entry of `X-RateLimit-Reset` in seconds but no
 *   more than 2 seconds, and asked again; a second 429 is a SearchUnavailableError too, since a key
 *   that stays over its rate will not answer the rest of the run either;
 * - anything else (a network error, the time limit, an abort, another status such as a 422 for a
 *   query Brave does not take, a body that is too large, not JSON or of another shape) is a
 *   SearchEngineError: one search fails, and the run keeps the engine.
 */
import { safeFetch } from "../../utils/safeOutboundUrl";
import { MAX_SNIPPET_CHARS, cleanText, cutAtCodePoint } from "../vendorResearch/text";
import { SearchUnavailableError } from "./providerSearch";
import { parsePublicUrl } from "./publicUrl";
import {
  MAX_RESULTS,
  type SearchEngine,
  SearchEngineError,
  type SearchKind,
  type SearchQueue,
  type SearchResult,
  createSearchQueue,
  sleepUnlessAborted,
} from "./webSearch";

export const BRAVE_API_BASE = "https://api.search.brave.com/res/v1";
/** The `error.code` of a key Brave does not know. */
export const BRAVE_INVALID_TOKEN_CODE = "SUBSCRIPTION_TOKEN_INVALID";
/** The `error.code` of an endpoint the key's plan does not hold (a 400). */
export const BRAVE_NOT_IN_PLAN_CODE = "OPTION_NOT_IN_PLAN";
/** The gap between two requests of one engine: the free plan allows one request a second. */
export const BRAVE_MIN_GAP_MS = 1_100;
export const BRAVE_REQUEST_TIMEOUT_MS = 15_000;
export const BRAVE_MAX_BODY_BYTES = 2 * 1024 * 1024;
/** The longest wait after a 429, whatever `X-RateLimit-Reset` asks. */
export const BRAVE_MAX_RATE_LIMIT_WAIT_MS = 2_000;
/** The results asked for, of either endpoint. */
const COUNT = 10;
/** The most passages the LLM Context endpoint gives back, in tokens. */
const MAX_CONTEXT_TOKENS = 4096;
/** The entries of an answer that are read: more than COUNT, so that dropped ones leave room. */
const MAX_ENTRIES_READ = 50;
/** How the passages of one page are joined into a snippet. */
const PASSAGE_JOINER = " … ";

/** The limits Brave sets on a query, per endpoint (its API reference, read on 2026-11-23). */
export const BRAVE_QUERY_LIMITS: Readonly<Record<SearchKind, { words: number; chars: number }>> = {
  web: { words: 75, chars: 600 },
  news: { words: 50, chars: 400 },
};

/**
 * The endpoints a search asks: `context` (LLM Context) for the web, `webSearch` for the web when the
 * key's plan has no LLM Context, `news` for the news.
 */
export type BraveEndpoint = "context" | "webSearch" | "news";

const ENDPOINTS: Readonly<Record<BraveEndpoint, string>> = {
  context: `${BRAVE_API_BASE}/llm/context`,
  webSearch: `${BRAVE_API_BASE}/web/search`,
  news: `${BRAVE_API_BASE}/news/search`,
};

/** The query limits of each endpoint: web search takes what news takes. */
const ENDPOINT_QUERY_LIMITS: Readonly<Record<BraveEndpoint, { words: number; chars: number }>> = {
  context: BRAVE_QUERY_LIMITS.web,
  webSearch: BRAVE_QUERY_LIMITS.news,
  news: BRAVE_QUERY_LIMITS.news,
};

/** The endpoint a search of `kind` asks first. */
const endpointOf = (kind: SearchKind): BraveEndpoint => (kind === "web" ? "context" : "news");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWhiteSpace = (code: number): boolean =>
  code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x3000;

/**
 * The words of a text: runs of characters that are not white space, found by one pass over it.
 */
function wordsOf(text: string): string[] {
  const words: string[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const space = i === text.length || isWhiteSpace(text.charCodeAt(i));
    if (space && start !== -1) {
      words.push(text.slice(start, i));
      start = -1;
    } else if (!space && start === -1) {
      start = i;
    }
  }
  return words;
}

/**
 * The query as the endpoint of `kind` takes it: control characters and lone surrogates out, its
 * first words up to the endpoint's count, then cut to its characters without splitting a pair.
 */
export function braveQueryOf(query: string, kind: SearchKind): string {
  return queryFor(query, BRAVE_QUERY_LIMITS[kind]);
}

/** The query as an endpoint takes it (see `braveQueryOf`). */
function queryFor(query: string, limits: { words: number; chars: number }): string {
  const { words, chars } = limits;
  // The query is bounded before the words are found, so the work does not grow with its length.
  const bounded = cleanText(cutAtCodePoint(query, chars * 4));
  return cutAtCodePoint(wordsOf(bounded).slice(0, words).join(" "), chars).trimEnd();
}

/**
 * The address of a request: the endpoint of `kind` and its parameters, asking for `count` results
 * (ten for a search; the key check asks for one).
 */
export function braveUrlOf(query: string, kind: SearchKind, count: number = COUNT): string {
  return braveEndpointUrlOf(query, endpointOf(kind), count);
}

/** The address of a request to `endpoint` (see `braveUrlOf`). */
export function braveEndpointUrlOf(
  query: string,
  endpoint: BraveEndpoint,
  count: number = COUNT,
): string {
  const params = new URLSearchParams({ q: query, count: String(count) });
  if (endpoint === "context") {
    params.set("maximum_number_of_urls", String(count));
    params.set("maximum_number_of_tokens", String(MAX_CONTEXT_TOKENS));
  } else {
    params.set("text_decorations", "false");
  }
  params.set("safesearch", "moderate");
  return `${ENDPOINTS[endpoint]}?${params.toString()}`;
}

/** The entities a text from a page is likely to hold; any other is left as it is. */
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};
/** The longest entity read, `&` and `;` included: `&#x10FFFF;`. */
const MAX_ENTITY_CHARS = 10;

/** The character an entity's name stands for (`amp`, `#39`, `#x27`), or null. */
function entityOf(name: string): string | null {
  if (name.startsWith("#")) {
    const hex = name[1] === "x" || name[1] === "X";
    const digits = name.slice(hex ? 2 : 1);
    if (digits === "") return null;
    for (const digit of digits.toLowerCase()) {
      const ok = (digit >= "0" && digit <= "9") || (hex && digit >= "a" && digit <= "f");
      if (!ok) return null;
    }
    const code = Number.parseInt(digits, hex ? 16 : 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return null;
    return String.fromCodePoint(code);
  }
  return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : null;
}

/** Whether the character after a `<` starts a tag: a letter, `/` or `!`. */
const startsTag = (char: string | undefined): boolean =>
  char !== undefined &&
  (char === "/" || char === "!" || (char >= "a" && char <= "z") || (char >= "A" && char <= "Z"));

/**
 * The text without HTML tags and with its entities read, in one pass: a tag runs from a `<` that
 * starts one to the next `>`, and is left as it is when no `>` follows (there is then none further
 * on, so no later `<` is looked at again). An entity is looked for within MAX_ENTITY_CHARS of its
 * `&`. Brave is asked for plain text; this only guards against a page that slipped markup in.
 */
export function plainTextOf(text: string): string {
  let out = "";
  let i = 0;
  let tagsClosed = true;
  while (i < text.length) {
    const char = text[i];
    if (char === "<" && tagsClosed && startsTag(text[i + 1])) {
      const end = text.indexOf(">", i + 1);
      if (end === -1) {
        tagsClosed = false;
      } else {
        out += " ";
        i = end + 1;
        continue;
      }
    }
    if (char === "&") {
      // Only the window of an entity is looked at, so that many `&` cost no more than the text.
      const end = text.slice(i + 1, i + MAX_ENTITY_CHARS).indexOf(";") + i + 1;
      if (end > i) {
        const decoded = entityOf(text.slice(i + 1, end));
        if (decoded !== null) {
          out += decoded;
          i = end + 1;
          continue;
        }
      }
    }
    out += char;
    i += 1;
  }
  return out;
}

/**
 * Third-party text as one line of plain text cut to `max` units: anything that is not a text is
 * empty. A text far longer than it may be is cut first, so the work does not grow with the body.
 */
function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const bounded = cutAtCodePoint(value, max * 4);
  return cutAtCodePoint(wordsOf(cleanText(plainTextOf(bounded))).join(" "), max).trimEnd();
}

/** A YYYY-MM-DD that is a day of the calendar (no 30 February), or null. */
function dayOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const day = value.slice(0, 10);
  for (let i = 0; i < 10; i += 1) {
    const char = day[i];
    const ok = i === 4 || i === 7 ? char === "-" : char >= "0" && char <= "9";
    if (!ok) return null;
  }
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  const same =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === date;
  return same ? day : null;
}

/** The address of an entry when it passes the policy of a public address, or null. */
function publicUrlOf(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    return parsePublicUrl(value);
  } catch {
    return null;
  }
}

/** A host name as a source: one line, or the host of the address when Brave gave none. */
const sourceOf = (hostname: unknown, url: URL): string => oneLine(hostname, 255) || url.hostname;

/** One result of either endpoint, before the list is de-duplicated and cut. */
interface Candidate {
  url: URL;
  title: unknown;
  snippet: string;
  publishedAt: string | null;
  source: string;
}

/** The results of an LLM Context answer. Throws a SearchEngineError for one of another shape. */
function webCandidatesOf(body: unknown): Candidate[] {
  if (!isRecord(body) || !isRecord(body.grounding)) throw new SearchEngineError();
  const generic = body.grounding.generic;
  if (generic === undefined) return [];
  if (!Array.isArray(generic)) throw new SearchEngineError();
  const sources = isRecord(body.sources) ? body.sources : {};
  const candidates: Candidate[] = [];
  for (const entry of generic.slice(0, MAX_ENTRIES_READ)) {
    if (!isRecord(entry)) continue;
    const url = publicUrlOf(entry.url);
    if (url === null) continue;
    const known =
      typeof entry.url === "string" && Object.prototype.hasOwnProperty.call(sources, entry.url);
    const source = known ? sources[entry.url as string] : undefined;
    const meta = isRecord(source) ? source : {};
    const passages = Array.isArray(entry.snippets) ? entry.snippets.slice(0, MAX_ENTRIES_READ) : [];
    // Each passage is plain text already: the joined text is only cut, not read again.
    const snippet = cutAtCodePoint(
      passages
        .map((passage) => oneLine(passage, MAX_SNIPPET_CHARS))
        .filter((passage) => passage !== "")
        .join(PASSAGE_JOINER),
      MAX_SNIPPET_CHARS,
    ).trimEnd();
    candidates.push({
      url,
      title: entry.title,
      snippet,
      publishedAt: Array.isArray(meta.age) ? dayOf(meta.age[1]) : null,
      source: sourceOf(meta.hostname, url),
    });
  }
  return candidates;
}

/**
 * The results of a news answer (`results`), or of a web search answer (`web.results`, absent when
 * nothing was found). Throws a SearchEngineError for one of another shape.
 */
function listCandidatesOf(body: unknown, endpoint: "webSearch" | "news"): Candidate[] {
  if (!isRecord(body)) throw new SearchEngineError();
  let results: unknown;
  if (endpoint === "news") {
    results = body.results;
  } else {
    if (body.web !== undefined && !isRecord(body.web)) throw new SearchEngineError();
    results = isRecord(body.web) ? body.web.results : undefined;
  }
  if (results === undefined) return [];
  if (!Array.isArray(results)) throw new SearchEngineError();
  const candidates: Candidate[] = [];
  for (const entry of results.slice(0, MAX_ENTRIES_READ)) {
    if (!isRecord(entry)) continue;
    const url = publicUrlOf(entry.url);
    if (url === null) continue;
    const meta = isRecord(entry.meta_url) ? entry.meta_url : {};
    candidates.push({
      url,
      title: entry.title,
      snippet: oneLine(entry.description, MAX_SNIPPET_CHARS),
      publishedAt: dayOf(entry.page_age),
      source: sourceOf(meta.hostname, url),
    });
  }
  return candidates;
}

/**
 * The results of an answer of the endpoint of `kind`: each address once, at most MAX_RESULTS, a
 * result with no title named after its source.
 */
export function parseBraveBody(body: unknown, kind: SearchKind | BraveEndpoint): SearchResult[] {
  // A kind reads the answer of the endpoint it asks first.
  const endpoint: BraveEndpoint = kind === "web" ? "context" : kind;
  const candidates =
    endpoint === "context" ? webCandidatesOf(body) : listCandidatesOf(body, endpoint);
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (results.length >= MAX_RESULTS) break;
    const url = candidate.url.href;
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({
      title: oneLine(candidate.title, MAX_SNIPPET_CHARS) || candidate.source,
      url,
      snippet: candidate.snippet,
      publishedAt: candidate.publishedAt,
      source: candidate.source,
      // Brave's terms allow its output to be used during the run, never kept (see webSearch.ts).
      transient: true,
    });
  }
  return results;
}

/**
 * The body of an answer as text, reading at most `maxBytes`; null for a larger one, whose stream is
 * cancelled. Shared with the key check (vendorResearch/braveKeyCheck.ts).
 */
export async function readCappedBody(response: Response, maxBytes: number): Promise<string | null> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The `error.code` of a Brave error answer, or null when the body is not one. */
export function braveErrorCodeOf(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const code = isRecord(parsed) && isRecord(parsed.error) ? parsed.error.code : undefined;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

/** The wait after a 429: the first entry of `X-RateLimit-Reset`, in seconds, at most 2 seconds. */
export function rateLimitWaitMsOf(header: string | null): number {
  const first = header === null ? "" : header.split(",", 1)[0].trim();
  const seconds = first === "" ? Number.NaN : Number(first);
  if (!Number.isFinite(seconds) || seconds < 0) return BRAVE_MAX_RATE_LIMIT_WAIT_MS;
  return Math.min(seconds * 1000, BRAVE_MAX_RATE_LIMIT_WAIT_MS);
}

/**
 * Whether a `X-RateLimit-Remaining` header shows a quota that is used up: 0 in any entry after the
 * first. The first entry is the per-second window, which a wait clears; the others are the longer
 * windows (the month), which no wait within a run does.
 */
export function quotaExhaustedOf(header: string | null): boolean {
  if (header === null) return false;
  return header
    .split(",")
    .slice(1)
    .some((entry) => {
      const trimmed = entry.trim();
      return trimmed !== "" && Number(trimmed) === 0;
    });
}

/** A 400 OPTION_NOT_IN_PLAN: the key's plan does not hold the endpoint. */
class NotInPlan extends Error {
  constructor() {
    super("Not in plan");
    this.name = "NotInPlan";
  }
}

/** A 429: the request may be asked once more after the wait. */
class RateLimited extends Error {
  constructor(readonly waitMs: number) {
    super("Rate limited");
    this.name = "RateLimited";
  }
}

/** The most keys whose queue is kept; past it, the queue made first is dropped. */
const MAX_SHARED_QUEUES = 1_000;
/**
 * The queue of each key, by the key. The map stays in this process and is never logged or sent; the
 * engines built with a key hold it in memory the same way.
 */
const sharedQueues = new Map<string, SearchQueue>();

/**
 * The queue of the requests made with `apiKey` in this process (one every BRAVE_MIN_GAP_MS), made on
 * first use. Every engine built with the same key gets the same queue, so runs that search at the
 * same time stay within the key's rate together.
 */
export function braveQueueFor(apiKey: string): SearchQueue {
  const known = sharedQueues.get(apiKey);
  if (known) return known;
  if (sharedQueues.size >= MAX_SHARED_QUEUES) {
    const oldest = sharedQueues.keys().next().value;
    if (oldest !== undefined) sharedQueues.delete(oldest);
  }
  const queue = createSearchQueue({ minGapMs: BRAVE_MIN_GAP_MS });
  sharedQueues.set(apiKey, queue);
  return queue;
}

export interface BraveEngineDeps {
  /** The organization's Brave Search API key. It is sent in a header and nowhere else. */
  apiKey: string;
  /** Replaces `safeFetch`, for tests. */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Replaces the queue of the key (`braveQueueFor`, one request every BRAVE_MIN_GAP_MS), for tests. */
  queue?: SearchQueue;
  /** Replaces the wait after a 429, for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Replaces the time limit of a request (BRAVE_REQUEST_TIMEOUT_MS), for tests. */
  timeoutMs?: number;
}

/**
 * The search engine on Brave Search, with an organization's key: kind `web` on the LLM Context
 * endpoint, kind `news` on the news endpoint (see the module comment). The engine uses the queue of
 * its key, shared by every engine of that key, so the requests of all the runs are spaced for the
 * key's rate. It keeps nothing between searches.
 */
export function createBraveEngine(deps: BraveEngineDeps): SearchEngine {
  const { apiKey } = deps;
  const fetchImpl = deps.fetchImpl ?? safeFetch;
  const queue = deps.queue ?? braveQueueFor(apiKey);
  const sleep = deps.sleep ?? sleepUnlessAborted;
  const timeoutMs = deps.timeoutMs ?? BRAVE_REQUEST_TIMEOUT_MS;

  /** One request, within the time limit and the caller's signal, and its answer read. */
  const request = async (
    url: string,
    endpoint: BraveEndpoint,
    signal: AbortSignal | undefined,
  ): Promise<SearchResult[]> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
        signal: controller.signal,
      });
      const text = await readCappedBody(response, BRAVE_MAX_BODY_BYTES);
      if (text === null) throw new SearchEngineError();
      const errorCode = braveErrorCodeOf(text);
      if (errorCode === BRAVE_INVALID_TOKEN_CODE) throw new SearchUnavailableError();
      if (response.status === 400 && errorCode === BRAVE_NOT_IN_PLAN_CODE) throw new NotInPlan();
      if (response.status === 401 || response.status === 402 || response.status === 403) {
        throw new SearchUnavailableError();
      }
      if (response.status === 429) {
        if (quotaExhaustedOf(response.headers.get("x-ratelimit-remaining"))) {
          throw new SearchUnavailableError();
        }
        throw new RateLimited(rateLimitWaitMsOf(response.headers.get("x-ratelimit-reset")));
      }
      if (response.status !== 200) throw new SearchEngineError();
      // An abort that came while the body was read is no answer.
      if (controller.signal.aborted) throw new SearchEngineError();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new SearchEngineError();
      }
      return parseBraveBody(body, endpoint);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };

  /** One search on `endpoint`, a 429 waited out once. */
  const ask = async (
    query: string,
    endpoint: BraveEndpoint,
    signal: AbortSignal | undefined,
  ): Promise<SearchResult[]> => {
    const q = queryFor(query, ENDPOINT_QUERY_LIMITS[endpoint]);
    if (q === "") throw new SearchEngineError();
    const url = braveEndpointUrlOf(q, endpoint);
    try {
      return await queue(() => request(url, endpoint, signal), signal);
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error;
      await sleep(error.waitMs, signal);
      try {
        return await queue(() => request(url, endpoint, signal), signal);
      } catch (again) {
        // A key still over its rate after the wait will not answer the rest of the run either.
        if (again instanceof RateLimited) throw new SearchUnavailableError();
        throw again;
      }
    }
  };

  /** False once LLM Context answered that the key's plan does not hold it. */
  let contextInPlan = true;

  return {
    id: "brave",
    kinds: ["web", "news"],
    newsWindowMonths: null,
    async search(query, kind, signal) {
      try {
        if ((kind !== "web" && kind !== "news") || signal?.aborted) throw new SearchEngineError();
        const first: BraveEndpoint =
          kind === "web" && !contextInPlan ? "webSearch" : endpointOf(kind);
        try {
          return await ask(query, first, signal);
        } catch (error) {
          if (!(error instanceof NotInPlan)) throw error;
          // A plan without LLM Context: the web is searched on web search from now on.
          if (first !== "context") throw new SearchUnavailableError();
          contextInPlan = false;
          try {
            return await ask(query, "webSearch", signal);
          } catch (again) {
            // A plan that holds neither web endpoint will not answer the rest of the run either.
            if (again instanceof NotInPlan) throw new SearchUnavailableError();
            throw again;
          }
        }
      } catch (error) {
        // A refused or spent key stays one, so that `withFallback` moves on; everything else is the fixed
        // error, with nothing of the key, the query or the answer in it.
        if (error instanceof SearchUnavailableError) throw new SearchUnavailableError();
        throw new SearchEngineError();
      }
    },
  };
}
