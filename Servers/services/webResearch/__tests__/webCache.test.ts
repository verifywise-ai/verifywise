import { PageReadError, type FetchedPage, type PageReader } from "../readPage";
import {
  CACHE_TIMEOUT_MS,
  CACHE_TTL_SECONDS,
  CacheKind,
  CacheOutcome,
  type GdeltArticle,
  MAX_ENTRY_BYTES,
  type RedisLike,
  type RobotsAnswer,
  cacheGdeltIndex,
  cacheRobots,
  createRedisWebCache,
  readCachedGdeltIndex,
  readCachedRobots,
  withPageCache,
  withSearchCache,
} from "../webCache";
import { SearchUnavailableError, withFallback } from "../providerSearch";
import {
  MAX_RESULTS,
  type SearchEngine,
  type SearchEngineId,
  type SearchKind,
  type SearchResult,
} from "../webSearch";
import { memoryCache, settle } from "./helpers/memoryCache";

/** A Redis that keeps its data in a map and remembers the commands it was given. */
function fakeRedis(overrides: Partial<RedisLike> = {}) {
  const data = new Map<string, string>();
  const sets: Array<{ key: string; value: string; mode: string; seconds: number }> = [];
  const redis = {
    status: "ready",
    get: jest.fn(async (key: string) => data.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, mode: "EX", seconds: number) => {
      sets.push({ key, value, mode, seconds });
      data.set(key, value);
      return "OK";
    }),
    ...overrides,
  } satisfies RedisLike;
  return { redis, data, sets };
}

function outcomesOf() {
  const seen: Array<[CacheKind, CacheOutcome]> = [];
  return {
    seen,
    onOutcome: (kind: CacheKind, outcome: CacheOutcome) => seen.push([kind, outcome]),
  };
}

const PAGE: FetchedPage = {
  url: "https://acme.com/trust",
  title: "Trust center",
  publishedAt: "2026-03-04T10:00:00.000Z",
  text: "We are SOC 2 certified.",
  links: [{ text: "Privacy", url: "https://acme.com/privacy" }],
  canonicalUrl: "https://acme.com/trust",
};

const RESULTS: SearchResult[] = [
  {
    title: "Acme fined by the regulator",
    url: "https://news.example.com/acme-fined",
    snippet: "The regulator fined Acme.",
    publishedAt: "2026-02-01T00:00:00.000Z",
    source: "Example News",
  },
  {
    title: "Acme trust center",
    url: "https://acme.com/trust",
    snippet: "Security at Acme.",
    publishedAt: null,
    source: null,
  },
];

const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=%22Acme%22%20AND%20breach&mode=artlist&format=json&maxrecords=250";

const ARTICLES: GdeltArticle[] = [
  {
    url: "https://news.example.com/acme-confirms-breach",
    title: "Acme confirms a breach of its support system",
    publishedAt: "2026-10-25T10:00:00.000Z",
    domain: "news.example.com",
    language: "English",
  },
  {
    url: "https://nachrichten.example.de/acme-datenleck",
    title: "Acme meldet ein Datenleck",
    publishedAt: null,
    domain: "",
    language: "German",
  },
];

