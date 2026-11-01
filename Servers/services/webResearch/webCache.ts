/**
 * The caches that research runs share, in Redis: the robots.txt of a site for 24 hours (RFC 9309,
 * 2.4), the text of a page for 15 minutes, the answer of a search for 10 minutes and the index of
 * the news that the GDELT Project gave for a run for an hour. An answer that comes from the cache
 * costs no request, no wait for the search queue and no slot of a site's patience, which is what
 * makes a second run of the same vendor, or two vendors on one platform, fast.
 *
 * What is kept is public web content that was fetched with no credentials and no mark of who asked,
 * so an entry is shared by all organizations and its key names none. (The GDELT index is public
 * too, and its terms allow it to be kept and redistributed as long as the project is cited, which
 * the run summary does.) The one exception is the answer of a search that an organization paid for
 * with its own key, which a provider gave (Claude's web search, billed to the key): it is kept under
 * the id of that organization and served to no other. The key of every search also names the
 * engine, so that the answers of two engines never mix.
 *
 * Only successes are kept: a failed read or search is asked again, and the in-run memory of the
 * session already stops a run from asking twice. An entry is read as carefully as the answer it
 * stands for, since the store is not the web: it is parsed, its shape is checked and an address in
 * it must be public again, and an entry that fails any of that is a miss that the next write
 * replaces.
 *
 * The cache is never a reason for a run to fail or wait. Every operation ends within
 * `CACHE_TIMEOUT_MS` and says nothing worse than a miss, a Redis that is not ready is not handed a
 * command (the shared client queues commands for ever while it reconnects), and a write does not
 * hold up the answer it keeps. Nothing is logged here: a key can hold an address, so the only report
 * is the outcome, by kind, for a counter.
 */
import { createHash } from "crypto";
import { cleanText } from "../vendorResearch/text";
import { parsePublicUrl } from "./publicUrl";
// Types only, so that readPage and webSearch can use this module without a cycle.
import type { FetchedPage, PageReader } from "./readPage";
import type { PageIdentity } from "./siteIdentity";
import type { SearchEngine, SearchEngineId, SearchKind, SearchResult } from "./webSearch";

export type CacheKind = "robots" | "page" | "search" | "gdelt";

/** A lookup that found its entry (`hit`), did not (`miss`), or whose store failed (`error`). */
export type CacheOutcome = "hit" | "miss" | "error";

/** How long an entry lives. RFC 9309, 2.4: a robots.txt is not used for more than 24 hours. */
export const CACHE_TTL_SECONDS: Record<CacheKind, number> = {
  robots: 24 * 60 * 60,
  page: 15 * 60,
  search: 10 * 60,
  gdelt: 60 * 60,
};

/**
 * The most bytes of one entry. A larger value is not kept, so that a run of long pages cannot fill
 * the Redis that the queues share. A robots.txt is never read past 64 KiB, and a feed past 1 MiB
 * holds at most ten results of about 1 KiB. A GDELT index is up to 250 articles of a title and an
 * address, about a kilobyte each at the most: a larger one is an answer to leave out.
 */
export const MAX_ENTRY_BYTES: Record<CacheKind, number> = {
  robots: 65_536,
  page: 524_288,
  search: 65_536,
  gdelt: 262_144,
};

/** The longest an operation waits for the store, the load of the client included. */
export const CACHE_TIMEOUT_MS = 250;

/** The results of one search that are kept: the engine's `MAX_RESULTS`. */
const MAX_CACHED_RESULTS = 10;

/** The articles of one GDELT index that are kept: what the request asks for (`maxrecords`). */
const MAX_CACHED_ARTICLES = 250;

/** Written in front of every key. Raise it when the shape of a value changes. */
const NAMESPACE = "vr:web:v1";

export interface WebCache {
  /** What is kept under the key, or null for no entry, an expired one and any failure. */
  get(kind: CacheKind, key: string): Promise<string | null>;
  /** Keeps the value for the time of its kind. It never rejects; a value that is too large is not kept. */
  set(kind: CacheKind, key: string, value: string): Promise<void>;
}

/** The part of the Redis client that is used (`ioredis`). */
export interface RedisLike {
  /** `ready` when the client can take a command now. */
  status: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
}

