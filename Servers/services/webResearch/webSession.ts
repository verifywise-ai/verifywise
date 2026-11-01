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
 * budget and is not recorded. A call that fails once its signal has aborted (the loop's time
 * limit) keeps its budget unit but is not recorded either: our own clock cut it off, not the web,
 * so the summary says that the category was not reached.
 *
 * A query that is the same as one the engine has answered (the same words in any order, case and
 * plural, with at most a fifth of them added or changed) is refused without using budget.
 *
 * A search of a kind that the engine does not answer (`SearchEngine.kinds`: the news of the GDELT
 * Project cannot search the web) is refused as `kind_unavailable` before it reaches the engine. It
 * is judged after the budget and before the repeat of a query, by the kinds the engine has when
 * the search is made, because an engine that falls back to another changes them (see
 * providerSearch.ts). Like every call that the rules turn away before the web it uses no budget and
 * is not recorded, so it is not work on a category and the summary of a run does not count it. What
 * the model is told is `KIND_REFUSALS`, a fixed phrase. `defaultKind` is the kind of a search whose
 * asker named none: the web, as it always was, unless the engine does not answer it. An engine that
 * declares no kinds is taken to answer all of them.
 *
 * A result that is not about what is being researched (the caller's `isRelevant`) never enters the
 * ledger and cannot be read, so the evidence is not filled with the answers of an engine that does
 * not know the name.
 *
 * A result of the web feed has no date: the feed gives the day it crawled the page, so the date
 * only serves the lookback as an upper bound (a page is not newer than its crawl) and is never
 * kept or shown. A result of the news feed keeps the date of its article.
 *
 * One page is one entry. Every address goes through `resolveAddress` (urlCanon.ts), so the
 * spellings of an address that differ in tracking parameters are one key, and an address that
 * ends in a quotation mark is refused. A page that claims another address for itself (a
 * `rel=canonical` on the same site) is kept under that one. A page whose text is the text of one
 * already read, for the same category, is not a second source: the read is given back (at most
 * three times a run), and a search result that repeats the title and the snippet of one the run
 * has, for the same category, is left out. Everything that is left out is counted for the model
 * and for the trace.
 *
 * A domain the caller found to be the vendor's website too (`aliasDomains`: the recorded domain
 * redirects to it and its home page names the vendor) has the standing of the vendor's own domain:
 * its pages and its subdomains' can be read without a search, are marked as the vendor's own, are
 * exempt from the lookback and are not asked about relevance.
 *
 * A read that failed (the page was not found, the site refused us, nothing answered) gives its unit
 * back, at most six times a run: it added nothing to the evidence, and the trace of real runs showed
 * sites that refuse most of their pages using up the whole budget on failures. A page that failed
 * for a reason that does not pass (everything but "nothing answered") is not tried again. A read
 * that fails because the run's own clock cut it off keeps its unit and is not remembered.
 *
 * A host the caller knows is closed (`closedHosts`: its home page did not answer before the run)
 * is not read at all: a read of one of its pages is refused as `site_closed`, without budget and
 * without a record, like any other call that the rules turn away before the web. Only the hosts
 * named are closed, not their subdomains.
 *
 * The checks of a call all run before its first `await`, so two calls made at once cannot both
 * take the last unit of a budget.
 *
 * `readMany` runs several reads at once, which is how a step of the research loop with several
 * reads, and the code that reads pages before the loop, go to the web. The reads are checked one
 * after the other in the order they were asked for (so the budget goes to the first, and an address
 * asked for twice is read once), then fetched at the same time, at most two at once from one host,
 * and only then settled, again in the order they were asked for: the ledger, the refunds and the
 * rule about pages with the same text come out the same whichever page answered first. A page that
 * is being fetched cannot be asked for again by another call. `searchMany` does the same for
 * searches (at most two at once; a query that repeats an earlier one of the same call, or one that
 * another call is asking, is refused as a repeat).
 */
import { createHash } from "crypto";
import {
  EXCERPT_GAP,
  MAX_EXTRA_PARTS,
  PageLink,
  pageParts,
  relevantLinks,
  selectExcerpt,
} from "./pageText";
import { isOnDomain } from "./publicUrl";
import { FetchedPage, PageReadError, PageReader, ReadFailureReason } from "./readPage";
import { REPEATED_QUERY_JACCARD, queryWords, similarity } from "./queryMatch";
import { acceptCanonical, crossSiteCanonical, resolveAddress } from "./urlCanon";
import type { VrdbRecordMeta } from "../vendorResearch/vrdb/types";
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
  /**
   * The database a record came from, as the caller of `addRecords` named it; absent for every
   * other source. It says where the source came from and nothing else: the evidence shown to the
   * model does not carry it.
   */
  record?: string;
  /**
   * The address on another site that a page that was read claims as its own (see
   * `crossSiteCanonical`): a copy names the story's first publisher this way. It is kept, not
   * followed, for the provenance of the source only; absent when the page claims none, or when its
   * claim is on its own site.
   */
  canonicalUrl?: string;
  /**
   * What the vendor risk database knows of a record it offered (see vendorResearch/vrdb): which
   * record, how it matched the vendor, and how old the copy was. Absent for every other source.
   */
  vrdb?: VrdbRecordMeta;
  /**
   * The address that answered, when a page answered from another address than its own (a
   * redirect): the source is classified by it, as the vendor's site is decided by it.
   */
  answeredUrl?: string;
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

