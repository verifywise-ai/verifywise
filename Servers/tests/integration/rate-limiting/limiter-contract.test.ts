/**
 * Rate-limiter verification suite — behavioural contract.
 *
 * Every limiter exported by middleware/rateLimit.middleware.ts is driven over real
 * HTTP at its PRODUCTION limits and checked for: correct draft-6 RateLimit-* headers
 * while under the limit, a 429 with the canonical envelope and a Retry-After once
 * over it, per-client key isolation (IPv4, IPv6 and MRM ingestion token), and a
 * counter that resets when the window rolls.
 *
 * Why production limits matter here: this process necessarily runs with
 * NODE_ENV=test, which relaxes authLimiter from 5/15min to 1000/15min. A suite that
 * used the ambient limiters would issue five login attempts, see five 200s, and pass
 * without ever reaching the limit it claims to verify. Every limiter below is
 * therefore built from `buildRateLimitConfigs(false)`, and every assertion pins the
 * exact `RateLimit-Limit` it expects — so a relaxed config fails the header
 * assertion before it ever reaches the 429.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { NextFunction, Request, Response } from "express";
import supertest from "supertest";

jest.mock("../../../utils/logger/fileLogger", () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

import { buildRateLimitConfigs, createRateLimiter } from "../../../middleware/rateLimit.middleware";
import {
  advancePastWindow,
  consumeAs,
  createLimitedApp,
  expectAllowedHeaders,
  expectLimitedResponse,
  freezeClock,
  get,
  getWith,
  LimitedApp,
} from "./helpers";

// Exhausting the 5000-request ingestion limiter is thousands of real requests.
jest.setTimeout(120_000);

/** The limits the platform actually runs with, regardless of this process's NODE_ENV. */
const PROD = buildRateLimitConfigs(false);

const IP = "203.0.113.10";
const OTHER_IP = "203.0.113.20";

/**
 * The seven exported limiters, with the production numbers each one is expected to
 * enforce written out longhand. Deliberate double-entry against
 * buildRateLimitConfigs: if someone relaxes a limit, this table is the second place
 * they have to change, and the diff says what they changed it from.
 */
const LIMITERS = [
  { name: "fileOperationsLimiter", key: "fileOperations", limit: 100, windowMinutes: 15 },
  { name: "generalApiLimiter", key: "generalApi", limit: 300, windowMinutes: 1 },
  { name: "authLimiter", key: "auth", limit: 5, windowMinutes: 15 },
  { name: "tokenRefreshLimiter", key: "tokenRefresh", limit: 60, windowMinutes: 15 },
  { name: "aiDetectionScanLimiter", key: "aiDetectionScan", limit: 10, windowMinutes: 60 },
  { name: "mrmIngestionLimiter", key: "mrmIngestion", limit: 5000, windowMinutes: 15 },
  { name: "webhookLimiter", key: "webhook", limit: 100, windowMinutes: 1 },
  { name: "loginLimiter", key: "login", limit: 5, windowMinutes: 1 },
  { name: "passwordResetEmailLimiter", key: "passwordResetEmail", limit: 5, windowMinutes: 1 },
  { name: "inviteEmailLimiter", key: "inviteEmail", limit: 5, windowMinutes: 1 },
  { name: "invitationResendLimiter", key: "invitationResend", limit: 5, windowMinutes: 1 },
  { name: "slackWebhookCreateLimiter", key: "slackWebhookCreate", limit: 10, windowMinutes: 60 },
  {
    name: "slackWorkspaceCreateLimiter",
    key: "slackWorkspaceCreate",
    limit: 10,
    windowMinutes: 60,
  },
  { name: "healthCheckLimiter", key: "healthCheck", limit: 1000, windowMinutes: 1 },
] as const;