/** Rejects when the work has not finished within `ms`. The work's own failure after that is handled. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The cache did not answer in time")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The key as Redis holds it: hashed, so that an address or a query never sits in a key. */
function redisKeyOf(kind: CacheKind, key: string): string {
  return `${NAMESPACE}:${kind}:${createHash("sha256").update(key).digest("hex")}`;
}

/**
 * The cache on a Redis client.
 *
 * @param load The client. It is called on first use, once (again after a failure), so that making
 *   the cache connects nothing and a process that never researches never opens the connection.
 * @param deps.timeoutMs Replaces `CACHE_TIMEOUT_MS`, for tests.
 * @param deps.onOutcome Told of every lookup (`hit` or `miss`) and of every lookup or write that
 *   failed (`error`), with its kind, for a counter. It must not throw; if it does, nothing changes.
 */
export function createRedisWebCache(
  load: () => RedisLike | Promise<RedisLike>,
  deps: {
    timeoutMs?: number;
    onOutcome?: (kind: CacheKind, outcome: CacheOutcome) => void;
  } = {},
): WebCache {
  const timeoutMs = deps.timeoutMs ?? CACHE_TIMEOUT_MS;
  let client: Promise<RedisLike> | undefined;

  const report = (kind: CacheKind, outcome: CacheOutcome) => {
    try {
      deps.onOutcome?.(kind, outcome);
    } catch {
      // A counter is not part of the cache.
    }
  };

  /** The client, when it can take a command. A failed load is tried again by the next operation. */
  const readyClient = async (): Promise<RedisLike> => {
    if (client === undefined) {
      const loading = Promise.resolve().then(load);
      loading.catch(() => {
        if (client === loading) client = undefined;
      });
      client = loading;
    }
    const redis = await client;
    if (redis.status !== "ready") throw new Error("Redis is not ready");
    return redis;
  };

  return {
    async get(kind, key) {
      try {
        const value = await withTimeout(
          readyClient().then((redis) => redis.get(redisKeyOf(kind, key))),
          timeoutMs,
        );
        report(kind, value === null || value === undefined ? "miss" : "hit");
        return value ?? null;
      } catch {
        report(kind, "error");
        return null;
      }
    },

    async set(kind, key, value) {
      if (Buffer.byteLength(value, "utf8") > MAX_ENTRY_BYTES[kind]) return;
      try {
        await withTimeout(
          readyClient().then((redis) =>
            redis.set(redisKeyOf(kind, key), value, "EX", CACHE_TTL_SECONDS[kind]),
          ),
          timeoutMs,
        );
      } catch {
        report(kind, "error");
      }
    },
  };
}

/** `cache.get` that cannot reject, whatever the cache is. */
async function lookup(cache: WebCache, kind: CacheKind, key: string): Promise<string | null> {
  try {
    return await cache.get(kind, key);
  } catch {
    return null;
  }
}

/** `cache.set` that is not waited for and cannot reject: the answer that is kept does not wait for it. */
function keep(cache: WebCache, kind: CacheKind, key: string, value: string): void {
  try {
    cache.set(kind, key, value).catch(() => {});
  } catch {
    // A cache is not part of the read.
  }
}

/** Parses a stored value, or null when it is not JSON. */
function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPublicAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    parsePublicUrl(value);
    return true;
  } catch {
    return false;
  }
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** The identity in a stored value, rebuilt from its known fields, or null when it is not one. */
function parsePageIdentity(value: unknown): PageIdentity | null {
  if (!isRecord(value) || !isStringArray(value.names) || !isStringArray(value.products)) {
    return null;
  }
  return { names: [...value.names], products: [...value.products] };
}

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** The results in a stored value, rebuilt from their known fields, or null when it is not a list of them. */
function parseSearchResults(raw: string | null): SearchResult[] | null {
  const value = parseJson(raw);
  if (!Array.isArray(value) || value.length > MAX_CACHED_RESULTS) return null;
  const results: SearchResult[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.title !== "string" ||
      typeof item.snippet !== "string" ||
      !isPublicAddress(item.url) ||
      !isStringOrNull(item.publishedAt) ||
      !isStringOrNull(item.source)
    ) {
      return null;
    }
    results.push({
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      publishedAt: item.publishedAt,
      source: item.source,
    });
  }
  return results;
}