/** Why a result of the engine did not reach the model; a reason is present only when it applied. */
export type OmittedReason = "old" | "duplicate" | "bad_address" | "off_topic";

export type SearchOutcome =
  | {
      ok: true;
      results: SearchResult[];
      omitted: Partial<Record<OmittedReason, number>>;
      /** The query the engine was given, when it is not the one that was asked for. */
      query?: string;
    }
  | { ok: false; reason: "budget_exhausted" | "repeated_query" | "search_unavailable" }
  | {
      ok: false;
      /** The engine does not answer searches of this kind (see `SearchEngine.kinds`). */
      reason: "kind_unavailable";
      /** The kind that was asked for; the model is told `KIND_REFUSALS[kind]`. */
      kind: SearchKind;
    };

/**
 * What the model is told when a search is refused as `kind_unavailable`: a fixed phrase for each
 * kind that points to the kind and the pages that are left. It repeats nothing of the query.
 */
export const KIND_REFUSALS: Readonly<Record<SearchKind, string>> = {
  web: "Web search is not available in this run; search the news or read the vendor's pages",
  news: "News search is not available in this run; search the web or read the vendor's pages",
};

/** A page as the loop shows it to the model. `url` is the address that was asked for. */
export interface PageView {
  url: string;
  title: string;
  publishedAt: string | null;
  excerpt: string;
  /** True when part of the page is not shown: the rest of it is in other parts. */
  truncated: boolean;
  links: PageLink[];
  /** The number of parts a long page has (see pageParts); absent for a page that fits in one. */
  parts?: number;
  /** For the view of a part that was asked for (`ReadRequest.part`): which one it is. */
  part?: number;
}

export type ReadOutcome =
  | { ok: true; page: PageView }
  | {
      ok: false;
      reason:
        | "budget_exhausted"
        | "not_allowed"
        | "bad_address"
        | "not_from_search"
        | "already_read"
        | "same_text"
        | "already_failed"
        | "site_closed"
        | Exclude<ReadFailureReason, "not_allowed">
        | "too_old"
        | "no_such_part"
        | "parts_limit";
      /** For `too_old`: the date that made it so. */
      publishedAt?: string;
      /** For `same_text`: the address of the page whose text this one repeats. */
      sameAs?: string;
      /** For `no_such_part`: how many parts the page has. */
      parts?: number;
    };

/** One read of `readMany`. */
export interface ReadRequest<C extends string> {
  url: string;
  category: C;
  focus?: string;
  /**
   * The part of a long page to show (from 1, see pageParts). It is taken from the page the run
   * already read, with no request and no unit of the budget; for a page that was not read yet it is
   * ignored and the page is read as usual, which tells how many parts it has.
   */
  part?: number;
  by?: CallPayer;
}

/**
 * Whose budget a call is paid from: the model's (the default) or the code's, which the caller sets
 * aside with `setCodeBudget`. The code's calls never touch the model's share, and a failed read of
 * the code gives nothing back (the model's refunds are the model's).
 */
export type CallPayer = "model" | "code";

/** A record of a public database, as a source. */
export interface SessionRecord {
  url: string;
  title: string;
  /** The record as plain text; it becomes the content of the source. */
  text: string;
  /** The day it was published or added, YYYY-MM-DD. */
  publishedAt: string;
  /** What the vendor risk database knows of a record it offered; kept on the entry. */
  vrdb?: VrdbRecordMeta;
}

/** One search of `searchMany`. */
export interface SearchRequest<C extends string> {
  query: string;
  kind: SearchKind;
  category: C;
  by?: CallPayer;
}

/** What came of one search of `searchMany`, and how long the call waited for it. */
export interface SearchResponse {
  outcome: SearchOutcome;
  /** From the start of the call to the answer; 0 for a search that the rules turned away. */
  ms: number;
}

/** What came of one read of `readMany`, and how long the call waited for it. */
export interface ReadResult {
  outcome: ReadOutcome;
  /** From the start of the call to the answer; 0 for a read that the rules turned away. */
  ms: number;
}