describe.each(LIMITERS)("$name (production config)", ({ key, limit, windowMinutes }) => {
  const config = PROD[key];
  let limited: LimitedApp;

  beforeAll(() => {
    // Sanity-check the fixture itself: if the config ever stops matching the table,
    // every assertion below would still "pass" against the wrong limiter.
    expect(config.maxRequests).toBe(limit);
    expect(config.windowMinutes).toBe(windowMinutes);
    limited = createLimitedApp(createRateLimiter(config));
  });

  afterAll(async () => {
    await limited.close();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("advertises the draft-6 headers and decrements Remaining on each request", async () => {
    const first = await get(limited, IP);
    expectAllowedHeaders(first, { limit, remaining: limit - 1, windowMinutes });

    const second = await get(limited, IP);
    expectAllowedHeaders(second, { limit, remaining: limit - 2, windowMinutes });
  });

  it(`serves exactly ${limit} requests, then 429s with the canonical envelope`, async () => {
    // Two requests are already spent above; consume up to one short of the limit.
    await consumeAs(limited, IP, limit - 3);

    const lastAllowed = await get(limited, IP);
    expectAllowedHeaders(lastAllowed, { limit, remaining: 0, windowMinutes });

    const limitedRes = await get(limited, IP);
    expectLimitedResponse(limitedRes, { limit, windowMinutes, message: config.message });
  });

  it("keeps rejecting once the budget is spent", async () => {
    const res = await get(limited, IP);
    expectLimitedResponse(res, { limit, windowMinutes, message: config.message });
  });

  it("isolates counters per client IP", async () => {
    const res = await get(limited, OTHER_IP);
    expectAllowedHeaders(res, { limit, remaining: limit - 1, windowMinutes });
  });

  it("resets the counter when the window rolls", async () => {
    freezeClock();
    advancePastWindow(windowMinutes);

    const res = await get(limited, IP);
    expectAllowedHeaders(res, { limit, remaining: limit - 1, windowMinutes });
  });
});

/**
 * The headline scenario the suite exists for, stated in brute-force terms against
 * the endpoints authLimiter actually guards (/register, /reset-password,
 * /chng-pass/:id).
 *
 * Note this is NOT the login endpoint: POST /api/users/login is guarded by
 * `loginLimiter` (5/min), which has its own brute-force block below.
 */
describe("authLimiter brute-force protection (5 attempts / 15 minutes)", () => {
  const config = PROD.auth;
  const ATTACKER = "198.51.100.7";
  const BYSTANDER = "198.51.100.8";
  let limited: LimitedApp;

  const attempt = (ip: string) =>
    supertest(limited.server)
      .post("/api/users/reset-password")
      .set("X-Forwarded-For", ip)
      .send({ email: "victim@example.com", password: "guess" });

  beforeAll(() => {
    limited = createLimitedApp(createRateLimiter(config));
  });

  afterAll(async () => {
    await limited.close();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows five attempts and blocks the sixth", async () => {
    for (let n = 1; n <= 5; n++) {
      const res = await attempt(ATTACKER);
      expect(res.status).toBe(200);
      expect(res.headers["ratelimit-limit"]).toBe("5");
      expect(res.headers["ratelimit-remaining"]).toBe(String(5 - n));
    }

    const sixth = await attempt(ATTACKER);
    expectLimitedResponse(sixth, { limit: 5, windowMinutes: 15, message: config.message });
    expect(sixth.body.data).toContain("Too many authentication attempts");
  });

  it("keeps the attacker blocked without extending the window", async () => {
    const seventh = await attempt(ATTACKER);
    expectLimitedResponse(seventh, { limit: 5, windowMinutes: 15, message: config.message });

    // A blocked request must not push the reset further out, or an attacker who
    // keeps hammering would lock themselves out forever and a legitimate user
    // sharing the IP would never recover.
    const eighth = await attempt(ATTACKER);
    expect(Number(eighth.headers["retry-after"])).toBeLessThanOrEqual(
      Number(seventh.headers["retry-after"]),
    );
  });

  it("does not punish a different client on the same endpoint", async () => {
    const res = await attempt(BYSTANDER);
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-remaining"]).toBe("4");
  });

  it("lets the blocked client back in after the 15-minute window", async () => {
    freezeClock();
    advancePastWindow(15);

    const res = await attempt(ATTACKER);
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-remaining"]).toBe("4");
  });
});

/**
 * The same scenario on the login endpoints themselves, which are guarded by
 * loginLimiter rather than authLimiter. Shorter window (1 minute, not 15) because
 * credential stuffing is fast and locking a real user out for fifteen minutes after
 * a mistyped password is its own kind of outage.
 */
describe("loginLimiter brute-force protection (5 attempts / minute)", () => {
  const config = PROD.login;
  const ATTACKER = "198.51.100.30";
  let limited: LimitedApp;

  const attempt = (ip: string) =>
    supertest(limited.server)
      .post("/api/users/login")
      .set("X-Forwarded-For", ip)
      .send({ email: "victim@example.com", password: "guess" });

  beforeAll(() => {
    limited = createLimitedApp(createRateLimiter(config));
  });

  afterAll(async () => {
    await limited.close();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows five attempts and blocks the sixth", async () => {
    for (let n = 1; n <= 5; n++) {
      const res = await attempt(ATTACKER);
      expect(res.status).toBe(200);
      expect(res.headers["ratelimit-limit"]).toBe("5");
      expect(res.headers["ratelimit-remaining"]).toBe(String(5 - n));
    }

    expectLimitedResponse(await attempt(ATTACKER), {
      limit: 5,
      windowMinutes: 1,
      message: config.message,
    });
  });

  it("lets the client back in after a minute, not fifteen", async () => {
    freezeClock();
    advancePastWindow(1);

    const res = await attempt(ATTACKER);
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-remaining"]).toBe("4");
  });
});

/**
 * IPv6 keying.
 *
 * express-rate-limit's default key generator normalises IPv6 to a /56 subnet, so
 * addresses in one subnet deliberately SHARE a budget — otherwise an attacker with a
 * routed /64 (the normal residential allocation) would have 18 quintillion free
 * attempts. The grouping is the security property, so it is asserted in both
 * directions.
 *
 * The limit is scaled down here because the subject under test is the key generator,
 * not any particular limit; the production numbers are covered by the table above.
 */
describe("IPv6 keying (/56 subnet grouping)", () => {
  const config = { windowMinutes: 1, maxRequests: 2, message: "ipv6 subnet test" };
  let limited: LimitedApp;

  beforeAll(() => {
    limited = createLimitedApp(createRateLimiter(config));
  });

  afterAll(async () => {
    await limited.close();
  });

  it("groups addresses in the same /56 into one budget", async () => {
    expect((await get(limited, "2001:db8::1")).status).toBe(200);
    expect((await get(limited, "2001:db8::2")).status).toBe(200);

    // Same /56 despite looking nothing like the first two.
    const third = await get(limited, "2001:db8:0:ff::1");
    expectLimitedResponse(third, { limit: 2, windowMinutes: 1, message: config.message });
  });

  it("keeps a different /56 on its own budget", async () => {
    const res = await get(limited, "2001:db8:0:100::1");
    expectAllowedHeaders(res, { limit: 2, remaining: 1, windowMinutes: 1 });
  });

  it("treats an IPv4-mapped IPv6 address as its IPv4 budget", async () => {
    // ::ffff:a.b.c.d normalises to a.b.c.d, so it must not be a second free budget
    // for a client already counted under its IPv4 address.
    expect((await get(limited, "192.0.2.55")).status).toBe(200);
    expect((await get(limited, "::ffff:192.0.2.55")).status).toBe(200);

    const third = await get(limited, "192.0.2.55");
    expectLimitedResponse(third, { limit: 2, windowMinutes: 1, message: config.message });
  });
});

/**
 * MRM ingestion is the one limiter keyed by something other than the client IP.
 * Enterprise monitoring pipelines push from behind a shared NAT, so a per-IP budget
 * would let one tenant's nightly job 429 every other tenant on the same egress IP.
 *
 * Again scaled down: the production keyGenerator is used verbatim, only the limit is
 * lowered, because what is under test is which key a request lands on.
 */
describe("mrmIngestionLimiter token keying", () => {
  const config = { ...PROD.mrmIngestion, maxRequests: 2 };
  const SHARED_NAT = "203.0.113.200";
  let limited: LimitedApp;

  const asToken = (tokenId: number, ip = SHARED_NAT) =>
    getWith(limited, { "x-forwarded-for": ip, "x-mrm-token": String(tokenId) });

  beforeAll(() => {
    // Stands in for the ingestion-token auth middleware that runs ahead of the
    // limiter in routes/mrmIngestion.route.ts.
    const attachToken = (req: Request, _res: Response, next: NextFunction) => {
      const header = req.get("x-mrm-token");
      if (header) {
        // Same shape mrmIngestionAuth.middleware.ts attaches; only tokenId is
        // read by the key generator, but the type is the real one so a change to
        // it shows up here.
        req.mrmIngestionToken = {
          tokenId: Number(header),
          organizationId: 1,
          modelInventoryId: null,
        };
      }
      next();
    };
    limited = createLimitedApp(createRateLimiter(config), attachToken);
  });

  afterAll(async () => {
    await limited.close();
  });

  it("spends one token's budget without touching another token on the same IP", async () => {
    expect((await asToken(1)).status).toBe(200);
    expect((await asToken(1)).status).toBe(200);
    expectLimitedResponse(await asToken(1), {
      limit: 2,
      windowMinutes: 15,
      message: config.message,
    });

    // Same NAT egress IP, different tenant token — must be unaffected.
    expectAllowedHeaders(await asToken(2), { limit: 2, remaining: 1, windowMinutes: 15 });
  });

  it("follows the token across source IPs", async () => {
    // The budget belongs to the token, so moving the pusher to a new egress IP
    // must not hand it a fresh one.
    expectLimitedResponse(await asToken(1, "198.51.100.99"), {
      limit: 2,
      windowMinutes: 15,
      message: config.message,
    });
  });

  it("falls back to a normalised IP key when no token is present", async () => {
    // Defensive path: auth runs first in production, so this should be unreachable,
    // but it must not throw or hand out an unkeyed budget.
    const res = await get(limited, "2001:db8:aaaa::1");
    expectAllowedHeaders(res, { limit: 2, remaining: 1, windowMinutes: 15 });

    // ...and it is genuinely IP-keyed, including IPv6 /56 normalisation.
    expect((await get(limited, "2001:db8:aaaa::2")).status).toBe(200);
    expectLimitedResponse(await get(limited, "2001:db8:aaaa::3"), {
      limit: 2,
      windowMinutes: 15,
      message: config.message,
    });
  });
});

/**
 * The 429 handler is shared by every limiter, so its envelope is asserted once
 * against the shape STATUS_CODE[429] produces and the frontend destructures.
 */
describe("429 response envelope", () => {
  let limited: LimitedApp;
  const config = { windowMinutes: 1, maxRequests: 1, message: "envelope under test" };

  beforeAll(() => {
    limited = createLimitedApp(createRateLimiter(config));
  });

  afterAll(async () => {
    await limited.close();
  });

  it("returns { message, data } as JSON, not express-rate-limit's default body", async () => {
    await get(limited, IP);
    const res = await get(limited, IP);

    expect(res.status).toBe(429);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ message: "Too Many Requests", data: "envelope under test" });
    // The library default is a bare string body; a regression to it would break
    // every client reading `data`.
    expect(typeof res.body).toBe("object");
  });
});

/**
 * Guard for the app-wide invariant: createRateLimiter is the only place header
 * behaviour is configured, and it must stay on draft-6 standard headers with legacy
 * headers off. A change here silently changes the contract for all seven limiters.
 */
describe("header contract is uniform across limiters", () => {
  it("emits RateLimit-* and never X-RateLimit-* for every exported config", async () => {
    for (const { key } of LIMITERS) {
      const limited = createLimitedApp(createRateLimiter(PROD[key]));
      try {
        const res = await get(limited, "203.0.113.250");
        expect(res.headers["ratelimit-policy"]).toBeDefined();
        expect(res.headers["ratelimit-limit"]).toBeDefined();
        expect(res.headers["ratelimit-remaining"]).toBeDefined();
        expect(res.headers["ratelimit-reset"]).toBeDefined();
        expect(res.headers["ratelimit"]).toBeUndefined(); // draft-7/8 only
        expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
      } finally {
        await limited.close();
      }
    }
  });
});
