jest.setTimeout(30000);

/**
 * The spacer that every worker shares, on a real Redis (M2 Task 4).
 *
 * The unit tests answer for the script, so only this test shows what the script does: the window,
 * the order of the turns, a refusal that takes no place, two workers on one key, and how long the
 * window is kept.
 *
 * `./setup` is deliberately NOT imported: it replaces the Redis client with a mock. Redis is the one
 * that REDIS_URL names (the integration wrapper points it at the throwaway instance). Every key the
 * test writes is removed again.
 */
import IORedis from "ioredis";
import redisClient, { REDIS_URL } from "../../database/redis";
import {
  applicationRedis,
  createSharedSpacer,
} from "../../services/vendorResearch/records/sharedSpacer";
import type { SpacerLimits } from "../../services/vendorResearch/records/spacer";

const written: string[] = [];

/** A window that no other execution of the test has used. */
function keyOf(name: string): string {
  const key = `vrdb:spacer:test:${name}:${process.pid}:${Date.now()}`;
  written.push(key, `${key}:seq`);
  return key;
}

/** A spacer of the application's client whose waits are noted instead of slept. */
function spacerOf(limits: SpacerLimits, key: string, slept: number[] = []) {
  return createSharedSpacer(limits, {
    redis: applicationRedis,
    key,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
}

const signal = () => new AbortController().signal;

beforeAll(async () => {
  // Without a Redis to talk to, this is the hook that times out.
  await redisClient.ping();
}, 10000);

afterAll(async () => {
  if (written.length > 0) await redisClient.del(...written);
  await redisClient.quit();
});

describe("the shared spacer on a real Redis", () => {
  it("four turns start at once and the fifth waits for the window", async () => {
    const key = keyOf("five");
    const slept: number[] = [];
    const spacer = spacerOf({ limit: 4, windowMs: 400, maxWaitMs: 1_000 }, key, slept);

    const turns = await Promise.all([1, 2, 3, 4, 5].map(() => spacer(signal())));

    expect(turns).toEqual([true, true, true, true, true]);
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(300);
    expect(slept[0]).toBeLessThanOrEqual(400);
    expect(await redisClient.zcard(key)).toBe(5);
  });

  it("two spacers on one key share the window", async () => {
    const key = keyOf("two");
    const limits = { limit: 2, windowMs: 400, maxWaitMs: 1_000 };
    const slept: number[] = [];
    // Another worker: a connection and a spacer of its own, on the same key.
    const other = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    try {
      const mine = spacerOf(limits, key);
      const theirs = createSharedSpacer(limits, {
        redis: other,
        key,
        sleep: async (ms) => {
          slept.push(ms);
        },
      });

      expect([await mine(signal()), await mine(signal())]).toEqual([true, true]);
      expect(await theirs(signal())).toBe(true);

      expect(slept).toHaveLength(1);
      expect(slept[0]).toBeGreaterThan(300);
      expect(slept[0]).toBeLessThanOrEqual(400);
    } finally {
      await other.quit();
    }
  });

  it("a turn further than maxWait is refused and takes no place", async () => {
    const key = keyOf("refused");
    const slept: number[] = [];
    const spacer = spacerOf({ limit: 1, windowMs: 400, maxWaitMs: 100 }, key, slept);

    expect(await spacer(signal())).toBe(true);
    expect(await spacer(signal())).toBe(false);

    expect(slept).toEqual([]);
    expect(await redisClient.zcard(key)).toBe(1);
  });

  it("drops a start that has left the window while the window is still in use", async () => {
    const key = keyOf("left");
    const slept: number[] = [];
    const spacer = spacerOf({ limit: 2, windowMs: 400, maxWaitMs: 1_000 }, key, slept);
    const pause = () => new Promise((resolve) => setTimeout(resolve, 250));

    // The first start leaves the window before the third turn; the second keeps the window alive.
    expect(await spacer(signal())).toBe(true);
    await pause();
    expect(await spacer(signal())).toBe(true);
    await pause();
    expect(await spacer(signal())).toBe(true);

    expect(slept).toEqual([]);
    expect(await redisClient.zcard(key)).toBe(2);
  });

  it("keeps the window until its newest start has left it, though that is more than twice the window", async () => {
    const key = keyOf("kept");
    const slept: number[] = [];
    // The SEC's shape: a window shorter than the most a turn may wait.
    const spacer = spacerOf({ limit: 1, windowMs: 400, maxWaitMs: 1_000 }, key, slept);

    await Promise.all([1, 2, 3].map(() => spacer(signal())));

    // The third turn starts about 800 ms from now and counts for 400 ms more.
    expect(slept).toHaveLength(2);
    expect(slept[1]).toBeGreaterThan(700);
    for (const kept of [key, `${key}:seq`]) {
      const ttl = await redisClient.pttl(kept);
      expect(ttl).toBeGreaterThan(1_100);
      expect(ttl).toBeLessThanOrEqual(1_200);
    }
  });
});