/** The page in a stored value, rebuilt from its known fields, or null when it is not a page. */
function parseFetchedPage(raw: string | null): FetchedPage | null {
  const value = parseJson(raw);
  if (
    !isRecord(value) ||
    !isPublicAddress(value.url) ||
    typeof value.title !== "string" ||
    typeof value.text !== "string" ||
    !isStringOrNull(value.publishedAt) ||
    !Array.isArray(value.links) ||
    (value.canonicalUrl !== undefined && !isStringOrNull(value.canonicalUrl))
  ) {
    return null;
  }
  const links: FetchedPage["links"] = [];
  for (const link of value.links) {
    if (!isRecord(link) || typeof link.text !== "string" || typeof link.url !== "string") {
      return null;
    }
    links.push({ text: link.text, url: link.url });
  }
  // Entries of an earlier version have no identity; one that has one must hold a well-formed one.
  const identity = value.identity === undefined ? undefined : parsePageIdentity(value.identity);
  if (identity === null) return null;
  return {
    url: value.url,
    title: value.title,
    publishedAt: value.publishedAt,
    text: value.text,
    links,
    canonicalUrl: value.canonicalUrl,
    ...(identity === undefined ? {} : { identity }),
  };
}

/**
 * The engines whose answers an organization pays for with its own key. Everything they return is
 * kept for that organization alone.
 */
const PAID_WITH_THE_KEY: ReadonlySet<SearchEngineId> = new Set(["anthropic", "openai"]);

/** The id of an organization as the scope of a key: a positive whole number, as the database gives it. */
const isOrganizationId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/**
 * The key of a search: the engine, the kind of search and the words, without regard to case and
 * spacing, and for an engine that is paid for with a key also the organization. Null for no words,
 * and for such an engine when no organization is named: an answer with no owner would be served to
 * all of them, so it is neither looked up nor kept.
 */
function searchKeyOf(
  engineId: SearchEngineId,
  organizationId: unknown,
  query: string,
  kind: SearchKind,
): string | null {
  const words = cleanText(query).trim().replace(/\s+/g, " ").toLowerCase();
  if (words === "") return null;
  if (!PAID_WITH_THE_KEY.has(engineId)) return `${engineId}\n${kind}\n${words}`;
  if (!isOrganizationId(organizationId)) return null;
  return `${engineId}\norg:${organizationId}\n${kind}\n${words}`;
}

/** Who a cache is in front of an engine for. */
export interface SearchCacheScope {
  /**
   * The organization whose key pays for the engine's answers. A provider's engine (Claude's search,
   * OpenAI's) is cached per organization, and with none named it is not cached at all; the answers
   * of any other engine are public and shared, and this is not part of their key.
   */
  organizationId?: number;
}

/**
 * A search engine that answers a query from the cache when it can. A miss goes to the engine, and
 * so through its queue and its retry; a hit never does, so it costs no second of the gap between
 * searches. An empty answer is kept, since it is an answer; a failure is not. A query with no
 * words, which the engine refuses in its own way, does not touch the cache.
 *
 * The key names the engine, read each time, and for a provider's engine the organization (see
 * `SearchCacheScope`). So an answer bought with one organization's key is never served to another,
 * and the answers of two engines never mix. An engine that changes while it is under way, as a
 * wrapper does when it falls back to another engine, answered with the other one: its answer is
 * not kept, since the key that was built for it belongs to the engine that was asked.
 */
export function withSearchCache(
  engine: SearchEngine,
  cache: WebCache,
  scope: SearchCacheScope = {},
): SearchEngine {
  const keyOf = (query: string, kind: SearchKind) =>
    searchKeyOf(engine.id, scope.organizationId, query, kind);
  return {
    // Read from the engine each time: a wrapper that falls back to another engine changes them.
    get id() {
      return engine.id;
    },
    get kinds() {
      return engine.kinds;
    },
    get newsWindowMonths() {
      return engine.newsWindowMonths;
    },
    async search(query, kind, signal) {
      const key = keyOf(query, kind);
      if (key === null) return engine.search(query, kind, signal);
      const kept = parseSearchResults(await lookup(cache, "search", key));
      if (kept !== null) return kept;
      const results = await engine.search(query, kind, signal);
      if (keyOf(query, kind) === key) keep(cache, "search", key, JSON.stringify(results));
      return results;
    },
  };
}