export interface WebSession<C extends string> {
  search(
    query: string,
    kind: SearchKind,
    category: C,
    signal?: AbortSignal,
  ): Promise<SearchOutcome>;
  /**
   * The kind of a search whose asker named none: the web, as it always was, unless the engine of
   * the run does not answer it, and then the news. Read it when the search is made: an engine that
   * falls back to another changes the kinds it answers.
   */
  defaultKind(): SearchKind;
  read(url: string, category: C, focus?: string, signal?: AbortSignal): Promise<ReadOutcome>;
  /** The reads of `requests` at once; one result for each, in the order of the requests. */
  readMany(requests: readonly ReadRequest<C>[], signal?: AbortSignal): Promise<ReadResult[]>;
  /** The searches of `requests` at once; one response for each, in the order of the requests. */
  searchMany(
    requests: readonly SearchRequest<C>[],
    signal?: AbortSignal,
  ): Promise<SearchResponse[]>;
  /**
   * Puts the records of a public database into the ledger as sources that were read (see
   * vendorResearch/records): the text of a record is the content of its source, and a read of its
   * address is refused, since the record was read. It costs nothing of any budget and makes no call.
   * Nobody asks whether the record is about the vendor, because the caller matched it by the name
   * the database uses; the lookback of the category applies, and an address that the ledger has is
   * left out. What was left out is counted. `record` names the database, and every entry it adds
   * keeps that name (`LedgerEntry.record`).
   */
  addRecords(
    records: readonly SessionRecord[],
    category: C,
    record?: string,
  ): { added: number; omitted: Partial<Record<OmittedReason, number>> };
  /**
   * Sets aside what the code may search and read besides the model (see vendorResearch/gather.ts),
   * for the calls made `by: "code"`. It adds to what was set aside before. Only whole numbers of at
   * least one count. The model's budget, `budget()`, is not touched.
   */
  setCodeBudget(grant: { searches?: number; reads?: number }): void;
  /**
   * A view of this session for one of several loops that run at once: the same ledger, provenance,
   * rules and records, but a budget of its own (`grant`) and refunds of its own, so that one loop
   * cannot use up what another needs. Its `budget()` is its own, and `snapshot()` is the whole
   * session's. A pool gets half its reads (rounded up) back for pages that failed, and one read
   * back for a page whose text its category already had.
   */
  pool(grant: { searches: number; reads: number }): WebSession<C>;
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
  /**
   * Whether a search result is about what is being researched. A result it refuses never enters
   * the ledger and cannot be read; a result on the vendor's own domain is not asked about. Without
   * it every result is let in.
   */
  isRelevant?: (result: { title: string; snippet: string; url: string }) => boolean;
  /**
   * The query the engine is given for the query that was asked for: the caller's rules for what a
   * query is (see vendorResearch/queries.ts). Repeats are judged on the normalized query. Without
   * it the engine is given the query as it was asked.
   */
  normalizeQuery?: (query: string, kind: SearchKind) => string;
  /**
   * Hostnames whose pages are not read: the caller found out before the run that the site does not
   * answer or refuses us. A read of a page on one is refused as `site_closed`, without budget.
   */
  closedHosts?: readonly string[];
  /**
   * Other domains that are the vendor's website: they are treated as `domain` is (its pages and
   * those of its subdomains can be read without a search and are the vendor's own).
   */
  aliasDomains?: readonly string[];
}

