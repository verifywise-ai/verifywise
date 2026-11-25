/**
 * The cache that vendor research runs share: the application's Redis behind the web cache of the
 * toolkit (see webResearch/webCache.ts), with every lookup counted and a store that fails noticed.
 *
 * The cache is public web content for all organizations, so nothing here knows an organization. The
 * one exception is the answer of a search that an organization paid for with its own key (Claude's
 * web search), which the toolkit's cache keeps for that organization alone (see
 * webResearch/webCache.ts `withSearchCache`); this module only counts the lookups. It connects on
 * its first lookup, not when it is made: a process that never researches never needs the client,
 * and the tests that build a researcher open no connection.
 */
import logger from "../../utils/logger/fileLogger";
import {
  type CacheKind,
  type CacheOutcome,
  type RedisLike,
  type WebCache,
  createRedisWebCache,
} from "../webResearch/webCache";
import { type ResearchMetrics, researchMetrics } from "./metrics";

/** The most often the log hears that the store is failing, since every lookup of a run would say so. */
const WARN_EVERY_MS = 60_000;

/**
 * @param deps.load Replaces the shared Redis client of the application, for tests.
 * @param deps.metrics Replaces the counters of the process, for tests.
 * @param deps.warn Replaces the log, for tests. It is given a fixed text: no key, no address.
 * @param deps.now Replaces the clock, for tests.
 */
export function createSharedWebCache(
  deps: {
    load?: () => Promise<RedisLike>;
    metrics?: ResearchMetrics;
    warn?: (message: string) => void;
    now?: () => number;
  } = {},
): WebCache {
  const load = deps.load ?? (async () => (await import("../../database/redis")).default);
  const warn = deps.warn ?? ((message: string) => logger.warn(message));
  const now = deps.now ?? Date.now;
  let lastWarningAt = Number.NEGATIVE_INFINITY;

  return createRedisWebCache(load, {
    onOutcome: (kind: CacheKind, outcome: CacheOutcome) => {
      try {
        (deps.metrics ?? researchMetrics()).cacheLookup({ kind, outcome });
      } catch {
        // A counter is not part of the cache.
      }
      if (outcome === "error" && now() - lastWarningAt >= WARN_EVERY_MS) {
        lastWarningAt = now();
        warn(
          "vendor research: the shared web cache is not available, so pages and searches are fetched again",
        );
      }
    },
  });
}

let shared: WebCache | undefined;

/** The cache of the process, built on first use. */
export function sharedWebCache(): WebCache {
  shared ??= createSharedWebCache();
  return shared;
}