/**
 * One article of a GDELT index, as it is kept: what the engine reads of the article and nothing of
 * the rest (the pictures, the mobile address, the country).
 */
export interface GdeltArticle {
  /** A public address. */
  url: string;
  /** One line of plain text. */
  title: string;
  /** ISO 8601, from the day and time GDELT saw the article; null when it gave none that can be read. */
  publishedAt: string | null;
  /** The publisher's domain; empty when GDELT gave none. */
  domain: string;
  /** The language of the article as GDELT names it ("English", "Polish"); empty when it gave none. */
  language: string;
}

/** The articles in a stored value, rebuilt from their known fields, or null when it is not a list of them. */
function parseGdeltIndex(raw: string | null): GdeltArticle[] | null {
  const value = parseJson(raw);
  if (!Array.isArray(value) || value.length > MAX_CACHED_ARTICLES) return null;
  const articles: GdeltArticle[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.title !== "string" ||
      !isPublicAddress(item.url) ||
      !isStringOrNull(item.publishedAt) ||
      typeof item.domain !== "string" ||
      typeof item.language !== "string"
    ) {
      return null;
    }
    articles.push({
      url: item.url,
      title: item.title,
      publishedAt: item.publishedAt,
      domain: item.domain,
      language: item.language,
    });
  }
  return articles;
}

/**
 * The index that a GDELT request gave, kept for the address of the request, or null. An empty list
 * is an index: GDELT answered that nothing was found.
 */
export async function readCachedGdeltIndex(
  cache: WebCache,
  requestUrl: string,
): Promise<GdeltArticle[] | null> {
  return parseGdeltIndex(await lookup(cache, "gdelt", requestUrl));
}

/** Keeps the index for the address of the request. It does not wait for the store. */
export function cacheGdeltIndex(
  cache: WebCache,
  requestUrl: string,
  articles: readonly GdeltArticle[],
): void {
  keep(cache, "gdelt", requestUrl, JSON.stringify(articles));
}

/** The key of a page: the address as the URL parser writes it, without a fragment. Null if it is not public. */
function pageKeyOf(url: string): string | null {
  try {
    return parsePublicUrl(url).href;
  } catch {
    return null;
  }
}

/**
 * A page reader that answers from the cache when it can. A miss goes to the reader; a page that was
 * read is kept as it came, the address that answered included, so that a hit is the read again. A
 * failed read is not kept. An address that is not public, and a read whose signal has already
 * aborted, are the reader's to refuse and are not looked up.
 */
export function withPageCache(read: PageReader, cache: WebCache): PageReader {
  return async (url, signal) => {
    const key = pageKeyOf(url);
    if (key === null || signal?.aborted) return read(url, signal);
    const kept = parseFetchedPage(await lookup(cache, "page", key));
    if (kept !== null) return kept;
    const page = await read(url, signal);
    keep(cache, "page", key, JSON.stringify(page));
    return page;
  };
}

/**
 * What a site's robots.txt answered: its text (200) or that it has none (404). Nothing else is
 * kept: a site that errored, or that refused to show the file, may answer differently next time.
 */
export interface RobotsAnswer {
  status: 200 | 404;
  text: string;
}

/** The answer kept for the origin (`https://acme.com`), or null. */
export async function readCachedRobots(
  cache: WebCache,
  origin: string,
): Promise<RobotsAnswer | null> {
  const value = parseJson(await lookup(cache, "robots", origin));
  if (!isRecord(value) || typeof value.text !== "string") return null;
  if (value.status !== 200 && value.status !== 404) return null;
  return { status: value.status, text: value.text };
}

/** Keeps the answer for the origin. It does not wait for the store. */
export function cacheRobots(cache: WebCache, origin: string, answer: RobotsAnswer): void {
  keep(cache, "robots", origin, JSON.stringify({ status: answer.status, text: answer.text }));
}
