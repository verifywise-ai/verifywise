/**
 * Web search for the web research toolkit: the `SearchEngine` a research session is given, and the
 * engine behind it, which reads the public RSS results feed of Bing.
 *
 * The feed is third-party text in an XML shell. `parseBingRss` is a scanner, not an XML parser: it
 * walks the document with `indexOf` and nothing that can backtrack over the whole of it, so a body
 * of any shape is read in time linear in its length. The text of a result is untrusted. A field is
 * only ever one of the item's own child elements (text inside CDATA cannot make another), every
 * result URL passes the same policy as a URL the model chooses (`parsePublicUrl`), and a link back
 * to bing.com is never a result.
 */
import { FetchError, guardedFetch } from "./guardedFetch";
import { decodeEntities } from "./pageText";
import { isOnDomain, parsePublicUrl } from "./publicUrl";
import { MAX_SNIPPET_CHARS, cleanText, cutAtCodePoint } from "../vendorResearch/text";
import { WebCache, withSearchCache } from "./webCache";

export type SearchKind = "web" | "news";

export interface SearchResult {
  title: string;
  /** A public address that passed `parsePublicUrl`, never one on bing.com. */
  url: string;
  /** At most MAX_SNIPPET_CHARS characters of plain text. */
  snippet: string;
  /**
   * ISO 8601, or null when the feed gives no date or one that is not an RFC 822 date. For a result
   * of the web feed this is the day the engine crawled the page, not the day it was published; the
   * web session uses it only as an upper bound and does not keep it (see webSession.ts).
   */
  publishedAt: string | null;
  /** The publisher's name, for news; null for web results. */
  source: string | null;
}

export const MAX_RESULTS = 10;
export const SEARCH_FEED_MAX_BYTES = 1_048_576;
export const MIN_SEARCH_GAP_MS = 1000;

const FEED_TIMEOUT_MS = 12_000;
const FEED_CONTENT_TYPES: readonly string[] = [
  "application/rss+xml",
  "text/xml",
  "application/xml",
];

/** Thrown for every failed search. The message is fixed: it repeats nothing of the query or the feed. */
export class SearchEngineError extends Error {
  constructor() {
    super("The search is not available right now");
    this.name = "SearchEngineError";
  }
}

export interface SearchEngine {
  /**
   * At most MAX_RESULTS results, possibly none: an empty list is an answer. Rejects with a
   * SearchEngineError when the search failed for any reason, an abort included.
   */
  search(query: string, kind: SearchKind, signal?: AbortSignal): Promise<SearchResult[]>;
}

/** The address of the feed for a query. `encodeURIComponent` writes a space as %20, not as +. */
export function buildBingUrl(query: string, kind: SearchKind): string {
  const path = kind === "news" ? "/news/search" : "/search";
  // cleanText first: encodeURIComponent throws on a lone surrogate, and a model can write one.
  return `https://www.bing.com${path}?q=${encodeURIComponent(cleanText(query))}&format=rss&setlang=en-US`;
}

const BING_DOMAIN = "bing.com";
const ITEM_OPEN = "<item>";
const ITEM_CLOSE = "</item>";
const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";

/** The feed's root element, after an optional byte order mark and XML declaration. */
const RSS_ROOT = /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?<rss[\s>/]/;

/** A tag, a closing tag, a comment or a declaration. A `<` that starts none of them is text. */
const MARKUP = /<\/?[A-Za-z!?][^<>]*>/g;

/** The date format of RSS. Date.parse alone also reads "hello 2" as a day in 2001. */
const RFC_822_DATE =
  /^(?:[a-z]{3},\s*)?\d{1,2}\s+[a-z]{3}\s+(?:\d{4}|\d{2})\s+\d{2}:\d{2}(?::\d{2})?(?:\s+(?:[a-z]{1,5}|[+-]\d{4}))?$/i;

/** The child elements of an item that are read. The first of each name wins. */
const FIELD_NAMES = ["title", "link", "description", "pubDate", "News:Source"] as const;
type FieldName = (typeof FIELD_NAMES)[number];
type Fields = Partial<Record<FieldName, string>>;

