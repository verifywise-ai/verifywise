/**
 * What the research pipeline needs from a web-search backend: the hit and option shapes, the
 * provider interface and the error every provider throws. searchProvider.ts re-exports all of it.
 *
 * The server only reads the snippets a search returns. It never fetches the pages they point to,
 * so there is no outbound request to a URL a third party chose.
 */

export interface SearchHit {
  url: string;
  title: string;
  /** A snippet of the page, at most 1,500 characters. */
  content: string;
  /** The publication date as the provider reports it, or null when it reports none. */
  publishedAt: string | null;
}

export interface SearchOptions {
  maxResults: number;
  topic?: "general" | "news";
  /** Earliest publication date to return, as YYYY-MM-DD. */
  startDate?: string;
  /** Limits the search to these domains; without a list the whole web is searched. */
  includeDomains?: string[];
  /**
   * With includeDomains: "restrict" returns only those domains; "prefer" also searches the rest
   * of the web, so other domains can still appear.
   */
  domainsMode?: "restrict" | "prefer";
  /** Give up after this many milliseconds. Defaults to 15 seconds. */
  timeoutMs?: number;
}

export interface SearchProvider {
  readonly name: string;
  /** Rejects with SearchProviderError when the search fails for any reason, a timeout included. */
  search(query: string, options: SearchOptions): Promise<SearchHit[]>;
}

/**
 * Every way a search can fail. The message is safe to log and to show: it holds an HTTP status or
 * a fixed phrase, never the API key and never any part of the provider's answer.
 */
export class SearchProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchProviderError";
  }
}
