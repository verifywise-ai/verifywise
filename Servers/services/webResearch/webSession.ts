/**
 * The web session of one research run: what the research loop may still do on the web, and what
 * it has found there.
 *
 * It holds the budgets (searches and page reads), the provenance rule (a page may be read only when
 * a search of this run returned its URL, or when it is on the vendor's domain or a subdomain of
 * it), the lookback window of each category and the ledger: one entry per URL, first the snippet of
 * a search result, replaced in its place by the excerpt when the page is read. Every call that
 * reached the web is recorded with its category, so that the summary can tell "looked and found
 * nothing" from "could not look". A call that the rules refuse before it reaches the web uses no
 * budget and is not recorded.
 *
 * The checks of a call all run before its first `await`, so two calls made at once cannot both
 * take the last unit of a budget.
 */
import { PageLink, relevantLinks, selectExcerpt } from "./pageText";
import { UnsafeUrlError, isOnDomain, parsePublicUrl } from "./publicUrl";
import { FetchedPage, PageReadError, PageReader, ReadFailureReason } from "./readPage";
import { SearchEngine, SearchEngineError, SearchKind, SearchResult } from "./webSearch";

export interface SessionLimits {
  maxSearches: number;
  maxReads: number;
  maxResultsPerSearch: number;
}

export const SESSION_LIMITS: SessionLimits = {
  maxSearches: 8,
  maxReads: 12,
  maxResultsPerSearch: 10,
};

/** One source of the run: a search result's snippet, or the excerpt of a page that was read. */
export interface LedgerEntry<C extends string = string> {
  category: C;
  kind: "result" | "page";
  /**
   * True when the source is on the vendor's domain or a subdomain of it, as the session decided it
   * for the lookback: a page by the URL that answered after redirects, a result by its own URL. A
   * URL whose page answered off the vendor's site is never the vendor's, as a result either.
   */
  onVendorSite: boolean;
  url: string;
  title: string;
  content: string;
  publishedAt: string | null;
}

export type CallFailure = "search_unavailable" | Exclude<ReadFailureReason, "not_allowed">;

export interface CallRecord<C extends string = string> {
  category: C;
  tool: "search" | "read";
  /** True when the web gave something usable: a feed (even an empty one) or a page that was read. */
  answered: boolean;
  /** Why a call that reached the web failed; null when it was answered. */
  failure: CallFailure | null;
}

export type SearchOutcome =
  | { ok: true; results: SearchResult[]; omittedOld: number }
  | { ok: false; reason: "budget_exhausted" | "search_unavailable" };

/** A page as the loop shows it to the model. `url` is the address that was asked for. */
export interface PageView {
  url: string;
  title: string;
  publishedAt: string | null;
  excerpt: string;
  truncated: boolean;
  links: PageLink[];
}

export type ReadOutcome =
  | { ok: true; page: PageView }
  | {
      ok: false;
      reason:
        | "budget_exhausted"
        | "not_allowed"
        | "not_from_search"
        | "already_read"
        | Exclude<ReadFailureReason, "not_allowed">
        | "too_old";
      publishedAt?: string;
    };

export interface WebSession<C extends string> {
  search(
    query: string,
    kind: SearchKind,
    category: C,
    signal?: AbortSignal,
  ): Promise<SearchOutcome>;
  read(url: string, category: C, focus?: string, signal?: AbortSignal): Promise<ReadOutcome>;
  budget(): { searchesLeft: number; readsLeft: number };
  snapshot(): {
    ledger: LedgerEntry<C>[];
    calls: CallRecord<C>[];
    searchesUsed: number;
    pagesRead: number;
  };
}

export interface WebSessionOptions<C extends string> {
  engine: SearchEngine;
  readPage: PageReader;
  /**
   * The vendor's domain, or null. Its pages (and its subdomains') may be read without a search
   * result and are exempt from the lookback.
   */
  domain: string | null;
  /**
   * Per category, the earliest publication date a source may have, as YYYY-MM-DD in UTC; no entry
   * means no limit.
   */
  cutoffs: Partial<Record<C, string>>;
  limits?: Partial<SessionLimits>;
}

/** The URL as the policy allows it (without its fragment), or null when the policy refuses it. */
function allowedUrl(raw: string): URL | null {
  try {
    return parsePublicUrl(raw);
  } catch (error) {
    if (error instanceof UnsafeUrlError) return null;
    throw error;
  }
}

/** The host of a URL, or "" when it is not one. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * True when `publishedAt` lies before the start (UTC) of the day `cutoff`. A source without a date,
 * or with one that cannot be read, is never too old, and neither is any source without a cutoff.
 */
function isOlderThan(publishedAt: string | null, cutoff: string | undefined): boolean {
  if (publishedAt === null || cutoff === undefined) return false;
  return Date.parse(publishedAt) < Date.parse(`${cutoff}T00:00:00.000Z`);
}

/** The first of the dates that is older than the cutoff, or null when none is. */
function firstOlderThan(dates: Array<string | null>, cutoff: string | undefined): string | null {
  for (const date of dates) {
    if (date !== null && isOlderThan(date, cutoff)) return date;
  }
  return null;
}