describe("createRedisWebCache", () => {
  it("answers what was stored, and counts a hit", async () => {
    const { redis } = fakeRedis();
    const { seen, onOutcome } = outcomesOf();
    const cache = createRedisWebCache(() => redis, { onOutcome });

    await cache.set("page", "https://acme.com/trust", "stored");

    expect(await cache.get("page", "https://acme.com/trust")).toBe("stored");
    expect(seen).toEqual([["page", "hit"]]);
  });

  it("answers null for a key it does not hold, and counts a miss", async () => {
    const { redis } = fakeRedis();
    const { seen, onOutcome } = outcomesOf();
    const cache = createRedisWebCache(() => redis, { onOutcome });

    expect(await cache.get("search", "news\nacme data breach")).toBeNull();
    expect(seen).toEqual([["search", "miss"]]);
  });

  it("keeps the key out of Redis: it is hashed, under the namespace of its kind", async () => {
    const { redis, sets } = fakeRedis();
    const cache = createRedisWebCache(() => redis);

    await cache.set("page", "https://acme.com/secret-path?token=abc", "x");
    await cache.set("search", "https://acme.com/secret-path?token=abc", "x");

    expect(sets[0].key).toMatch(/^vr:web:v1:page:[0-9a-f]{64}$/);
    expect(sets[1].key).toMatch(/^vr:web:v1:search:[0-9a-f]{64}$/);
    expect(sets[0].key).not.toContain("acme");
    // The same text under two kinds is two entries.
    expect(sets[0].key).not.toBe(sets[1].key);
  });

  it("keeps the request address of a GDELT index out of Redis too, under the kind gdelt", async () => {
    const { redis, sets } = fakeRedis();
    const cache = createRedisWebCache(() => redis);

    await cache.set("gdelt", GDELT_URL, "[]");

    expect(sets[0].key).toMatch(/^vr:web:v1:gdelt:[0-9a-f]{64}$/);
    expect(sets[0].key).not.toContain("gdeltproject");
  });

  it("names no organization in a key: what it holds is public and shared by all of them", async () => {
    const { redis, sets } = fakeRedis();
    const cache = createRedisWebCache(() => redis);

    await cache.set("robots", "https://acme.com", "x");

    expect(sets[0].key).not.toMatch(/org|tenant/i);
  });

  it.each([
    ["robots", 86_400],
    ["page", 900],
    ["search", 600],
    ["gdelt", 3_600],
  ] as const)("lets a %s entry live for %i seconds", async (kind, seconds) => {
    const { redis, sets } = fakeRedis();
    const cache = createRedisWebCache(() => redis);

    await cache.set(kind, "key", "value");

    expect(CACHE_TTL_SECONDS[kind]).toBe(seconds);
    expect(sets).toEqual([expect.objectContaining({ mode: "EX", seconds })]);
  });

  it("does not store a value over the size of its kind, and stores one of exactly that size", async () => {
    const { redis, sets } = fakeRedis();
    const cache = createRedisWebCache(() => redis);

    await cache.set("search", "too big", "x".repeat(MAX_ENTRY_BYTES.search + 1));
    await cache.set("search", "just fits", "x".repeat(MAX_ENTRY_BYTES.search));

    expect(sets).toHaveLength(1);
    expect(sets[0].value).toHaveLength(MAX_ENTRY_BYTES.search);
  });

  it("lets a GDELT index take 262,144 bytes, four times what a search answer may take", async () => {
    const { redis, sets } = fakeRedis();
    const cache = createRedisWebCache(() => redis);

    await cache.set("gdelt", "too big", "x".repeat(MAX_ENTRY_BYTES.gdelt + 1));
    await cache.set("gdelt", "just fits", "x".repeat(MAX_ENTRY_BYTES.gdelt));

    expect(MAX_ENTRY_BYTES.gdelt).toBe(262_144);
    expect(sets).toHaveLength(1);
    expect(sets[0].value).toHaveLength(MAX_ENTRY_BYTES.gdelt);
  });

  it("measures a value in bytes, not in characters", async () => {
    const { redis, sets } = fakeRedis();
    const cache = createRedisWebCache(() => redis);

    // Three bytes a character: under the limit in characters, over it in bytes.
    await cache.set("robots", "key", "€".repeat(MAX_ENTRY_BYTES.robots / 2));

    expect(sets).toHaveLength(0);
  });

  it("does not hand a command to a Redis that is not ready, since the client would queue it for ever", async () => {
    const { redis } = fakeRedis({ status: "reconnecting" });
    const { seen, onOutcome } = outcomesOf();
    const cache = createRedisWebCache(() => redis, { onOutcome });

    expect(await cache.get("page", "key")).toBeNull();
    await cache.set("page", "key", "value");

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(seen).toEqual([
      ["page", "error"],
      ["page", "error"],
    ]);
  });

  it("answers null when Redis fails, and counts an error", async () => {
    const { redis } = fakeRedis({
      get: jest.fn(async () => {
        throw new Error("READONLY You can't write against a read only replica");
      }),
    });
    const { seen, onOutcome } = outcomesOf();
    const cache = createRedisWebCache(() => redis, { onOutcome });

    expect(await cache.get("robots", "https://acme.com")).toBeNull();
    expect(seen).toEqual([["robots", "error"]]);
  });

  it("does not throw when a write fails", async () => {
    const { redis } = fakeRedis({
      set: jest.fn(async () => {
        throw new Error("OOM command not allowed when used memory > 'maxmemory'");
      }),
    });
    const { seen, onOutcome } = outcomesOf();
    const cache = createRedisWebCache(() => redis, { onOutcome });

    await expect(cache.set("page", "key", "value")).resolves.toBeUndefined();
    expect(seen).toEqual([["page", "error"]]);
  });

  it("does not throw when the counter does", async () => {
    const { redis } = fakeRedis();
    const cache = createRedisWebCache(() => redis, {
      onOutcome: () => {
        throw new Error("exporter is down");
      },
    });

    await expect(cache.get("page", "key")).resolves.toBeNull();
    await expect(cache.set("page", "key", "value")).resolves.toBeUndefined();
  });

  describe("a Redis that does not answer", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("is given up on after the timeout, as a miss that is counted as an error", async () => {
      const { redis } = fakeRedis({ get: jest.fn(() => new Promise<string | null>(() => {})) });
      const { seen, onOutcome } = outcomesOf();
      const cache = createRedisWebCache(() => redis, { onOutcome });

      const answer = cache.get("page", "key");
      await jest.advanceTimersByTimeAsync(CACHE_TIMEOUT_MS - 1);
      expect(seen).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);

      expect(await answer).toBeNull();
      expect(seen).toEqual([["page", "error"]]);
    });

    it("lets a write go after the timeout without failing the caller", async () => {
      const { redis } = fakeRedis({ set: jest.fn(() => new Promise<unknown>(() => {})) });
      const cache = createRedisWebCache(() => redis);

      const written = cache.set("page", "key", "value");
      await jest.advanceTimersByTimeAsync(CACHE_TIMEOUT_MS);

      await expect(written).resolves.toBeUndefined();
    });

    it("gives up on a client that is slow to load, with the same timeout", async () => {
      const cache = createRedisWebCache(() => new Promise<RedisLike>(() => {}));

      const answer = cache.get("page", "key");
      await jest.advanceTimersByTimeAsync(CACHE_TIMEOUT_MS);

      expect(await answer).toBeNull();
    });
  });

  it("loads the client on first use and once, not when the cache is made", async () => {
    const { redis } = fakeRedis();
    const load = jest.fn(async () => redis);
    const cache = createRedisWebCache(load);
    expect(load).not.toHaveBeenCalled();

    await cache.get("page", "a");
    await cache.set("page", "a", "x");
    await cache.get("page", "b");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("treats a client that cannot be loaded as a Redis that fails", async () => {
    const { seen, onOutcome } = outcomesOf();
    const cache = createRedisWebCache(
      async () => {
        throw new Error("Cannot find module");
      },
      { onOutcome },
    );

    expect(await cache.get("page", "key")).toBeNull();
    await expect(cache.set("page", "key", "value")).resolves.toBeUndefined();
    expect(seen).toEqual([
      ["page", "error"],
      ["page", "error"],
    ]);
  });
});

