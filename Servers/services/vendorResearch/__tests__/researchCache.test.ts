jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { RedisLike } from "../../webResearch/webCache";
import type { ResearchMetrics } from "../metrics";
import { createSharedWebCache, sharedWebCache } from "../researchCache";

function fakeRedis(overrides: Partial<RedisLike> = {}) {
  const data = new Map<string, string>();
  const redis: RedisLike = {
    status: "ready",
    get: jest.fn(async (key: string) => data.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
      return "OK";
    }),
    ...overrides,
  };
  return redis;
}

function fakeMetrics() {
  const lookups: Array<{ kind: string; outcome: string }> = [];
  const metrics = {
    cacheLookup: (lookup: { kind: string; outcome: string }) => lookups.push(lookup),
  } as unknown as ResearchMetrics;
  return { metrics, lookups };
}

describe("createSharedWebCache", () => {
  it("connects nothing until the first lookup, and then once", async () => {
    const load = jest.fn(async () => fakeRedis());
    const { metrics } = fakeMetrics();
    const cache = createSharedWebCache({ load, metrics, warn: jest.fn() });
    expect(load).not.toHaveBeenCalled();

    await cache.get("page", "https://acme.com/");
    await cache.get("page", "https://acme.com/trust");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("counts every lookup by kind and outcome", async () => {
    const { metrics, lookups } = fakeMetrics();
    const cache = createSharedWebCache({
      load: async () => fakeRedis(),
      metrics,
      warn: jest.fn(),
    });

    await cache.get("search", "news\nacme data breach");
    await cache.set("search", "news\nacme data breach", "[]");
    await cache.get("search", "news\nacme data breach");

    expect(lookups).toEqual([
      { kind: "search", outcome: "miss" },
      { kind: "search", outcome: "hit" },
    ]);
  });

  it("counts a store that fails as an error, and the run goes on with a miss", async () => {
    const { metrics, lookups } = fakeMetrics();
    const cache = createSharedWebCache({
      load: async () =>
        fakeRedis({
          get: jest.fn(async () => {
            throw new Error("ECONNRESET");
          }),
        }),
      metrics,
      warn: jest.fn(),
    });

    expect(await cache.get("robots", "https://acme.com")).toBeNull();
    expect(lookups).toEqual([{ kind: "robots", outcome: "error" }]);
  });

  it("says once a minute at most that the cache is not available, and names nothing", async () => {
    let clock = 1_000_000;
    const warn = jest.fn();
    const { metrics } = fakeMetrics();
    const cache = createSharedWebCache({
      load: async () => fakeRedis({ status: "reconnecting" }),
      metrics,
      warn,
      now: () => clock,
    });

    await cache.get("page", "https://acme.com/secret?token=abc");
    clock += 30_000;
    await cache.get("page", "https://acme.com/secret?token=abc");
    clock += 30_001;
    await cache.get("search", "news\nacme data breach");

    expect(warn).toHaveBeenCalledTimes(2);
    for (const [message] of warn.mock.calls) {
      expect(message).not.toMatch(/acme|secret|token|breach/i);
    }
  });

  it("does not warn when the lookups come out well", async () => {
    const warn = jest.fn();
    const { metrics } = fakeMetrics();
    const cache = createSharedWebCache({ load: async () => fakeRedis(), metrics, warn });

    await cache.get("page", "a");
    await cache.set("page", "a", "x");
    await cache.get("page", "a");

    expect(warn).not.toHaveBeenCalled();
  });

  it("does not fail when the counter does", async () => {
    const cache = createSharedWebCache({
      load: async () => fakeRedis(),
      metrics: {
        cacheLookup: () => {
          throw new Error("exporter is down");
        },
      } as unknown as ResearchMetrics,
      warn: jest.fn(),
    });

    await expect(cache.get("page", "a")).resolves.toBeNull();
  });
});

describe("sharedWebCache", () => {
  it("is one cache for the whole process", () => {
    expect(sharedWebCache()).toBe(sharedWebCache());
  });
});