export function createWebSession<C extends string>(options: WebSessionOptions<C>): WebSession<C> {
  const { engine, readPage, domain, cutoffs } = options;
  // Field by field, so that a limit given as undefined keeps its default.
  const limits: SessionLimits = {
    maxSearches: options.limits?.maxSearches ?? SESSION_LIMITS.maxSearches,
    maxReads: options.limits?.maxReads ?? SESSION_LIMITS.maxReads,
    maxResultsPerSearch: options.limits?.maxResultsPerSearch ?? SESSION_LIMITS.maxResultsPerSearch,
  };

  /** One entry per URL as parsePublicUrl gives it, in the order the URLs came in. */
  const ledger = new Map<string, LedgerEntry<C>>();
  /** The URLs that a search returned: the results that were kept or already in the ledger. */
  const returned = new Set<string>();
  /** The URLs whose read was answered, a page that was too old included: none is read again. */
  const answeredReads = new Set<string>();
  /**
   * The date that made a read too old, for each URL whose read was. A later search result for the
   * URL is held to this date, not to the result's own, so the page cannot come back into the ledger
   * as a snippet.
   */
  const tooOldPages = new Map<string, string>();
  const calls: CallRecord<C>[] = [];
  let searchesUsed = 0;
  let readsUsed = 0;

  const isOwnHost = (host: string): boolean => domain !== null && isOnDomain(host, domain);

  return {
    async search(query, kind, category, signal) {
      if (searchesUsed >= limits.maxSearches) return { ok: false, reason: "budget_exhausted" };
      searchesUsed += 1;

      let answer: SearchResult[];
      try {
        answer = await engine.search(query, kind, signal);
      } catch (error) {
        // A failed search is an answer of the web. Anything else is a bug, and is passed on.
        if (!(error instanceof SearchEngineError)) throw error;
        calls.push({ category, tool: "search", answered: false, failure: "search_unavailable" });
        return { ok: false, reason: "search_unavailable" };
      }
      calls.push({ category, tool: "search", answered: true, failure: null });

      const cutoff = cutoffs[category];
      const results: SearchResult[] = [];
      let omittedOld = 0;
      for (const result of answer) {
        if (results.length >= limits.maxResultsPerSearch) break;
        const url = allowedUrl(result.url);
        if (url === null) continue;
        const key = url.href;
        if (ledger.has(key)) {
          returned.add(key);
          continue;
        }
        const pageDate = tooOldPages.get(key);
        // A page that was too old answered off the vendor's site, since its own pages are exempt.
        const exempt = pageDate === undefined && isOwnHost(url.hostname);
        if (!exempt && isOlderThan(pageDate ?? result.publishedAt, cutoff)) {
          omittedOld += 1;
          continue;
        }
        returned.add(key);
        ledger.set(key, {
          category,
          kind: "result",
          onVendorSite: exempt,
          url: key,
          title: result.title,
          content: result.snippet,
          publishedAt: result.publishedAt,
        });
        results.push({ ...result, url: key });
      }
      return { ok: true, results, omittedOld };
    },

    async read(rawUrl, category, focus, signal) {
      const url = allowedUrl(rawUrl);
      if (url === null) return { ok: false, reason: "not_allowed" };
      const key = url.href;
      if (!returned.has(key) && !isOwnHost(url.hostname)) {
        return { ok: false, reason: "not_from_search" };
      }
      if (answeredReads.has(key)) return { ok: false, reason: "already_read" };
      if (readsUsed >= limits.maxReads) return { ok: false, reason: "budget_exhausted" };
      readsUsed += 1;

      let page: FetchedPage;
      try {
        page = await readPage(key, signal);
      } catch (error) {
        // A failed read is an answer of the web. Anything else is a bug, and is passed on.
        if (!(error instanceof PageReadError)) throw error;
        const { reason } = error;
        // A redirect to an address that is not public: refused like the URL itself would be.
        if (reason === "not_allowed") return { ok: false, reason };
        calls.push({ category, tool: "read", answered: false, failure: reason });
        return { ok: false, reason };
      }
      answeredReads.add(key);
      calls.push({ category, tool: "read", answered: true, failure: null });

      // Decided on the URL that answered: a page that redirected off the vendor's site is not one
      // of its own.
      const ownPage = isOwnHost(hostOf(page.url));
      const earlier = ledger.get(key);
      // The page's own date when it has one. Only a page without a date is held to the date that
      // its entry keeps from the search result, which was checked against the window of the
      // category it was searched under and may be older than the page.
      const dates = [page.publishedAt ?? earlier?.publishedAt ?? null];
      const tooOld = ownPage ? null : firstOlderThan(dates, cutoffs[category]);
      if (tooOld !== null) {
        // The source is outside the window, so it must not reach the analysis under this category.
        // A snippet kept under another category stays there while it is within that one's window,
        // no longer marked as the vendor's: its page answered off the vendor's site.
        if (earlier && firstOlderThan(dates, cutoffs[earlier.category]) !== null) {
          ledger.delete(key);
        } else if (earlier) {
          ledger.set(key, { ...earlier, onVendorSite: false });
        }
        tooOldPages.set(key, tooOld);
        return { ok: false, reason: "too_old", publishedAt: tooOld };
      }

      const { excerpt, truncated } = selectExcerpt(page.text, { focus });
      ledger.set(
        key,
        earlier
          ? { ...earlier, category, kind: "page", onVendorSite: ownPage, content: excerpt }
          : {
              category,
              kind: "page",
              onVendorSite: ownPage,
              url: key,
              title: page.title,
              content: excerpt,
              publishedAt: page.publishedAt,
            },
      );
      const links = ownPage && domain !== null ? relevantLinks(page.links, domain, page.url) : [];
      return {
        ok: true,
        page: {
          url: key,
          title: page.title,
          publishedAt: page.publishedAt,
          excerpt,
          truncated,
          links,
        },
      };
    },

    budget() {
      return {
        searchesLeft: limits.maxSearches - searchesUsed,
        readsLeft: limits.maxReads - readsUsed,
      };
    },

    snapshot() {
      return {
        ledger: [...ledger.values()].map((entry) => ({ ...entry })),
        calls: calls.map((call) => ({ ...call })),
        searchesUsed,
        pagesRead: calls.filter((call) => call.tool === "read" && call.answered).length,
      };
    },
  };
}