/** What can follow the name in an opening tag. */
const NAME_END = /[\s/>]/;

/**
 * The first index of `needle` at or after `from` that is not inside a CDATA section. It is -1 when
 * there is none, and when a CDATA section never ends: everything after it is that section's text.
 */
function indexOutsideCdata(text: string, needle: string, from: number): number {
  let position = from;
  let found = text.indexOf(needle, position);
  while (found !== -1) {
    const cdata = text.indexOf(CDATA_OPEN, position);
    if (cdata === -1 || cdata > found) return found;
    const cdataEnd = text.indexOf(CDATA_CLOSE, cdata + CDATA_OPEN.length);
    if (cdataEnd === -1) return -1;
    position = cdataEnd + CDATA_CLOSE.length;
    if (found < position) found = text.indexOf(needle, position);
  }
  return -1;
}

/**
 * The next item at or after `from` and the index after its end. An `<item>` inside CDATA is not an
 * item. It is null when there is no item that ends: if this one has no `</item>`, no later one has.
 */
function nextItem(xml: string, from: number): { body: string; end: number } | null {
  let bodyStart = -1;
  let position = from;
  for (;;) {
    const angle = xml.indexOf("<", position);
    if (angle === -1) return null;
    if (xml.startsWith(CDATA_OPEN, angle)) {
      const cdataEnd = xml.indexOf(CDATA_CLOSE, angle + CDATA_OPEN.length);
      if (cdataEnd === -1) return null;
      position = cdataEnd + CDATA_CLOSE.length;
    } else if (bodyStart === -1 && xml.startsWith(ITEM_OPEN, angle)) {
      bodyStart = angle + ITEM_OPEN.length;
      position = bodyStart;
    } else if (bodyStart !== -1 && xml.startsWith(ITEM_CLOSE, angle)) {
      return { body: xml.slice(bodyStart, angle), end: angle + ITEM_CLOSE.length };
    } else {
      position = angle + 1;
    }
  }
}

/** The field whose opening tag starts at `angle`, if it is one that is read. */
function fieldAt(item: string, angle: number): FieldName | null {
  for (const name of FIELD_NAMES) {
    if (item.startsWith(name, angle + 1) && NAME_END.test(item.charAt(angle + 1 + name.length))) {
      return name;
    }
  }
  return null;
}

/**
 * The raw content (CDATA still in it) of the fields of one item. Only the item's own fields are
 * read: once a field is found the scan goes on after its closing tag, so what is inside it, CDATA
 * or not, can never make another field. Every step moves forward, so the cost is the item's length.
 */
function readFields(item: string): Fields {
  const fields: Fields = {};
  let position = 0;
  for (;;) {
    const angle = item.indexOf("<", position);
    if (angle === -1) return fields;
    if (item.startsWith(CDATA_OPEN, angle)) {
      const cdataEnd = item.indexOf(CDATA_CLOSE, angle + CDATA_OPEN.length);
      if (cdataEnd === -1) return fields;
      position = cdataEnd + CDATA_CLOSE.length;
      continue;
    }
    const name = fieldAt(item, angle);
    if (name === null || fields[name] !== undefined) {
      position = angle + 1;
      continue;
    }
    const tagEnd = item.indexOf(">", angle + 1);
    if (tagEnd === -1) return fields;
    if (item.charAt(tagEnd - 1) === "/") {
      fields[name] = "";
      position = tagEnd + 1;
      continue;
    }
    const closeTag = `</${name}>`;
    const contentEnd = indexOutsideCdata(item, closeTag, tagEnd + 1);
    if (contentEnd === -1) return fields;
    fields[name] = item.slice(tagEnd + 1, contentEnd);
    position = contentEnd + closeTag.length;
  }
}

/** The text with each CDATA section replaced by what is inside it. */
function unwrapCdata(text: string): string {
  let result = "";
  let position = 0;
  for (;;) {
    const open = text.indexOf(CDATA_OPEN, position);
    if (open === -1) return result + text.slice(position);
    result += text.slice(position, open);
    const contentStart = open + CDATA_OPEN.length;
    const close = text.indexOf(CDATA_CLOSE, contentStart);
    if (close === -1) return result + text.slice(contentStart);
    result += text.slice(contentStart, close);
    position = close + CDATA_CLOSE.length;
  }
}