describe("withSearchCache", () => {
  function engineAnswering(results: SearchResult[] | Error, id: SearchEngineId = "replay") {
    const search = jest.fn(async (): Promise<SearchResult[]> => {
      if (results instanceof Error) throw results;
      return results;
    });
    const engine: SearchEngine = {
      id,
      kinds: ["web", "news"],
      newsWindowMonths: null,
      search,
    };
    return { engine, search };
  }

  /** The key of an answer that is public: the engine, the kind of search and the words. */
  const publicKey = (id: SearchEngineId, kind: SearchKind, words: string) =>
    `${id}\n${kind}\n${words}`;
  /** The key of an answer bought with the key of an organization. */
  const boughtKey = (id: SearchEngineId, organizationId: number, kind: SearchKind, words: string) =>
    `${id}\norg:${organizationId}\n${kind}\n${words}`;

  it("reports the id, the kinds and the news window of the engine it wraps", () => {
    const { cache } = memoryCache();
    const engine: SearchEngine = {
      id: "gdelt",
      kinds: ["news"],
      newsWindowMonths: 3,
      search: async () => [],
    };

    const cached = withSearchCache(engine, cache);

    expect(cached.id).toBe("gdelt");
    expect(cached.kinds).toEqual(["news"]);
    expect(cached.newsWindowMonths).toBe(3);
  });

  it("reports them as the engine reports them now: a wrapper that falls back changes its kinds", () => {
    const { cache } = memoryCache();
    let live: Pick<SearchEngine, "id" | "kinds" | "newsWindowMonths"> = {
      id: "anthropic",
      kinds: ["web", "news"],
      newsWindowMonths: null,
    };
    const engine: SearchEngine = {
      get id() {
        return live.id;
      },
      get kinds() {
        return live.kinds;
      },
      get newsWindowMonths() {
        return live.newsWindowMonths;
      },
      search: async () => [],
    };
    const cached = withSearchCache(engine, cache);
    expect(cached.kinds).toEqual(["web", "news"]);

    live = { id: "gdelt", kinds: ["news"], newsWindowMonths: 3 };

    expect(cached.id).toBe("gdelt");
    expect(cached.kinds).toEqual(["news"]);
    expect(cached.newsWindowMonths).toBe(3);
  });

  it("asks the engine once and answers the same query from the cache the second time", async () => {
    const { cache } = memoryCache();
    const { engine, search } = engineAnswering(RESULTS);
    const cached = withSearchCache(engine, cache);

    const first = await cached.search("Acme data breach", "news");
    await settle();
    const second = await cached.search("Acme data breach", "news");

    expect(first).toEqual(RESULTS);
    expect(second).toEqual(RESULTS);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("takes another case and other spacing for the same query", async () => {
    const { cache } = memoryCache();
    const { engine, search } = engineAnswering(RESULTS);
    const cached = withSearchCache(engine, cache);

    await cached.search("Acme  Data Breach", "news");
    await settle();
    await cached.search("  acme data breach ", "news");

    expect(search).toHaveBeenCalledTimes(1);
  });

  it("keeps the two feeds apart, since they answer differently", async () => {
    const { cache } = memoryCache();
    const { engine, search } = engineAnswering(RESULTS);
    const cached = withSearchCache(engine, cache);

    await cached.search("Acme lawsuit", "news");
    await settle();
    await cached.search("Acme lawsuit", "web");

    expect(search).toHaveBeenCalledTimes(2);
  });

  it("keeps an empty answer: nothing found is an answer", async () => {
    const { cache } = memoryCache();
    const { engine, search } = engineAnswering([]);
    const cached = withSearchCache(engine, cache);

    await cached.search("Acme fined", "news");
    await settle();

    expect(await cached.search("Acme fined", "news")).toEqual([]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("passes a failure on and keeps nothing, so that the next search asks again", async () => {
    const { cache, writes } = memoryCache();
    const failure = new Error("The search is not available right now");
    const { engine, search } = engineAnswering(failure);
    const cached = withSearchCache(engine, cache);

    await expect(cached.search("Acme data breach", "news")).rejects.toBe(failure);
    await settle();
    await expect(cached.search("Acme data breach", "news")).rejects.toBe(failure);

    expect(writes).toEqual([]);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("passes the signal to the engine on a miss", async () => {
    const { cache } = memoryCache();
    const { engine, search } = engineAnswering(RESULTS);
    const signal = new AbortController().signal;

    await withSearchCache(engine, cache).search("Acme", "web", signal);

    expect(search).toHaveBeenCalledWith("Acme", "web", signal);
  });

  it.each([
    ["text that is not JSON", "not json {"],
    ["JSON that is not a list", JSON.stringify({ title: "x" })],
    ["a list with an item that is not a result", JSON.stringify([{ title: 1 }])],
    [
      "a list with more results than the engine answers",
      JSON.stringify(Array(MAX_RESULTS + 1).fill(RESULTS[0])),
    ],
    [
      "a result whose address is not public",
      JSON.stringify([{ ...RESULTS[0], url: "http://169.254.169.254/latest/meta-data" }]),
    ],
    ["a result whose address is not an address", JSON.stringify([{ ...RESULTS[0], url: "nope" }])],
    [
      "a result with a date that is not a date or null",
      JSON.stringify([{ ...RESULTS[0], publishedAt: 5 }]),
    ],
  ])("asks the engine again for an entry that holds %s", async (_name, entry) => {
    const { cache, seed, store } = memoryCache();
    seed("search", publicKey("replay", "news", "acme data breach"), entry);
    const { engine, search } = engineAnswering(RESULTS);

    const answer = await withSearchCache(engine, cache).search("Acme data breach", "news");
    await settle();

    expect(answer).toEqual(RESULTS);
    expect(search).toHaveBeenCalledTimes(1);
    // The bad entry is replaced by the answer.
    expect(
      JSON.parse(store.get(`search\n${publicKey("replay", "news", "acme data breach")}`) as string),
    ).toEqual(RESULTS);
  });

  it("keeps a list as long as the engine can answer", async () => {
    const { cache, seed } = memoryCache();
    const full = Array(MAX_RESULTS).fill(RESULTS[0]);
    seed("search", publicKey("replay", "web", "acme"), JSON.stringify(full));
    const { engine, search } = engineAnswering([]);

    expect(await withSearchCache(engine, cache).search("Acme", "web")).toEqual(full);
    expect(search).not.toHaveBeenCalled();
  });

  it("does not use the cache for a query with nothing in it", async () => {
    const { cache, reads, writes } = memoryCache();
    const { engine, search } = engineAnswering([]);

    await withSearchCache(engine, cache).search("   ", "web");
    await settle();

    expect(search).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("is not slowed down by a write: the answer does not wait for the cache to take it", async () => {
    const { engine } = engineAnswering(RESULTS);
    const never = { get: async () => null, set: () => new Promise<void>(() => {}) };

    await expect(withSearchCache(engine, never).search("Acme", "web")).resolves.toEqual(RESULTS);
  });

  it("is not broken by a cache that rejects", async () => {
    const { engine } = engineAnswering(RESULTS);
    const broken = {
      get: async (): Promise<string | null> => {
        throw new Error("broken");
      },
      set: async (): Promise<void> => {
        throw new Error("broken");
      },
    };

    await expect(withSearchCache(engine, broken).search("Acme", "web")).resolves.toEqual(RESULTS);
    await settle();
  });

  describe("whose answer it is", () => {
    const OTHER_RESULTS: SearchResult[] = [
      {
        title: "Acme named in a roundup",
        url: "https://other.example.org/roundup",
        snippet: "",
        publishedAt: null,
        source: null,
      },
    ];
    const QUERY = "Acme data breach";
    const WORDS = "acme data breach";

    it("puts the engine in the key, so that the answers of two engines never mix", async () => {
      const { cache, writes } = memoryCache();
      const gdelt = engineAnswering(RESULTS, "gdelt");
      const replay = engineAnswering(OTHER_RESULTS, "replay");

      await withSearchCache(gdelt.engine, cache).search(QUERY, "news");
      await settle();
      const answer = await withSearchCache(replay.engine, cache).search(QUERY, "news");
      await settle();

      expect(answer).toEqual(OTHER_RESULTS);
      expect(replay.search).toHaveBeenCalledTimes(1);
      expect(writes.map((write) => write.key)).toEqual([
        publicKey("gdelt", "news", WORDS),
        publicKey("replay", "news", WORDS),
      ]);
    });

    it("lets the engines of one id share an answer, as the runs of a process do", async () => {
      const { cache } = memoryCache();
      const earlier = engineAnswering(RESULTS, "gdelt");
      const later = engineAnswering(OTHER_RESULTS, "gdelt");

      await withSearchCache(earlier.engine, cache).search(QUERY, "news");
      await settle();
      const answer = await withSearchCache(later.engine, cache).search(QUERY, "news");

      expect(answer).toEqual(RESULTS);
      expect(later.search).not.toHaveBeenCalled();
    });

    it("keeps the answer of a search bought with the key of an organization under that organization", async () => {
      const { cache, writes } = memoryCache();
      const { engine } = engineAnswering(RESULTS, "anthropic");

      await withSearchCache(engine, cache, { organizationId: 7 }).search(QUERY, "news");
      await settle();

      expect(writes.map((write) => write.key)).toEqual([boughtKey("anthropic", 7, "news", WORDS)]);
    });

    it("serves that answer to the same organization again, and to no other", async () => {
      const { cache } = memoryCache();
      const bought = engineAnswering(RESULTS, "anthropic");
      await withSearchCache(bought.engine, cache, { organizationId: 7 }).search(QUERY, "news");
      await settle();

      const again = engineAnswering([], "anthropic");
      const sameOrganization = await withSearchCache(again.engine, cache, {
        organizationId: 7,
      }).search(QUERY, "news");
      const another = engineAnswering(OTHER_RESULTS, "anthropic");
      const otherOrganization = await withSearchCache(another.engine, cache, {
        organizationId: 8,
      }).search(QUERY, "news");

      expect(sameOrganization).toEqual(RESULTS);
      expect(again.search).not.toHaveBeenCalled();
      // The other organization did not pay for it: its own key is asked.
      expect(otherOrganization).toEqual(OTHER_RESULTS);
      expect(another.search).toHaveBeenCalledTimes(1);
    });

    it("does not serve the answer of an organization to a search that has no organization", async () => {
      const { cache } = memoryCache();
      const bought = engineAnswering(RESULTS, "anthropic");
      await withSearchCache(bought.engine, cache, { organizationId: 7 }).search(QUERY, "news");
      await settle();
      const unscoped = engineAnswering(OTHER_RESULTS, "anthropic");

      const answer = await withSearchCache(unscoped.engine, cache).search(QUERY, "news");

      expect(answer).toEqual(OTHER_RESULTS);
      expect(unscoped.search).toHaveBeenCalledTimes(1);
    });

    it("does not serve it to the public engine that has the same words either", async () => {
      const { cache } = memoryCache();
      const bought = engineAnswering(RESULTS, "anthropic");
      await withSearchCache(bought.engine, cache, { organizationId: 7 }).search(QUERY, "news");
      await settle();
      const gdelt = engineAnswering(OTHER_RESULTS, "gdelt");

      const answer = await withSearchCache(gdelt.engine, cache, { organizationId: 7 }).search(
        QUERY,
        "news",
      );

      expect(answer).toEqual(OTHER_RESULTS);
    });

    it("scopes the search of OpenAI the same way", async () => {
      const { cache, writes } = memoryCache();
      const { engine } = engineAnswering(RESULTS, "openai");

      await withSearchCache(engine, cache, { organizationId: 12 }).search(QUERY, "web");
      await settle();

      expect(writes.map((write) => write.key)).toEqual([boughtKey("openai", 12, "web", WORDS)]);
    });

    it("keeps a provider's answer for the web apart from its answer for the news, in one organization", async () => {
      const { cache } = memoryCache();
      const { engine, search } = engineAnswering(RESULTS, "anthropic");
      const cached = withSearchCache(engine, cache, { organizationId: 7 });

      await cached.search(QUERY, "news");
      await settle();
      await cached.search(QUERY, "web");

      expect(search).toHaveBeenCalledTimes(2);
    });

    it("does not read or write the cache for a provider's search when it is told no organization", async () => {
      // A key with no owner would be shared by all of them, which is what the scope exists to stop.
      const { cache, reads, writes } = memoryCache();
      const { engine, search } = engineAnswering(RESULTS, "anthropic");
      const cached = withSearchCache(engine, cache);

      await cached.search(QUERY, "news");
      await settle();
      await cached.search(QUERY, "news");
      await settle();

      expect(search).toHaveBeenCalledTimes(2);
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
    });

    it.each([
      ["zero", 0],
      ["a negative number", -3],
      ["a fraction", 1.5],
      ["not a number", Number.NaN],
      ["infinite", Number.POSITIVE_INFINITY],
      ["a text", "7"],
      ["null", null],
    ])("takes an organization id that is %s for none", async (_name, organizationId) => {
      const { cache, reads, writes } = memoryCache();
      const { engine, search } = engineAnswering(RESULTS, "anthropic");

      await withSearchCache(engine, cache, { organizationId: organizationId as never }).search(
        QUERY,
        "news",
      );
      await settle();

      expect(search).toHaveBeenCalledTimes(1);
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
    });

    it("leaves the organization out of the key of an engine whose answers are public", async () => {
      const { cache, writes } = memoryCache();
      const one = engineAnswering(RESULTS, "gdelt");
      const another = engineAnswering(OTHER_RESULTS, "gdelt");

      await withSearchCache(one.engine, cache, { organizationId: 7 }).search(QUERY, "news");
      await settle();
      const answer = await withSearchCache(another.engine, cache, { organizationId: 8 }).search(
        QUERY,
        "news",
      );

      expect(writes.map((write) => write.key)).toEqual([publicKey("gdelt", "news", WORDS)]);
      expect(answer).toEqual(RESULTS);
      expect(another.search).not.toHaveBeenCalled();
    });

    it("keeps the spelling of the query out of the key of a provider's answer, as for any engine", async () => {
      const { cache } = memoryCache();
      const { engine, search } = engineAnswering(RESULTS, "anthropic");
      const cached = withSearchCache(engine, cache, { organizationId: 7 });

      await cached.search("Acme  Data Breach", "news");
      await settle();
      await cached.search("  acme data breach ", "news");

      expect(search).toHaveBeenCalledTimes(1);
    });

    describe("an engine that changes while the cache is in front of it", () => {
      /** An engine whose id changes when its search is under way, as a wrapper does when it falls back. */
      function switching(from: SearchEngineId, to: SearchEngineId, results: SearchResult[]) {
        let live: SearchEngineId = from;
        const search = jest.fn(async (): Promise<SearchResult[]> => {
          live = to;
          return results;
        });
        const engine: SearchEngine = {
          get id() {
            return live;
          },
          kinds: ["web", "news"],
          newsWindowMonths: null,
          search,
        };
        return { engine, search };
      }

      it("does not keep the answer of the engine that took over under the key of the engine that was asked", async () => {
        const { cache, writes } = memoryCache();
        const { engine } = switching("anthropic", "gdelt", OTHER_RESULTS);

        await withSearchCache(engine, cache, { organizationId: 7 }).search(QUERY, "news");
        await settle();

        // Neither under the organization's key, where it would be served as the provider's answer,
        // nor under the key of the engine that answered, which this search did not look up.
        expect(writes).toEqual([]);
      });

      it("looks up and keeps under the id of the engine that answers now", async () => {
        const { cache, writes } = memoryCache();
        const { engine } = switching("anthropic", "gdelt", OTHER_RESULTS);
        const cached = withSearchCache(engine, cache, { organizationId: 7 });
        await cached.search(QUERY, "news");

        await cached.search("Acme lawsuit", "news");
        await settle();

        expect(writes.map((write) => write.key)).toEqual([
          publicKey("gdelt", "news", "acme lawsuit"),
        ]);
      });

      it("keeps nothing for the search that made a real wrapper fall back, so the fallback's answer is not filed under the organization", async () => {
        const { cache, writes } = memoryCache();
        const refused = engineAnswering(new SearchUnavailableError(), "anthropic");
        const fallback: SearchEngine = {
          id: "gdelt",
          kinds: ["news"],
          newsWindowMonths: 3,
          search: jest.fn(async () => OTHER_RESULTS),
        };
        const cached = withSearchCache(withFallback(refused.engine, fallback), cache, {
          organizationId: 7,
        });

        const answer = await cached.search(QUERY, "news");
        await settle();

        expect(answer).toEqual(OTHER_RESULTS);
        // The key was built for the provider before the search, and the search was answered by the
        // fallback: nothing is kept, rather than the fallback's answer under the provider's key.
        expect(writes).toEqual([]);
        expect(cached.id).toBe("gdelt");
      });
    });
  });
});

describe("withPageCache", () => {
  function readerAnswering(page: FetchedPage | Error) {
    const read = jest.fn(async (): Promise<FetchedPage> => {
      if (page instanceof Error) throw page;
      return page;
    });
    return { read: read as unknown as PageReader, mock: read };
  }

  it("reads a page once and answers the second read from the cache, whole", async () => {
    const { cache } = memoryCache();
    const { read, mock } = readerAnswering(PAGE);
    const cached = withPageCache(read, cache);

    const first = await cached("https://acme.com/trust");
    await settle();
    const second = await cached("https://acme.com/trust");

    expect(first).toEqual(PAGE);
    expect(second).toEqual(PAGE);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("keeps the address that answered, which is not always the one asked for", async () => {
    const { cache } = memoryCache();
    const moved = { ...PAGE, url: "https://www.acme.com/security" };
    const { read } = readerAnswering(moved);
    const cached = withPageCache(read, cache);

    await cached("https://acme.com/trust");
    await settle();

    expect((await cached("https://acme.com/trust")).url).toBe("https://www.acme.com/security");
  });

  it("takes another case of the host, a default port and a fragment for the same page", async () => {
    const { cache } = memoryCache();
    const { read, mock } = readerAnswering(PAGE);
    const cached = withPageCache(read, cache);

    await cached("https://acme.com/trust");
    await settle();
    await cached("HTTPS://ACME.com:443/trust#soc2");

    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("keeps what the page says about itself", async () => {
    const { cache } = memoryCache();
    const identified: FetchedPage = {
      ...PAGE,
      identity: { names: ["Acme", "Acme Analytics"], products: ["Acme Vault"] },
    };
    const { read, mock } = readerAnswering(identified);
    const cached = withPageCache(read, cache);

    await cached("https://acme.com/trust");
    await settle();
    const second = await cached("https://acme.com/trust");

    expect(second).toEqual(identified);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the identity of a stored page from its names and products only", async () => {
    const { cache, seed } = memoryCache();
    seed(
      "page",
      "https://acme.com/trust",
      JSON.stringify({
        ...PAGE,
        identity: { names: ["Acme"], products: ["Acme Vault"], injected: "x" },
      }),
    );
    const { read, mock } = readerAnswering(PAGE);

    const page = await withPageCache(read, cache)("https://acme.com/trust");

    expect(mock).not.toHaveBeenCalled();
    expect(page.identity).toStrictEqual({ names: ["Acme"], products: ["Acme Vault"] });
  });

  it("keeps two pages, and the same path with another query, apart", async () => {
    const { cache } = memoryCache();
    const { read, mock } = readerAnswering(PAGE);
    const cached = withPageCache(read, cache);

    await cached("https://acme.com/trust");
    await settle();
    await cached("https://acme.com/privacy");
    await cached("https://acme.com/trust?lang=de");

    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("passes a failed read on as it is and keeps nothing", async () => {
    const { cache, writes } = memoryCache();
    const failure = new PageReadError("not_found");
    const { read, mock } = readerAnswering(failure);
    const cached = withPageCache(read, cache);

    await expect(cached("https://acme.com/gone")).rejects.toBe(failure);
    await settle();
    await expect(cached("https://acme.com/gone")).rejects.toBe(failure);

    expect(writes).toEqual([]);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("passes the signal to the reader on a miss", async () => {
    const { cache } = memoryCache();
    const { read, mock } = readerAnswering(PAGE);
    const signal = new AbortController().signal;

    await withPageCache(read, cache)("https://acme.com/trust", signal);

    expect(mock).toHaveBeenCalledWith("https://acme.com/trust", signal);
  });

  it("leaves a read whose signal has already aborted to the reader, which says so", async () => {
    const { cache, reads, seed } = memoryCache();
    seed("page", "https://acme.com/trust", JSON.stringify(PAGE));
    const aborted = new AbortController();
    aborted.abort();
    const failure = new PageReadError("unreachable");
    const { read, mock } = readerAnswering(failure);

    await expect(withPageCache(read, cache)("https://acme.com/trust", aborted.signal)).rejects.toBe(
      failure,
    );

    expect(mock).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([]);
  });

  it.each([
    ["text that is not JSON", "<html>"],
    ["JSON that is not a page", JSON.stringify([1, 2])],
    ["a page without text", JSON.stringify({ ...PAGE, text: undefined })],
    ["a page whose links are not a list", JSON.stringify({ ...PAGE, links: "x" })],
    ["a page with a link that has no address", JSON.stringify({ ...PAGE, links: [{ text: "x" }] })],
    [
      "a page that answered from an address that is not public",
      JSON.stringify({ ...PAGE, url: "http://localhost/" }),
    ],
    ["a page with a date that is not a date or null", JSON.stringify({ ...PAGE, publishedAt: 3 })],
    ["an identity that is not an object", JSON.stringify({ ...PAGE, identity: "Acme" })],
    [
      "an identity whose names are not a list",
      JSON.stringify({ ...PAGE, identity: { names: "Acme", products: [] } }),
    ],
    [
      "an identity with a name that is not a text",
      JSON.stringify({ ...PAGE, identity: { names: ["Acme", 3], products: [] } }),
    ],
    ["an identity without products", JSON.stringify({ ...PAGE, identity: { names: ["Acme"] } })],
    [
      "an identity whose products are not texts",
      JSON.stringify({ ...PAGE, identity: { names: [], products: [{}] } }),
    ],
  ])("reads the page again for an entry that holds %s", async (_name, entry) => {
    const { cache, seed, store } = memoryCache();
    seed("page", "https://acme.com/trust", entry);
    const { read, mock } = readerAnswering(PAGE);

    const page = await withPageCache(read, cache)("https://acme.com/trust");
    await settle();

    expect(page).toEqual(PAGE);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get("page\nhttps://acme.com/trust") as string)).toEqual(PAGE);
  });

  it("accepts a page with no canonical address and no links, as a plain text page is", async () => {
    const { cache, seed } = memoryCache();
    const plain: FetchedPage = {
      url: "https://acme.com/humans.txt",
      title: "",
      publishedAt: null,
      text: "We are Acme.",
      links: [],
      canonicalUrl: null,
    };
    seed("page", "https://acme.com/humans.txt", JSON.stringify(plain));
    const { read, mock } = readerAnswering(PAGE);

    expect(await withPageCache(read, cache)("https://acme.com/humans.txt")).toEqual(plain);
    expect(mock).not.toHaveBeenCalled();
  });

  it("reads an address that is not an address as the reader does, without the cache", async () => {
    const { cache, reads } = memoryCache();
    const failure = new PageReadError("not_allowed");
    const { read, mock } = readerAnswering(failure);

    await expect(withPageCache(read, cache)("not a url")).rejects.toBe(failure);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([]);
  });
});

describe("the answers of robots.txt", () => {
  it("are kept as a status and a text under the origin, for the kind robots", async () => {
    const { cache, writes } = memoryCache();

    cacheRobots(cache, "https://acme.com", { status: 200, text: "User-agent: *\nDisallow: /x" });
    await settle();

    expect(writes).toEqual([
      {
        kind: "robots",
        key: "https://acme.com",
        value: JSON.stringify({ status: 200, text: "User-agent: *\nDisallow: /x" }),
      },
    ]);
  });

  it.each<[RobotsAnswer]>([
    [{ status: 200, text: "User-agent: *\nDisallow: /x" }],
    [{ status: 404, text: "" }],
  ])("are read back as they were kept: %j", async (answer) => {
    const { cache } = memoryCache();
    cacheRobots(cache, "https://acme.com", answer);
    await settle();

    expect(await readCachedRobots(cache, "https://acme.com")).toEqual(answer);
  });

  it("are null when nothing is kept", async () => {
    const { cache } = memoryCache();

    expect(await readCachedRobots(cache, "https://acme.com")).toBeNull();
  });

  it.each([
    ["text that is not JSON", "nope"],
    ["a status other than 200 and 404", JSON.stringify({ status: 500, text: "" })],
    ["a text that is not text", JSON.stringify({ status: 200, text: 5 })],
    ["no text", JSON.stringify({ status: 200 })],
  ])("are null for an entry that holds %s", async (_name, entry) => {
    const { cache, seed } = memoryCache();
    seed("robots", "https://acme.com", entry);

    expect(await readCachedRobots(cache, "https://acme.com")).toBeNull();
  });
});

describe("the index of GDELT", () => {
  it("is kept as the list of its articles, under the address of the request, for the kind gdelt", async () => {
    const { cache, writes } = memoryCache();

    cacheGdeltIndex(cache, GDELT_URL, ARTICLES);
    await settle();

    expect(writes).toEqual([{ kind: "gdelt", key: GDELT_URL, value: JSON.stringify(ARTICLES) }]);
  });

  it.each<[string, GdeltArticle[]]>([
    ["articles", ARTICLES],
    ["no articles, which is an answer too", []],
  ])("is read back as it was kept: %s", async (_name, articles) => {
    const { cache } = memoryCache();
    cacheGdeltIndex(cache, GDELT_URL, articles);
    await settle();

    expect(await readCachedGdeltIndex(cache, GDELT_URL)).toEqual(articles);
  });

  it("is null when nothing is kept, and for the address of another request", async () => {
    const { cache } = memoryCache();
    expect(await readCachedGdeltIndex(cache, GDELT_URL)).toBeNull();

    cacheGdeltIndex(cache, GDELT_URL, ARTICLES);
    await settle();

    expect(await readCachedGdeltIndex(cache, `${GDELT_URL}&other=1`)).toBeNull();
  });

  it("is rebuilt from the known fields of each article only", async () => {
    const { cache, seed } = memoryCache();
    seed("gdelt", GDELT_URL, JSON.stringify([{ ...ARTICLES[0], injected: "x", socialimage: "y" }]));

    const [article] = (await readCachedGdeltIndex(cache, GDELT_URL)) as GdeltArticle[];

    expect(article).toStrictEqual(ARTICLES[0]);
  });

  it("holds as many articles as the request asks for: 250", async () => {
    const { cache } = memoryCache();
    const full = Array.from({ length: 250 }, (_, i) => ({
      ...ARTICLES[0],
      url: `https://news.example.com/story-${i}`,
    }));
    cacheGdeltIndex(cache, GDELT_URL, full);
    await settle();

    expect(await readCachedGdeltIndex(cache, GDELT_URL)).toEqual(full);
  });

  it.each([
    ["text that is not JSON", "<html>"],
    ["JSON that is not a list", JSON.stringify({ articles: [] })],
    ["more articles than the request asks for", JSON.stringify(Array(251).fill(ARTICLES[0]))],
    ["an item that is not an article", JSON.stringify([1])],
    ["an article without a title", JSON.stringify([{ ...ARTICLES[0], title: undefined }])],
    [
      "an article whose address is not public",
      JSON.stringify([{ ...ARTICLES[0], url: "http://169.254.169.254/latest/meta-data" }]),
    ],
    [
      "an article whose address is not an address",
      JSON.stringify([{ ...ARTICLES[0], url: "nope" }]),
    ],
    [
      "an article with a date that is not a date or null",
      JSON.stringify([{ ...ARTICLES[0], publishedAt: 5 }]),
    ],
    [
      "an article with a domain that is not a text",
      JSON.stringify([{ ...ARTICLES[0], domain: 7 }]),
    ],
    [
      "an article with a language that is not a text",
      JSON.stringify([{ ...ARTICLES[0], language: null }]),
    ],
  ])("is null for an entry that holds %s, which the next write replaces", async (_name, entry) => {
    const { cache, seed } = memoryCache();
    seed("gdelt", GDELT_URL, entry);

    expect(await readCachedGdeltIndex(cache, GDELT_URL)).toBeNull();
  });

  it("is null when the cache rejects", async () => {
    const broken = {
      get: async (): Promise<string | null> => {
        throw new Error("broken");
      },
      set: async (): Promise<void> => {
        throw new Error("broken");
      },
    };

    expect(await readCachedGdeltIndex(broken, GDELT_URL)).toBeNull();
    expect(() => cacheGdeltIndex(broken, GDELT_URL, ARTICLES)).not.toThrow();
    await settle();
  });

  it("is kept without waiting for the store", () => {
    const never = { get: async () => null, set: () => new Promise<void>(() => {}) };

    expect(cacheGdeltIndex(never, GDELT_URL, ARTICLES)).toBeUndefined();
  });
});
