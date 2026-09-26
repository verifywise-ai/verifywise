/**
 * Rate-limiter verification suite — store contract, and the shared-state gap.
 *
 * Every limiter's counters live in a store. VerifyWise passes no `store` option, so
 * all seven use express-rate-limit's default `MemoryStore`: in-process, per-limiter,
 * and gone on restart.
 *
 * This file does two jobs.
 *
 * 1. It pins the behaviour a rate-limit store must have, written against the `Store`
 *    interface rather than against MemoryStore, and parameterised over a list of
 *    stores. When a shared store lands, adding one entry to STORES runs the whole
 *    contract against it — the Redis case costs one line, not a new file.
 *
 * 2. It asserts the CURRENT, KNOWN-DEFICIENT behaviour on purpose, so the gap is
 *    visible in CI output instead of being silently absent. "State survives restart"
 *    is not a test that can pass today; pretending otherwise with a skipped test
 *    would read as coverage.
 *
 * The gap is a production issue, not a test issue, and is tracked separately as
 * "New #2" in .claude/plans/remaining-followups.md (multi-replica rate limiting,
 * blocked on a Redis-backed store).
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { MemoryStore, Options, Store } from "express-rate-limit";

jest.mock("../../../utils/logger/fileLogger", () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

import { buildRateLimitConfigs, createRateLimiter } from "../../../middleware/rateLimit.middleware";
import { advancePastWindow, createLimitedApp, freezeClock, get } from "./helpers";

const WINDOW_MINUTES = 1;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

/**
 * The stores the contract below is run against.
 *
 * To cover a shared store, add an entry — e.g.
 *   { name: "RedisStore", create: () => new RedisStore({ sendCommand: ... }) }
 * — and every test in the contract block runs against it unchanged.
 */
const STORES: Array<{ name: string; create: () => Store }> = [
  { name: "MemoryStore", create: () => new MemoryStore() },
];

describe.each(STORES)("$name satisfies the rate-limit store contract", ({ create }) => {
  let store: Store;

  beforeEach(() => {
    store = create();
    store.init?.({ windowMs: WINDOW_MS } as Options);
  });

  afterEach(async () => {
    await store.shutdown?.();
    jest.useRealTimers();
  });

  it("counts hits for a key monotonically from one", async () => {
    expect((await store.increment("client-a")).totalHits).toBe(1);
    expect((await store.increment("client-a")).totalHits).toBe(2);
    expect((await store.increment("client-a")).totalHits).toBe(3);
  });

  it("counts each key independently", async () => {
    await store.increment("client-a");
    await store.increment("client-a");

    // The whole premise of per-client limiting: one client's spend must not
    // appear in another's budget.
    expect((await store.increment("client-b")).totalHits).toBe(1);
    expect((await store.increment("client-a")).totalHits).toBe(3);
  });

  it("reports a resetTime one window ahead and holds it steady within the window", async () => {
    freezeClock();
    const start = Date.now();

    const first = await store.increment("client-a");
    expect(first.resetTime?.getTime()).toBe(start + WINDOW_MS);

    // A later hit in the same window must not push the reset further out — a
    // sliding reset would let a persistent attacker lock a shared IP out forever.
    jest.setSystemTime(start + WINDOW_MS / 2);
    const second = await store.increment("client-a");
    expect(second.resetTime?.getTime()).toBe(start + WINDOW_MS);
  });

  it("starts a fresh count once the window has elapsed", async () => {
    freezeClock();
    await store.increment("client-a");
    await store.increment("client-a");

    advancePastWindow(WINDOW_MINUTES);

    const afterWindow = await store.increment("client-a");
    expect(afterWindow.totalHits).toBe(1);
  });

  it("gives a hit back on decrement without going negative", async () => {
    // decrement is what skipFailedRequests / skipSuccessfulRequests rely on; an
    // underflow there would hand a client an unbounded budget.
    await store.increment("client-a");
    await store.decrement("client-a");
    await store.decrement("client-a");
    await store.decrement("client-a");

    expect((await store.increment("client-a")).totalHits).toBe(1);
  });

  it("clears exactly one key on resetKey", async () => {
    await store.increment("client-a");
    await store.increment("client-b");

    await store.resetKey("client-a");

    expect((await store.increment("client-a")).totalHits).toBe(1);
    expect((await store.increment("client-b")).totalHits).toBe(2);
  });

  it("clears every key on resetAll", async () => {
    await store.increment("client-a");
    await store.increment("client-b");

    await store.resetAll?.();

    expect((await store.increment("client-a")).totalHits).toBe(1);
    expect((await store.increment("client-b")).totalHits).toBe(1);
  });
});

/**
 * KNOWN GAP — read this before trusting a limit.
 *
 * Nothing below is an aspiration; it is what the platform does today, asserted so
 * that the day it changes, these tests fail and someone updates the claim.
 *
 * Consequence: a configured limit is a PER-PROCESS limit. Two backend replicas
 * behind a load balancer enforce 2x the configured limit between them, N replicas
 * enforce Nx, and every counter resets on deploy or restart. For authLimiter that
 * means a documented 5-attempts-per-15-minutes is really 5 x replicas, refreshed on
 * every rollout.
 *
 * Fixing it is a production change — a shared (Redis) store — not a test change.
 * Tracked as "New #2" in .claude/plans/remaining-followups.md.
 */
describe("known gap: limiter state is per-process until a shared store exists", () => {
  it("declares its own keys local to the instance", () => {
    const store = new MemoryStore();

    // express-rate-limit exposes this flag specifically so double-counting
    // misconfigurations can be detected. true means: these counters are not
    // shared with anything.
    expect(store.localKeys).toBe(true);

    store.shutdown();
  });

  it("does not share counters between two limiters built from the same config", async () => {
    // Stands in for two replicas of the backend, or the same process before and
    // after a restart: same config, same client IP, separate budgets.
    const config = buildRateLimitConfigs(false).auth;
    const replicaOne = createLimitedApp(createRateLimiter(config));
    const replicaTwo = createLimitedApp(createRateLimiter(config));
    const CLIENT = "203.0.113.77";

    try {
      for (let n = 0; n < config.maxRequests; n++) {
        expect((await get(replicaOne, CLIENT)).status).toBe(200);
      }
      expect((await get(replicaOne, CLIENT)).status).toBe(429);

      // Same client, same nominal 5-per-15-minutes limit, five more attempts.
      // This is the gap: the second replica has never heard of this client.
      const onReplicaTwo = await get(replicaTwo, CLIENT);
      expect(onReplicaTwo.status).toBe(200);
      expect(onReplicaTwo.headers["ratelimit-remaining"]).toBe(String(config.maxRequests - 1));
    } finally {
      await replicaOne.close();
      await replicaTwo.close();
    }
  });

  it("lets a client through 2x the configured limit across two instances", async () => {
    // The quantified version of the test above, because "roughly doubled" and
    // "exactly doubled" are different conversations with a security reviewer.
    const config = buildRateLimitConfigs(false).auth;
    const replicas = [
      createLimitedApp(createRateLimiter(config)),
      createLimitedApp(createRateLimiter(config)),
    ];
    const CLIENT = "203.0.113.88";

    try {
      let allowed = 0;
      for (const replica of replicas) {
        for (let n = 0; n < config.maxRequests + 1; n++) {
          if ((await get(replica, CLIENT)).status === 200) allowed++;
        }
      }

      expect(config.maxRequests).toBe(5);
      expect(allowed).toBe(config.maxRequests * replicas.length); // 10, not 5
    } finally {
      await Promise.all(replicas.map((replica) => replica.close()));
    }
  });
});
