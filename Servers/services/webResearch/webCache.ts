/**
 * The caches that research runs share, in Redis: the robots.txt of a site for 24 hours (RFC 9309,
 * 2.4), the text of a page for 15 minutes and the answer of a search for 10 minutes. An answer that
 * comes from the cache costs no request, no wait for the search queue and no slot of a site's
 * patience, which is what makes a second run of the same vendor, or two vendors on one platform,
 * fast.
 *
 * What is kept is public web content that was fetched with no credentials and no mark of who asked,
 * so an entry is shared by all organizations and a key names none. Only successes are kept: a
 * failed read or search is asked again, and the in-run memory of the session already stops a run
 * from asking twice. An entry is read as carefully as the answer it stands for, since the store is
 * not the web: it is parsed, its shape is checked and an address in it must be public again, and an
 * entry that fails any of that is a miss that the next write replaces.
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
import type { SearchEngine, SearchKind, SearchResult } from "./webSearch";

export type CacheKind = "robots" | "page" | "search";

/** A lookup that found its entry (`hit`), did not (`miss`), or whose store failed (`error`). */
export type CacheOutcome = "hit" | "miss" | "error";

/** How long an entry lives. RFC 9309, 2.4: a robots.txt is not used for more than 24 hours. */
export const CACHE_TTL_SECONDS: Record<CacheKind, number> = {
  robots: 24 * 60 * 60,
  page: 15 * 60,
  search: 10 * 60,
};

/**
 * The most bytes of one entry. A larger value is not kept, so that a run of long pages cannot fill
 * the Redis that the queues share. A robots.txt is never read past 64 KiB, and a feed past 1 MiB
 * holds at most ten results of about 1 KiB.
 */
export const MAX_ENTRY_BYTES: Record<CacheKind, number> = {
  robots: 65_536,
  page: 524_288,
  search: 65_536,
};

/** The longest an operation waits for the store, the load of the client included. */
export const CACHE_TIMEOUT_MS = 250;

/** The results of one search that are kept: the engine's `MAX_RESULTS`. */
const MAX_CACHED_RESULTS = 10;

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

/** The key of a search: the feed and the words, without regard to case and spacing. Null for no words. */
function searchKeyOf(query: string, kind: SearchKind): string | null {
  const words = cleanText(query).trim().replace(/\s+/g, " ").toLowerCase();
  return words === "" ? null : `${kind}\n${words}`;
}

/**
 * A search engine that answers a query from the cache when it can. A miss goes to the engine, and
 * so through its queue and its retry; a hit never does, so it costs no second of the gap between
 * searches. An empty answer is kept, since it is an answer; a failure is not. A query with no
 * words, which the engine refuses in its own way, does not touch the cache.
 */
export function withSearchCache(engine: SearchEngine, cache: WebCache): SearchEngine {
  return {
    async search(query, kind, signal) {
      const key = searchKeyOf(query, kind);
      if (key === null) return engine.search(query, kind, signal);
      const kept = parseSearchResults(await lookup(cache, "search", key));
      if (kept !== null) return kept;
      const results = await engine.search(query, kind, signal);
      keep(cache, "search", key, JSON.stringify(results));
      return results;
    },
  };
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
