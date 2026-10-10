/**
 * Tavily implementation of SearchProvider: one POST to https://api.tavily.com/search per search,
 * answered with snippets (never the full page), and the publication date when Tavily has one.
 *
 * Whatever goes wrong leaves this file as a SearchProviderError that holds an HTTP status or a
 * fixed phrase. The error fetch throws and the body Tavily answers with are never passed on,
 * because either can quote the request, and the request carries the API key.
 */
import { SearchHit, SearchOptions, SearchProvider, SearchProviderError } from "./searchTypes";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_SNIPPET_CHARS = 1_500;

const TIMED_OUT = "search timed out";
const REQUEST_FAILED = "search request failed";
const UNREADABLE_RESPONSE = "search response could not be read";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildRequestBody(query: string, options: SearchOptions): JsonObject {
  const body: JsonObject = {
    query,
    search_depth: "basic",
    max_results: options.maxResults,
    include_raw_content: false,
    include_published_date: true,
  };
  if (options.topic !== undefined) body.topic = options.topic;
  if (options.startDate !== undefined) body.start_date = options.startDate;
  // Tavily answers 400 to include_domains_mode without a domain list, so the two travel together.
  if (options.includeDomains !== undefined && options.includeDomains.length > 0) {
    body.include_domains = options.includeDomains;
    if (options.domainsMode !== undefined) body.include_domains_mode = options.domainsMode;
  }
  return body;
}

/**
 * True when the search ran out of time: the timeout signal fired, or the error says it was
 * aborted. The signal is checked first because a fetch that is aborted while it reads the
 * response can fail with an unrelated-looking error such as TypeError("terminated").
 */
function ranOutOfTime(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * http and https only. The URL parser applies the browser's rules, so "java\nscript:" is caught.
 */
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Cuts to `max` UTF-16 units. When the cut would leave the first half of a surrogate pair at the
 * end, that half goes too: Postgres refuses a lone surrogate in the stored evidence.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const lastKept = text.charCodeAt(max - 1);
  const endsInsidePair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, endsInsidePair ? max - 1 : max);
}

function toHit(result: unknown): SearchHit | null {
  if (!isObject(result)) return null;
  const { url, title, content, published_date: publishedDate } = result;
  if (typeof url !== "string" || !isWebUrl(url)) return null;
  return {
    url,
    title: typeof title === "string" ? title : "",
    content: typeof content === "string" ? truncate(content, MAX_SNIPPET_CHARS) : "",
    publishedAt: typeof publishedDate === "string" && publishedDate !== "" ? publishedDate : null,
  };
}

function toHits(payload: unknown): SearchHit[] {
  const results = isObject(payload) ? payload.results : undefined;
  if (!Array.isArray(results)) throw new SearchProviderError(UNREADABLE_RESPONSE);

  const hits: SearchHit[] = [];
  for (const result of results) {
    const hit = toHit(result);
    if (hit !== null) hits.push(hit);
  }
  return hits;
}

/** `fetchImpl` exists so tests can stand in for the network. */
export function createTavilyProvider(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): SearchProvider {
  return {
    name: "tavily",

    async search(query: string, options: SearchOptions): Promise<SearchHit[]> {
      const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetchImpl(TAVILY_SEARCH_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildRequestBody(query, options)),
          signal,
        });
      } catch (error) {
        throw new SearchProviderError(ranOutOfTime(error, signal) ? TIMED_OUT : REQUEST_FAILED);
      }

      if (!response.ok) {
        throw new SearchProviderError(`Tavily search failed with status ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new SearchProviderError(
          ranOutOfTime(error, signal) ? TIMED_OUT : UNREADABLE_RESPONSE,
        );
      }
      return toHits(payload);
    },
  };
}