/**
 * A field as one line of plain text: CDATA unwrapped, character references decoded once, markup
 * removed (it is markup whether the feed wrote it as tags or as `&lt;` references), control
 * characters removed and white space collapsed. `MARKUP` cannot span a `<`, so a run of `<` that
 * never ends is read in linear time.
 */
function plainText(raw: string | undefined): string {
  if (raw === undefined) return "";
  return cleanText(decodeEntities(unwrapCdata(raw)).replace(MARKUP, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** A third party's title or name is held to the length of a snippet. */
function shortText(raw: string | undefined): string {
  return cutAtCodePoint(plainText(raw), MAX_SNIPPET_CHARS).trimEnd();
}

function toIsoDate(text: string): string | null {
  if (!RFC_822_DATE.test(text)) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * The public address a feed link stands for, or null for a link that is no result. A link on
 * bing.com is a wrapper (news links are `apiclick.aspx?...&url=<publisher address>`): the address
 * is its `url` parameter, and a wrapper without one is dropped. The wrapper itself is parsed with
 * the plain URL parser, not the policy, because it may be longer than a URL may be.
 */
function resultUrl(link: string): string | null {
  let candidate = link;
  try {
    const wrapper = new URL(link);
    if (isOnDomain(wrapper.hostname, BING_DOMAIN)) {
      candidate = wrapper.searchParams.get("url") ?? "";
    }
  } catch {
    return null;
  }
  try {
    const url = parsePublicUrl(candidate);
    return isOnDomain(url.hostname, BING_DOMAIN) ? null : url.href;
  } catch {
    return null;
  }
}

function toResult(fields: Fields): SearchResult | null {
  const link = fields.link === undefined ? "" : decodeEntities(unwrapCdata(fields.link)).trim();
  const url = resultUrl(link);
  if (url === null) return null;
  const source = shortText(fields["News:Source"]);
  return {
    title: shortText(fields.title),
    url,
    snippet: shortText(fields.description),
    publishedAt: toIsoDate(plainText(fields.pubDate)),
    source: source === "" ? null : source,
  };
}

/**
 * The usable results of an RSS feed of Bing, in the order of the feed, at most MAX_RESULTS.
 *
 * An item is dropped when it has no link, when the address is not a public one (including one on
 * bing.com) and when an earlier item has the same address. The same parser reads the web and the
 * news feed. Throws a SearchEngineError when the body is not an RSS document, for example the
 * consent or challenge page that a blocked client gets with a 200; an RSS document with no items
 * is an empty list, not an error.
 */
export function parseBingRss(xml: string): SearchResult[] {
  if (!RSS_ROOT.test(xml)) throw new SearchEngineError();
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  let from = 0;
  while (results.length < MAX_RESULTS) {
    const item = nextItem(xml, from);
    if (item === null) break;
    from = item.end;
    const result = toResult(readFields(item.body));
    if (result !== null && !seen.has(result.url)) {
      seen.add(result.url);
      results.push(result);
    }
  }
  return results;
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
function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
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

export function createSearchQueue(
  options: {
    minGapMs?: number;
    now?: () => number;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  } = {},
): SearchQueue {
  const minGapMs = options.minGapMs ?? MIN_SEARCH_GAP_MS;
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

/** One queue for the process: every engine that is not given its own shares it. */
const defaultQueue = createSearchQueue();

/**
 * The search engine on Bing's public RSS results feed. No account, no key, and it needs nothing
 * from the organisation. The feed is requested through `guardedFetch` with no robots.txt check: it
 * is a published feed, not a page read, and spec section 14 names it as the one exception.
 *
 * Read this before the feature ships. The feed is not an official API. Bing's robots.txt disallows
 * /search, and the notice in every feed limits its results to personal, non-commercial display in
 * an RSS reader and asks for Microsoft's written permission for any other use. Querying it from a
 * commercial product and passing the results to an LLM provider is outside that notice. That is
 * fine for development and evaluation, and it is the release gate of section 14 of
 * docs/superpowers/specs/2026-10-11-vendor-research-web-agent-design.md (see also
 * docs/technical/infrastructure/web-research.md): before this ships to customers the product owner
 * decides whether to ask Microsoft for permission or to put another engine behind SearchEngine.
 * This is the only module to replace.
 *
 * Searches go through one queue, one at a time and a second apart. Whatever goes wrong comes out as
 * a SearchEngineError, and nothing is logged here: the query is never written anywhere.
 *
 * A search that failed for a reason that passes is asked once more (see `isTransient`): a network
 * error, a time-out, a 5xx, or a 429 that asks to wait only a few seconds. The second request goes
 * through the queue like the first, so the gap between searches holds, and the caller sees one
 * search: one answer or one error. Nothing else is asked again: a refusal, a page that is not a
 * feed and a 429 that asks for a long wait would only fail again, or make the feed's answer worse.
 *
 * @param deps.fetch Replaces `guardedFetch`, for tests.
 * @param deps.queue Replaces the queue the whole process shares, for tests.
 * @param deps.sleep Replaces the wait before a request that follows a 429, for tests.
 * @param deps.onRetry Told of each retry with the feed of the search, for a counter. It must not
 *   throw; if it does, the search goes on as if it had not.
 * @param deps.cache The cache shared by runs (see webCache.ts). A search that an earlier run asked
 *   within 10 minutes is answered from it, with no request and no place in the queue; the answer of
 *   one that was asked of the feed is kept. None by default.
 */
export function createBingEngine(
  deps: {
    fetch?: typeof guardedFetch;
    queue?: SearchQueue;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    onRetry?: (kind: SearchKind) => void;
    cache?: WebCache;
  } = {},
): SearchEngine {
  const fetch = deps.fetch ?? guardedFetch;
  const queue = deps.queue ?? defaultQueue;
  const sleep = deps.sleep ?? sleepUnlessAborted;

  const request = async (query: string, kind: SearchKind, signal?: AbortSignal) => {
    const answer = await queue(
      () =>
        fetch(buildBingUrl(query, kind), {
          allowedContentTypes: FEED_CONTENT_TYPES,
          maxBytes: SEARCH_FEED_MAX_BYTES,
          headerTimeoutMs: FEED_TIMEOUT_MS,
          totalTimeoutMs: FEED_TIMEOUT_MS,
          signal,
        }),
      signal,
    );
    return parseBingRss(answer.body.toString("utf8"));
  };

  const engine: SearchEngine = {
    async search(query, kind, signal) {
      try {
        try {
          return await request(query, kind, signal);
        } catch (error) {
          if (signal?.aborted || !isTransient(error)) throw error;
          // Only a failure by status can have asked for a wait, and only a short one is kept.
          const wait = error instanceof FetchError ? error.retryAfterMs : undefined;
          if (wait !== undefined && wait > 0) await sleep(wait, signal);
          try {
            deps.onRetry?.(kind);
          } catch {
            // A counter is not part of the search.
          }
          return await request(query, kind, signal);
        }
      } catch {
        throw new SearchEngineError();
      }
    },
  };
  return deps.cache === undefined ? engine : withSearchCache(engine, deps.cache);
}

/** The longest `Retry-After` that is waited for: a longer one is a feed that wants to be left alone. */
const MAX_RETRY_AFTER_MS = 5000;

/**
 * Whether a failed request may be asked again: it did not fail because of what was asked or who
 * asks. A network error, a time-out or an answer of 500 or more is the feed having a bad moment;
 * a 429 is the feed asking for a pause, and is kept only when the pause is short. A 4xx other than
 * that, a refusal of the URL policy or of robots.txt, and a body that is not a feed are not.
 */
function isTransient(error: unknown): boolean {
  if (!(error instanceof FetchError)) return false;
  if (error.reason === "unreachable") return error.status === undefined || error.status >= 500;
  return (
    error.status === 429 &&
    error.retryAfterMs !== undefined &&
    error.retryAfterMs <= MAX_RETRY_AFTER_MS
  );
}
