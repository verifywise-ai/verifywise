jest.setTimeout(30000);

/**
 * The web cache of the vendor research runs on a real Redis.
 *
 * The unit tests give the cache a fake client, so they cannot tell whether ioredis takes the
 * command the cache sends (`SET key value EX seconds`), reports `status` the way the cache reads it,
 * or answers a command at once when it is not connected (the shared client queues commands for ever
 * while it reconnects, which the cache must never wait for).
 *
 * `./setup` is deliberately NOT imported: it replaces the Redis client with a mock. Redis is the one
 * that REDIS_URL names (the integration wrapper points it at the throwaway instance). Every key the
 * test writes is removed again.
 */
import { createHash } from "crypto";
import IORedis from "ioredis";
import redisClient, { REDIS_URL } from "../../database/redis";
import {
  CACHE_TTL_SECONDS,
  CacheKind,
  CacheOutcome,
  type GdeltArticle,
  cacheGdeltIndex,
  createRedisWebCache,
  readCachedGdeltIndex,
  withSearchCache,
} from "../../services/webResearch/webCache";
import type { SearchEngine, SearchResult } from "../../services/webResearch/webSearch";

const written: string[] = [];

/**
 * The id of the engines the search test uses. It is one of the engines whose answers every
 * organization shares, so the cache key needs no organization (see `searchKeyOf` in webCache.ts).
 */
const SHARED_ENGINE = "replay";

/** The key the cache writes for a logical key, as the cache hashes it. */
function redisKeyOf(kind: CacheKind, key: string): string {
  const redisKey = `vr:web:v1:${kind}:${createHash("sha256").update(key).digest("hex")}`;
  written.push(redisKey);
  return redisKey;
}

/** A logical key that no other execution of the test has used. */
const unique = (name: string) => `${name}-${process.pid}-${Date.now()}`;

beforeAll(async () => {
  // Without a Redis to talk to, this is the hook that times out.
  await redisClient.ping();
}, 10000);

afterAll(async () => {
  if (written.length > 0) await redisClient.del(...written);
  await redisClient.quit();
});

describe("the web cache on a real Redis", () => {
  it("keeps a value and answers it, and the client is ready for it", async () => {
    expect(redisClient.status).toBe("ready");
    const outcomes: Array<[CacheKind, CacheOutcome]> = [];
    const cache = createRedisWebCache(() => redisClient, {
      onOutcome: (kind, outcome) => outcomes.push([kind, outcome]),
    });
    const key = unique("https://acme.example/trust");
    redisKeyOf("page", key);

    expect(await cache.get("page", key)).toBeNull();
    await cache.set("page", key, '{"text":"We are SOC 2 certified."}');

    expect(await cache.get("page", key)).toBe('{"text":"We are SOC 2 certified."}');
    expect(outcomes).toEqual([
      ["page", "miss"],
      ["page", "hit"],
    ]);
  });

  it.each(["robots", "page", "search", "gdelt"] as const)(
    "lets a %s entry expire after the time of its kind",
    async (kind) => {
      const cache = createRedisWebCache(() => redisClient);
      const key = unique(`ttl-${kind}`);
      const redisKey = redisKeyOf(kind, key);

      await cache.set(kind, key, "x");

      const left = await redisClient.ttl(redisKey);
      expect(left).toBeGreaterThan(CACHE_TTL_SECONDS[kind] - 5);
      expect(left).toBeLessThanOrEqual(CACHE_TTL_SECONDS[kind]);
    },
  );

  it("keeps the key and the organization out of Redis: only a hash of the key is there", async () => {
    const cache = createRedisWebCache(() => redisClient);
    const key = unique("https://acme.example/secret-path?token=abc");
    const redisKey = redisKeyOf("page", key);

    await cache.set("page", key, "x");

    expect(redisKey).toMatch(/^vr:web:v1:page:[0-9a-f]{64}$/);
    expect(await redisClient.exists(redisKey)).toBe(1);
  });

  it("does not wait for a client that is not connected: it answers a miss at once", async () => {
    // lazyConnect keeps the client in the state `wait`, where ioredis would queue a command until a
    // connection that never comes.
    const idle = new IORedis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    const outcomes: Array<[CacheKind, CacheOutcome]> = [];
    const cache = createRedisWebCache(() => idle, {
      onOutcome: (kind, outcome) => outcomes.push([kind, outcome]),
    });
    try {
      expect(idle.status).not.toBe("ready");
      const startedAt = Date.now();

      expect(await cache.get("page", "anything")).toBeNull();
      await cache.set("page", "anything", "x");

      expect(Date.now() - startedAt).toBeLessThan(200);
      expect(outcomes).toEqual([
        ["page", "error"],
        ["page", "error"],
      ]);
    } finally {
      idle.disconnect();
    }
  });

  it("answers a search from Redis the second time, for another engine", async () => {
    const cache = createRedisWebCache(() => redisClient);
    const results: SearchResult[] = [
      {
        title: "Acme fined",
        url: "https://news.example.com/acme-fined",
        snippet: "The regulator fined Acme.",
        publishedAt: "2026-02-01T00:00:00.000Z",
        source: "Example News",
      },
    ];
    const query = unique("acme integration test");
    // The key of a search of an engine that all organizations share: the engine, the kind of search
    // and the words, in lower case. The cleanup below removes the entry under this key.
    const searchRedisKey = redisKeyOf("search", `${SHARED_ENGINE}\nnews\n${query.toLowerCase()}`);
    const first: SearchEngine = {
      id: SHARED_ENGINE,
      kinds: ["web", "news"],
      newsWindowMonths: null,
      search: jest.fn(async () => results),
    };
    const second: SearchEngine = {
      id: SHARED_ENGINE,
      kinds: ["web", "news"],
      newsWindowMonths: null,
      search: jest.fn(async () => []),
    };

    const answered = await withSearchCache(first, cache).search(query, "news");
    // The write is not waited for by the search; give it a moment to reach Redis.
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The entry is where the cleanup below looks for it. A key that drifts from the one the cache
    // builds would be left in Redis for the hour of its time to live.
    expect(await redisClient.exists(searchRedisKey)).toBe(1);
    const again = await withSearchCache(second, cache).search(query.toUpperCase(), "news");

    expect(answered).toEqual(results);
    expect(again).toEqual(results);
    expect(second.search).not.toHaveBeenCalled();
  });

  it("keeps the index of GDELT and reads it back whole, titles in any script included", async () => {
    const cache = createRedisWebCache(() => redisClient);
    const requestUrl = unique("https://api.gdeltproject.org/api/v2/doc/doc?query=acme-integration");
    redisKeyOf("gdelt", requestUrl);
    const articles: GdeltArticle[] = [
      {
        url: "https://news.example.com/acme-breach",
        title: "Acme confirms a breach of its support system",
        publishedAt: "2026-10-25T10:00:00.000Z",
        domain: "news.example.com",
        language: "English",
      },
      {
        url: "https://nachrichten.example.de/acme-datenleck",
        title: "Acme meldet ein Datenleck bei Kunden für 5 € \u4e2d\u6587",
        publishedAt: null,
        domain: "",
        language: "German",
      },
    ];

    expect(await readCachedGdeltIndex(cache, requestUrl)).toBeNull();
    cacheGdeltIndex(cache, requestUrl, articles);
    // The write is not waited for by the caller; give it a moment to reach Redis.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await readCachedGdeltIndex(cache, requestUrl)).toEqual(articles);
  });
});