/** The address a page answered from, spelled as the session keeps addresses; null for none. */
function answeredAddress(url: string): string | null {
  try {
    const address = resolveAddress(url);
    return address.ok ? address.url.href : null;
  } catch {
    return null;
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

/** Every kind of search: what an engine that declares none is taken to answer. */
const ALL_KINDS: readonly SearchKind[] = ["web", "news"];

/** A page of fewer characters than this is not compared with another: two error pages are two answers. */
const MIN_COMPARED_PAGE_CHARS = 80;
/** A snippet of fewer characters than this is not compared with another. */
const MIN_COMPARED_SNIPPET_CHARS = 60;
/** The reads a run gets back for pages whose text it already had. */
const MAX_REFUNDED_READS = 3;
/** The reads a run gets back for pages that failed. */
const MAX_REFUNDED_FAILURES = 6;

const normalized = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();
const digest = (text: string): string => createHash("sha1").update(text).digest("hex");

/** What identifies the text of a page, whatever its case and spacing; null for a short text. */
function pageFingerprint(text: string): string | null {
  const comparable = normalized(text);
  return comparable.length < MIN_COMPARED_PAGE_CHARS ? null : digest(comparable);
}

/** What identifies a search result by its title and snippet together; null for a short snippet. */
function resultFingerprint(result: SearchResult): string | null {
  const snippet = normalized(result.snippet);
  if (snippet.length < MIN_COMPARED_SNIPPET_CHARS) return null;
  return digest(`${normalized(result.title)}\n${snippet}`);
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

/** The reads from one host that run at once: a site is not asked for more pages than this together. */
const MAX_READS_PER_HOST = 2;
/** The searches that run at once: the feed is one host. */
const MAX_SEARCHES_AT_ONCE = 2;

/**
 * Runs tasks with at most `limit` at once for each key. The others wait for their turn, in the
 * order they asked, and a finished task hands its place to the next one of its key.
 */
function createGate(limit: number) {
  const active = new Map<string, number>();
  const queues = new Map<string, Array<() => void>>();
  return async function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    if ((active.get(key) ?? 0) >= limit) {
      await new Promise<void>((resume) => {
        const queue = queues.get(key) ?? [];
        queue.push(resume);
        queues.set(key, queue);
      });
      // The task that finished handed its place over, so the count of the key is unchanged.
    } else {
      active.set(key, (active.get(key) ?? 0) + 1);
    }
    try {
      return await task();
    } finally {
      const queue = queues.get(key);
      const next = queue?.shift();
      if (queue?.length === 0) queues.delete(key);
      if (next !== undefined) {
        next();
      } else {
        const left = (active.get(key) ?? 1) - 1;
        if (left <= 0) active.delete(key);
        else active.set(key, left);
      }
    }
  };
}

/** What the fetch of one read came to, before the session settles it. */
type Fetched =
  | { kind: "page"; page: FetchedPage; at: number }
  /** `aborted`: the signal had aborted by the time the read failed (our clock cut it off). */
  | { kind: "failed"; error: PageReadError; aborted: boolean; at: number }
  | { kind: "bug"; error: unknown; at: number };

/** What the fetch of one search came to, before the session settles it. */
type SearchFetched =
  | { kind: "answer"; results: SearchResult[]; at: number }
  | { kind: "failed"; aborted: boolean; at: number }
  | { kind: "bug"; error: unknown; at: number };

/** A search that passed the checks and has its unit of the budget. */
interface PreparedSearch<C extends string> {
  /** What was asked for, and what the engine is given (the normalized query). */
  query: string;
  searched: string;
  kind: SearchKind;
  category: C;
  words: Set<string>;
  /** The entry of the queries being asked now; removed when the call is done. */
  pending: { kind: SearchKind; words: Set<string> };
}

/** The parts of a long page that was read, and which of them were shown beside its first excerpt. */
interface HeldPage {
  /** The key of the page's entry in the ledger. */
  key: string;
  title: string;
  publishedAt: string | null;
  parts: string[];
  shown: Set<number>;
}

/** A read that passed the checks and has its unit of the budget. */
interface PreparedRead<C extends string> {
  key: string;
  url: URL;
  category: C;
  focus?: string;
  /** The pool whose unit the read has, and that a refund goes back to. */
  pool: Pool;
}

/** What one payer may still search and read, and how many reads it can still be given back. */
interface Pool {
  searchesLeft: number;
  readsLeft: number;
  /** Failed reads that give their unit back, and reads of a text the category had, still to come. */
  failedRefundsLeft: number;
  sameTextRefundsLeft: number;
}

export function createWebSession<C extends string>(options: WebSessionOptions<C>): WebSession<C> {
  const { engine, readPage, domain, cutoffs, isRelevant, normalizeQuery } = options;
  const closedHosts = new Set((options.closedHosts ?? []).map((host) => host.toLowerCase()));
  /** The vendor's domain and the domains that are its website too. */
  const ownDomains = [domain, ...(options.aliasDomains ?? [])].filter(
    (own): own is string => own !== null && own !== "",
  );
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
  /** The results the run has, by category, title and snippet: the same story on another site is one. */
  const seenResults = new Set<string>();
  /** The pages that were read, by the fingerprint of their text. */
  const pageOwners = new Map<string, { key: string; category: C }>();
  /**
   * The parts of the long pages that were read, found by either address of the page. A part that
   * was shown is kept in the page's source, up to MAX_EXTRA_PARTS of them, so that what the model
   * saw is what the evidence holds.
   */
  const heldPages = new Map<string, HeldPage>();
  /** The queries the engine answered, an empty answer included; a failed search is not one. */
  const askedQueries: Array<{ kind: SearchKind; words: Set<string> }> = [];
  const calls: CallRecord<C>[] = [];
  /** The model's share, and what the code sets aside for itself (nothing comes back to the code). */
  const modelPool: Pool = {
    searchesLeft: limits.maxSearches,
    readsLeft: limits.maxReads,
    failedRefundsLeft: MAX_REFUNDED_FAILURES,
    sameTextRefundsLeft: MAX_REFUNDED_READS,
  };
  const codePool: Pool = {
    searchesLeft: 0,
    readsLeft: 0,
    failedRefundsLeft: 0,
    sameTextRefundsLeft: 0,
  };
  /** The searches that reached the engine's turn, whoever paid for them. */
  let searchesStarted = 0;
  /** The pool a call is paid from: the one it is made through, else the payer it names. */
  const poolOf = (by: CallPayer | undefined, through: Pool | undefined): Pool =>
    through ?? (by === "code" ? codePool : modelPool);
  /** The pages that failed for a reason that does not pass, by canonical address: not tried again. */
  const failedReads = new Set<string>();
  /** The pages being fetched now, by the address that was asked for: no other call reads them. */
  const inFlight = new Set<string>();
  const hostGate = createGate(MAX_READS_PER_HOST);
  /** The queries being asked now: another call does not ask the same. */
  const pendingQueries: Array<{ kind: SearchKind; words: Set<string> }> = [];
  const searchGate = createGate(MAX_SEARCHES_AT_ONCE);

  /** The own domain a host is on, or undefined for a host that is not the vendor's. */
  const ownDomainOf = (host: string): string | undefined =>
    ownDomains.find((own) => isOnDomain(host, own));
  const isOwnHost = (host: string): boolean => ownDomainOf(host) !== undefined;

  /**
   * The kinds the engine answers now. An engine that falls back to another (see providerSearch.ts)
   * changes them, so they are read whenever a search is made and never kept. An engine that
   * declares none (one written before the field existed) answers every kind.
   */
  const kindsNow = (): readonly SearchKind[] => engine.kinds ?? ALL_KINDS;
  const defaultKind = (): SearchKind => (kindsNow().includes("web") ? "web" : "news");

  /** The checks of a search, before any `await`; a search that passes has its unit of the budget. */
  const prepareSearch = (
    request: SearchRequest<C>,
    through?: Pool,
  ): { refusal: SearchOutcome } | { prepared: PreparedSearch<C> } => {
    const { query, kind, category } = request;
    const pool = poolOf(request.by, through);
    if (pool.searchesLeft <= 0) {
      return { refusal: { ok: false, reason: "budget_exhausted" } };
    }
    // A kind the engine does not answer cannot be searched, whatever the words. It costs nothing
    // and is no call that reached the web. It comes before the repeat of a query: the words of an
    // earlier web search, asked again once a fallback has taken the web away, are a lost kind and
    // not a repeat.
    if (!kindsNow().includes(kind)) {
      return { refusal: { ok: false, reason: "kind_unavailable", kind } };
    }
    // A query that the engine has answered once gives the same answer again, so it costs
    // nothing and is not a call that reached the web. One that is being asked now counts too.
    const searched = normalizeQuery ? normalizeQuery(query, kind) : query;
    const words = queryWords(searched);
    const repeats = (asked: { kind: SearchKind; words: Set<string> }) =>
      asked.kind === kind && similarity(asked.words, words) >= REPEATED_QUERY_JACCARD;
    if (askedQueries.some(repeats) || pendingQueries.some(repeats)) {
      return { refusal: { ok: false, reason: "repeated_query" } };
    }
    pool.searchesLeft -= 1;
    searchesStarted += 1;
    const pending = { kind, words };
    pendingQueries.push(pending);
    return { prepared: { query, searched, kind, category, words, pending } };
  };

  /** The fetch of a search, once the engine has a place for it. It never throws. */
  const fetchSearch = (
    { searched, kind }: PreparedSearch<C>,
    signal: AbortSignal | undefined,
  ): Promise<SearchFetched> =>
    searchGate("search", async (): Promise<SearchFetched> => {
      try {
        return {
          kind: "answer",
          results: await engine.search(searched, kind, signal),
          at: performance.now(),
        };
      } catch (error) {
        const at = performance.now();
        // A failed search is an answer of the web. Anything else is a bug, and is passed on.
        if (error instanceof SearchEngineError) {
          return { kind: "failed", aborted: signal?.aborted === true, at };
        }
        return { kind: "bug", error, at };
      }
    });

  /** What an answer or a failure comes to in the session: the ledger, the records. */
  const settleSearch = (
    { query, searched, kind, category, words }: PreparedSearch<C>,
    fetched: Exclude<SearchFetched, { kind: "bug" }>,
  ): SearchOutcome => {
    if (fetched.kind === "failed") {
      if (!fetched.aborted) {
        calls.push({ category, tool: "search", answered: false, failure: "search_unavailable" });
      }
      return { ok: false, reason: "search_unavailable" };
    }
    const answer = fetched.results;
    calls.push({ category, tool: "search", answered: true, failure: null });
    askedQueries.push({ kind, words });

    const cutoff = cutoffs[category];
    const results: SearchResult[] = [];
    const omitted: Partial<Record<OmittedReason, number>> = {};
    const leaveOut = (reason: OmittedReason) => {
      omitted[reason] = (omitted[reason] ?? 0) + 1;
    };
    for (const result of answer) {
      if (results.length >= limits.maxResultsPerSearch) break;
      const address = resolveAddress(result.url);
      if (!address.ok) {
        if (address.reason === "bad_address") leaveOut("bad_address");
        continue;
      }
      const url = address.url;
      const key = url.href;
      if (ledger.has(key)) {
        returned.add(key);
        continue;
      }
      if (
        isRelevant !== undefined &&
        !isOwnHost(url.hostname) &&
        !isRelevant({ title: result.title, snippet: result.snippet, url: key })
      ) {
        leaveOut("off_topic");
        continue;
      }
      const pageDate = tooOldPages.get(key);
      // A page that was too old answered off the vendor's site, since its own pages are exempt.
      const exempt = pageDate === undefined && isOwnHost(url.hostname);
      if (!exempt && isOlderThan(pageDate ?? result.publishedAt, cutoff)) {
        leaveOut("old");
        continue;
      }
      const fingerprint = resultFingerprint(result);
      const seenKey = fingerprint === null ? null : `${category}:${fingerprint}`;
      if (seenKey !== null && seenResults.has(seenKey)) {
        leaveOut("duplicate");
        continue;
      }
      if (seenKey !== null) seenResults.add(seenKey);
      returned.add(key);
      // The web feed dates a result by the day it crawled the page, which says when the page
      // was last seen and not when it was written: it can keep an old story out of the window
      // above (a page is not newer than its crawl), and must not be shown as its date. The page
      // gives its own date when it is read.
      const publishedAt = kind === "news" ? result.publishedAt : null;
      ledger.set(key, {
        category,
        kind: "result",
        onVendorSite: exempt,
        url: key,
        title: result.title,
        content: result.snippet,
        publishedAt,
      });
      results.push({ ...result, url: key, publishedAt });
    }
    return { ok: true, results, omitted, ...(searched !== query ? { query: searched } : {}) };
  };

  /**
   * The searches of `requests` at once. They are checked in the order they were asked for, fetched
   * together (at most two at once) and settled in the order they were asked for. An engine that
   * fails for another reason than a failed search is a bug: the call waits for the other fetches
   * and then rejects with its error.
   */
  const searchMany = async (
    requests: readonly SearchRequest<C>[],
    signal?: AbortSignal,
    through?: Pool,
  ): Promise<SearchResponse[]> => {
    const startedAt = performance.now();
    const checked = requests.map((request) => prepareSearch(request, through));
    let fetched: Array<SearchFetched | null>;
    try {
      fetched = await Promise.all(
        checked.map((entry) => ("prepared" in entry ? fetchSearch(entry.prepared, signal) : null)),
      );
    } finally {
      for (const entry of checked) {
        if (!("prepared" in entry)) continue;
        pendingQueries.splice(pendingQueries.indexOf(entry.prepared.pending), 1);
      }
    }
    const bug = fetched.find((answer) => answer?.kind === "bug");
    if (bug?.kind === "bug") throw bug.error;
    return checked.map((entry, index): SearchResponse => {
      if ("refusal" in entry) return { outcome: entry.refusal, ms: 0 };
      // A search that was prepared was fetched, and no fetch was a bug (that threw above).
      const answer = fetched[index] as Exclude<SearchFetched, { kind: "bug" }>;
      return {
        outcome: settleSearch(entry.prepared, answer),
        ms: Math.max(0, Math.round(answer.at - startedAt)),
      };
    });
  };

  /**
   * The part of a held page that is asked for. The first parts shown are kept in the page's source
   * behind the gap marker, up to MAX_EXTRA_PARTS; a part beyond that is refused, because the
   * model must not be shown text that the evidence would not hold.
   */
  const readPart = (held: HeldPage, number: number): ReadOutcome => {
    if (number > held.parts.length) {
      return { ok: false, reason: "no_such_part", parts: held.parts.length };
    }
    if (held.shown.has(number)) return { ok: false, reason: "already_read" };
    const entry = ledger.get(held.key);
    if (entry === undefined || entry.kind !== "page") return { ok: false, reason: "already_read" };
    if (held.shown.size >= MAX_EXTRA_PARTS) return { ok: false, reason: "parts_limit" };
    const excerpt = held.parts[number - 1];
    held.shown.add(number);
    ledger.set(held.key, { ...entry, content: entry.content + EXCERPT_GAP + excerpt });
    return {
      ok: true,
      page: {
        url: held.key,
        title: held.title,
        publishedAt: held.publishedAt,
        excerpt,
        truncated: number < held.parts.length,
        links: [],
        part: number,
        parts: held.parts.length,
      },
    };
  };

  /**
   * The checks of a read. They all run before any `await`, so two reads made at once cannot both
   * take the last unit of the budget. A read that passes has its unit, and is marked as being
   * fetched so that no other call reads the same page meanwhile.
   */
  const prepareRead = (
    request: ReadRequest<C>,
    through?: Pool,
  ): { refusal: ReadOutcome } | { immediate: ReadOutcome } | { prepared: PreparedRead<C> } => {
    const address = resolveAddress(request.url);
    if (!address.ok) return { refusal: { ok: false, reason: address.reason } };
    const url = address.url;
    const key = url.href;
    // A part of a page the run holds needs no request and no unit of the budget.
    const held = request.part === undefined ? undefined : heldPages.get(key);
    if (held !== undefined && request.part !== undefined) {
      return { immediate: readPart(held, request.part) };
    }
    if (answeredReads.has(key) || inFlight.has(key)) {
      return { refusal: { ok: false, reason: "already_read" } };
    }
    if (failedReads.has(key)) return { refusal: { ok: false, reason: "already_failed" } };
    if (closedHosts.has(url.hostname)) return { refusal: { ok: false, reason: "site_closed" } };
    if (!returned.has(key) && !isOwnHost(url.hostname)) {
      return { refusal: { ok: false, reason: "not_from_search" } };
    }
    const pool = poolOf(request.by, through);
    if (pool.readsLeft <= 0) {
      return { refusal: { ok: false, reason: "budget_exhausted" } };
    }
    pool.readsLeft -= 1;
    inFlight.add(key);
    return { prepared: { key, url, category: request.category, focus: request.focus, pool } };
  };

  /** The fetch of a read, once its host has a place for it. It never throws: the answer says what happened. */
  const fetchPage = (
    { key, url }: PreparedRead<C>,
    signal: AbortSignal | undefined,
  ): Promise<Fetched> =>
    hostGate(url.hostname, async (): Promise<Fetched> => {
      try {
        return { kind: "page", page: await readPage(key, signal), at: performance.now() };
      } catch (error) {
        const at = performance.now();
        // A failed read is an answer of the web. Anything else is a bug, and is passed on.
        if (error instanceof PageReadError) {
          return { kind: "failed", error, aborted: signal?.aborted === true, at };
        }
        return { kind: "bug", error, at };
      }
    });

  /** What a fetched page or a failure comes to in the session: the ledger, the budget, the records. */
  const settleRead = (
    { key, url, category, focus, pool }: PreparedRead<C>,
    fetched: Exclude<Fetched, { kind: "bug" }>,
  ): ReadOutcome => {
    if (fetched.kind === "failed") {
      const { reason } = fetched.error;
      // A read that failed on the web's account gives its unit back, a limited number of times,
      // and a page that will fail again is not tried again. When the run's own clock cut the
      // read off it is the clock's failure, not the page's.
      if (!fetched.aborted) {
        if (pool.failedRefundsLeft > 0) {
          pool.failedRefundsLeft -= 1;
          pool.readsLeft += 1;
        }
        if (reason !== "unreachable") failedReads.add(key);
      }
      // A redirect, or a host, that the address policy refused on the way: refused like the URL
      // itself would be.
      if (reason === "not_allowed") return { ok: false, reason };
      if (!fetched.aborted) {
        calls.push({ category, tool: "read", answered: false, failure: reason });
      }
      return { ok: false, reason };
    }
    const { page } = fetched;
    answeredReads.add(key);
    calls.push({ category, tool: "read", answered: true, failure: null });

    // The address the page is kept under: the one it claims for itself when that is the same
    // document on the same site, else the one that was asked for. Either spelling is read once.
    const claimed = acceptCanonical({
      asked: url,
      answered: page.url,
      claimed: page.canonicalUrl ?? null,
    });
    const settled = claimed?.href ?? key;
    answeredReads.add(settled);
    // A claim on another site is not taken, but it is kept with the page: whose story this is.
    const elsewhere =
      claimed === null
        ? crossSiteCanonical({ answered: page.url, claimed: page.canonicalUrl ?? null })
        : null;
    const spellings = settled === key ? [key] : [settled, key];
    // The address that answered, when it is not the one asked (a redirect): the source is
    // classified by it, as the vendor's site is decided by it.
    const answered = answeredAddress(page.url);
    const redirected = answered !== null && answered !== key && answered !== settled;

    // Decided on the URL that answered: a page that redirected off the vendor's site is not one
    // of its own.
    const ownPage = isOwnHost(hostOf(page.url));
    const earlier = ledger.get(settled) ?? ledger.get(key);
    // The page's own date when it has one. Only a page without a date is held to the date that
    // its entry keeps from the search result, which was checked against the window of the
    // category it was searched under and may be older than the page.
    const dates = [page.publishedAt ?? earlier?.publishedAt ?? null];
    const tooOld = ownPage ? null : firstOlderThan(dates, cutoffs[category]);
    if (tooOld !== null) {
      // The source is outside the window, so it must not reach the analysis under this category.
      // A snippet kept under another category stays there while it is within that one's window,
      // no longer marked as the vendor's: its page answered off the vendor's site.
      for (const spelling of spellings) {
        const entry = ledger.get(spelling);
        if (!entry) continue;
        if (firstOlderThan(dates, cutoffs[entry.category]) !== null) {
          ledger.delete(spelling);
        } else {
          ledger.set(spelling, { ...entry, onVendorSite: false });
        }
        tooOldPages.set(spelling, tooOld);
      }
      for (const spelling of spellings) tooOldPages.set(spelling, tooOld);
      return { ok: false, reason: "too_old", publishedAt: tooOld };
    }

    // A page that is the same document as one already read, or has its text, is no second source.
    const fingerprint = pageFingerprint(page.text);
    const owner = fingerprint === null ? undefined : pageOwners.get(fingerprint);
    const sameAddress = settled !== key && ledger.get(settled)?.kind === "page";
    const sameText = owner !== undefined && owner.category === category && owner.key !== settled;
    if (sameAddress || sameText) {
      for (const spelling of spellings) {
        const entry = ledger.get(spelling);
        if (entry?.kind === "result" && entry.category === category) ledger.delete(spelling);
      }
      if (pool.sameTextRefundsLeft > 0) {
        pool.sameTextRefundsLeft -= 1;
        pool.readsLeft += 1;
      }
      return { ok: false, reason: "same_text", sameAs: sameAddress ? settled : owner?.key };
    }
    if (fingerprint !== null) pageOwners.set(fingerprint, { key: settled, category });

    const { excerpt, truncated } = selectExcerpt(page.text, { focus });
    const parts = pageParts(page.text);
    if (settled !== key) ledger.delete(key);
    ledger.set(
      settled,
      earlier
        ? {
            ...earlier,
            url: settled,
            category,
            kind: "page",
            onVendorSite: ownPage,
            content: excerpt,
            // The date that admitted the read, so that the analysis holds the source to the
            // window of its new category by the same date.
            publishedAt: page.publishedAt ?? earlier.publishedAt,
            ...(elsewhere === null ? {} : { canonicalUrl: elsewhere }),
            ...(redirected ? { answeredUrl: answered } : {}),
          }
        : {
            category,
            kind: "page",
            onVendorSite: ownPage,
            url: settled,
            title: page.title,
            content: excerpt,
            publishedAt: page.publishedAt,
            ...(elsewhere === null ? {} : { canonicalUrl: elsewhere }),
            ...(redirected ? { answeredUrl: answered } : {}),
          },
    );
    if (parts.length > 1) {
      const held: HeldPage = {
        key: settled,
        title: page.title,
        publishedAt: page.publishedAt,
        parts,
        shown: new Set(),
      };
      heldPages.set(settled, held);
      heldPages.set(key, held);
    }
    const linkDomain = ownPage ? ownDomainOf(hostOf(page.url)) : undefined;
    const links = linkDomain === undefined ? [] : relevantLinks(page.links, linkDomain, page.url);
    return {
      ok: true,
      page: {
        url: settled,
        title: page.title,
        publishedAt: page.publishedAt,
        excerpt,
        truncated,
        links,
        ...(parts.length > 1 ? { parts: parts.length } : {}),
      },
    };
  };

  /**
   * The reads of `requests` at once. They are checked in the order they were asked for, fetched
   * together (at most two at once from one host) and settled in the order they were asked for. A
   * reader that fails for another reason than a page does not answer is a bug: the call waits
   * for the other fetches and then rejects with its error.
   */
  const readMany = async (
    requests: readonly ReadRequest<C>[],
    signal?: AbortSignal,
    through?: Pool,
  ): Promise<ReadResult[]> => {
    const startedAt = performance.now();
    const checked = requests.map((request) => prepareRead(request, through));
    let fetched: Array<Fetched | null>;
    try {
      fetched = await Promise.all(
        checked.map((entry) => ("prepared" in entry ? fetchPage(entry.prepared, signal) : null)),
      );
    } finally {
      for (const entry of checked) if ("prepared" in entry) inFlight.delete(entry.prepared.key);
    }
    const bug = fetched.find((answer) => answer?.kind === "bug");
    if (bug?.kind === "bug") throw bug.error;
    return checked.map((entry, index): ReadResult => {
      if ("refusal" in entry) return { outcome: entry.refusal, ms: 0 };
      if ("immediate" in entry) return { outcome: entry.immediate, ms: 0 };
      // A read that was prepared was fetched, and no fetch was a bug (that threw above).
      const answer = fetched[index] as Exclude<Fetched, { kind: "bug" }>;
      return {
        outcome: settleRead(entry.prepared, answer),
        ms: Math.max(0, Math.round(answer.at - startedAt)),
      };
    });
  };

  const wholeCount = (count: number | undefined) =>
    typeof count === "number" && Number.isFinite(count) && count >= 1 ? Math.floor(count) : 0;

  const session: WebSession<C> = {
    search: async (query, kind, category, signal) => {
      const [search] = await searchMany([{ query, kind, category }], signal);
      return search.outcome;
    },

    searchMany: (requests, signal) => searchMany(requests, signal),

    defaultKind,

    addRecords(records, category, source) {
      const omitted: Partial<Record<OmittedReason, number>> = {};
      const leaveOut = (reason: OmittedReason) => {
        omitted[reason] = (omitted[reason] ?? 0) + 1;
      };
      const cutoff = cutoffs[category];
      let added = 0;
      for (const record of records) {
        const address = resolveAddress(record.url);
        if (!address.ok) {
          leaveOut("bad_address");
          continue;
        }
        const key = address.url.href;
        if (ledger.has(key)) {
          leaveOut("duplicate");
          continue;
        }
        if (isOlderThan(record.publishedAt, cutoff)) {
          leaveOut("old");
          continue;
        }
        ledger.set(key, {
          category,
          kind: "page",
          onVendorSite: false,
          url: key,
          title: record.title,
          content: record.text,
          publishedAt: record.publishedAt,
          ...(source === undefined ? {} : { record: source }),
          ...(record.vrdb === undefined ? {} : { vrdb: record.vrdb }),
        });
        // The record was read: the model is not given a reason to spend a read on its address.
        answeredReads.add(key);
        added += 1;
      }
      return { added, omitted };
    },

    setCodeBudget(grant) {
      codePool.searchesLeft += wholeCount(grant.searches);
      codePool.readsLeft += wholeCount(grant.reads);
    },

    pool(grant) {
      const searches = wholeCount(grant.searches);
      const reads = wholeCount(grant.reads);
      const own: Pool = {
        searchesLeft: searches,
        readsLeft: reads,
        failedRefundsLeft: Math.ceil(reads / 2),
        sameTextRefundsLeft: reads >= 1 ? 1 : 0,
      };
      return {
        search: async (query, kind, category, signal) => {
          const [search] = await searchMany([{ query, kind, category }], signal, own);
          return search.outcome;
        },
        searchMany: (requests, signal) => searchMany(requests, signal, own),
        defaultKind,
        read: async (rawUrl, category, focus, signal) => {
          const [read] = await readMany([{ url: rawUrl, category, focus }], signal, own);
          return read.outcome;
        },
        readMany: (requests, signal) => readMany(requests, signal, own),
        addRecords: (records, recordCategory, record) =>
          session.addRecords(records, recordCategory, record),
        setCodeBudget: (codeGrant) => session.setCodeBudget(codeGrant),
        pool: (nested) => session.pool(nested),
        budget: () => ({ searchesLeft: own.searchesLeft, readsLeft: own.readsLeft }),
        snapshot: () => session.snapshot(),
      };
    },

    read: async (rawUrl, category, focus, signal) => {
      const [read] = await readMany([{ url: rawUrl, category, focus }], signal);
      return read.outcome;
    },

    readMany: (requests, signal) => readMany(requests, signal),

    budget() {
      return { searchesLeft: modelPool.searchesLeft, readsLeft: modelPool.readsLeft };
    },

    snapshot() {
      return {
        ledger: [...ledger.values()].map((entry) => ({ ...entry })),
        calls: calls.map((call) => ({ ...call })),
        searchesUsed: searchesStarted,
        pagesRead: calls.filter((call) => call.tool === "read" && call.answered).length,
      };
    },
  };
  return session;
}
