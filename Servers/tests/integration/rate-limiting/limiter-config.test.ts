/**
 * Rate-limiter verification suite — configuration contract.
 *
 * Phase 1 proves the limiters behave correctly at whatever limits they are handed.
 * This file pins what those limits ARE, and proves the NODE_ENV gate that chooses
 * between them fails closed.
 *
 * Both halves matter because the relaxation is invisible at runtime: a limiter built
 * from the dev config is a perfectly well-behaved limiter, it just never fires. The
 * only thing standing between "brute-force protected" and "1000 free guesses" is the
 * string in NODE_ENV.
 */

import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/logger/fileLogger", () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

import { buildRateLimitConfigs } from "../../../middleware/rateLimit.middleware";
import { createLimitedApp, get } from "./helpers";

type RateLimitModule = typeof import("../../../middleware/rateLimit.middleware");

/**
 * Imports the middleware fresh under a given NODE_ENV.
 *
 * `isNonProduction` is evaluated once at module load, so the only way to test the
 * gate is to re-evaluate the module — hence the isolated registry rather than
 * simply reassigning process.env.
 */
function loadUnderNodeEnv(value: string | undefined): RateLimitModule {
  const previous = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;

  let loaded: RateLimitModule;
  try {
    jest.isolateModules(() => {
      loaded = require("../../../middleware/rateLimit.middleware") as RateLimitModule;
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  return loaded!;
}

/**
 * The limits VerifyWise ships with. Written out longhand — including the exact 429
 * message, which is user-facing — so that loosening any limit is a deliberate,
 * reviewable diff rather than a one-character edit in a config object.
 */
const PRODUCTION = {
  fileOperations: {
    windowMinutes: 15,
    maxRequests: 100,
    message: "Too many file operation requests from this IP, please try again after 15 minutes",
  },
  generalApi: {
    windowMinutes: 1,
    maxRequests: 300,
    message: "Too many requests from this IP, please slow down and retry",
  },
  auth: {
    windowMinutes: 15,
    maxRequests: 5,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes",
  },
  tokenRefresh: {
    windowMinutes: 15,
    maxRequests: 60,
    message: "Too many token refresh attempts from this IP, please try again after 15 minutes",
  },
  aiDetectionScan: {
    windowMinutes: 60,
    maxRequests: 10,
    message: "Too many AI detection scan requests from this IP, please try again after 60 minutes",
  },
  mrmIngestion: {
    windowMinutes: 15,
    maxRequests: 5000,
    message: "Too many metric ingestion requests for this token, please slow down and retry",
  },
  webhook: {
    windowMinutes: 1,
    maxRequests: 100,
    message: "Too many webhook requests from this IP, please slow down and retry",
  },
  login: {
    windowMinutes: 1,
    maxRequests: 5,
    message: "Too many login attempts from this IP, please try again after a minute",
  },
  passwordResetEmail: {
    windowMinutes: 1,
    maxRequests: 5,
    message: "Too many password reset requests from this IP, please try again later",
  },
  inviteEmail: {
    windowMinutes: 1,
    maxRequests: 5,
    message: "Too many invite requests from this IP, please try again later",
  },
  invitationResend: {
    windowMinutes: 1,
    maxRequests: 5,
    message: "Too many resend requests from this IP, please try again later",
  },
  slackWebhookCreate: {
    windowMinutes: 60,
    maxRequests: 10,
    message: "Too many webhook creation requests from this IP, please try again after an hour",
  },
  slackWorkspaceCreate: {
    windowMinutes: 60,
    maxRequests: 10,
    message:
      "Too many Slack workspace creation requests from this IP, please try again after an hour",
  },
  healthCheck: {
    windowMinutes: 1,
    maxRequests: 1000,
    message: "Too many health-check requests from this IP, please slow down",
  },
} as const;

/** The relaxed ceilings, which apply ONLY under an explicit dev/test NODE_ENV. */
const RELAXED_MAX_REQUESTS: Record<string, number> = {
  fileOperations: 100, // deliberately not relaxed
  generalApi: 100000,
  auth: 1000,
  tokenRefresh: 1000,
  aiDetectionScan: 10, // deliberately not relaxed
  mrmIngestion: 100000,
  webhook: 100000,
  login: 1000,
  passwordResetEmail: 5, // deliberately not relaxed
  inviteEmail: 5, // deliberately not relaxed
  invitationResend: 5, // deliberately not relaxed
  slackWebhookCreate: 10, // deliberately not relaxed
  slackWorkspaceCreate: 10, // deliberately not relaxed
  healthCheck: 100000,
};

describe("production rate limit configuration", () => {
  const configs = buildRateLimitConfigs(false);

  it("defines exactly the seven known limiters", () => {
    // An eighth limiter must be added to this table (and to the Phase 1 contract
    // table) before it can ship, so no limiter reaches production untested.
    expect(Object.keys(configs).sort()).toEqual(Object.keys(PRODUCTION).sort());
  });

  it.each(Object.keys(PRODUCTION))("pins the %s window, limit and 429 message", (key) => {
    const expected = PRODUCTION[key as keyof typeof PRODUCTION];
    const actual = configs[key];

    expect(actual.windowMinutes).toBe(expected.windowMinutes);
    expect(actual.maxRequests).toBe(expected.maxRequests);
    expect(actual.message).toBe(expected.message);
  });

  it("keys every limiter by IP except MRM ingestion", () => {
    // A custom keyGenerator is a security-relevant choice: it decides who shares a
    // budget. MRM ingestion keys by token on purpose (shared-NAT pipelines); a
    // keyGenerator appearing anywhere else is a change that needs review.
    const withCustomKey = Object.keys(configs).filter((key) => configs[key].keyGenerator);
    expect(withCustomKey).toEqual(["mrmIngestion"]);
  });
});

describe("dev/test relaxation surface", () => {
  const strict = buildRateLimitConfigs(false);
  const relaxed = buildRateLimitConfigs(true);

  it.each(Object.keys(RELAXED_MAX_REQUESTS))("relaxes %s only as documented", (key) => {
    expect(relaxed[key].maxRequests).toBe(RELAXED_MAX_REQUESTS[key]);
  });

  it("never relaxes the cost-driven limiters", () => {
    // These are throttled because the work is expensive or reaches a third party
    // (disk I/O, model scans, outbound email, Slack), not because of brute force —
    // so a developer hammering localhost should feel them exactly as production does.
    const NEVER_RELAXED = [
      "fileOperations",
      "aiDetectionScan",
      "passwordResetEmail",
      "inviteEmail",
      "invitationResend",
      "slackWebhookCreate",
      "slackWorkspaceCreate",
    ];
    for (const key of NEVER_RELAXED) {
      expect(relaxed[key].maxRequests).toBe(strict[key].maxRequests);
    }
  });

  it("relaxes the brute-force and volume limiters", () => {
    // The mirror of the test above: these MUST be relaxed, or a developer on one
    // localhost IP locks themselves out of their own login page.
    for (const key of [
      "auth",
      "login",
      "generalApi",
      "tokenRefresh",
      "mrmIngestion",
      "webhook",
      "healthCheck",
    ]) {
      expect(relaxed[key].maxRequests).toBeGreaterThan(strict[key].maxRequests);
    }
  });

  it("changes only the request ceiling, never the window or the message", () => {
    for (const key of Object.keys(strict)) {
      expect(relaxed[key].windowMinutes).toBe(strict[key].windowMinutes);
      expect(relaxed[key].message).toBe(strict[key].message);
    }
  });

  it("never relaxes a limit downward", () => {
    for (const key of Object.keys(strict)) {
      expect(relaxed[key].maxRequests).toBeGreaterThanOrEqual(strict[key].maxRequests);
    }
  });
});

/**
 * The fail-closed gate.
 *
 * The module's contract is that strict limits apply unless NODE_ENV is EXPLICITLY a
 * known dev/test value — so a missing, misspelled or unexpected NODE_ENV in
 * production keeps brute-force protection on. Nothing asserted this before; the
 * property lived only in a comment.
 */
describe("NODE_ENV gate fails closed", () => {
  const RELAXES = ["development", "test", "local"];

  const STRICT_VALUES: Array<{ why: string; value: string | undefined }> = [
    { why: "the obvious production value", value: "production" },
    { why: "production with different casing", value: "Production" },
    { why: "production shouting", value: "PRODUCTION" },
    { why: "a pre-production environment", value: "staging" },
    { why: "an abbreviation that is NOT on the allowlist", value: "prod" },
    { why: "the branch name, not the env name", value: "develop" },
    { why: "close to 'test' but not it", value: "testing" },
    { why: "a typo — the case this gate exists for", value: "tset" },
    { why: "an empty NODE_ENV", value: "" },
    { why: "whitespace only", value: "   " },
    { why: "NODE_ENV not set at all", value: undefined },
  ];

  it.each(RELAXES)("relaxes limits under NODE_ENV=%s", (value) => {
    const mod = loadUnderNodeEnv(value);
    expect(mod.isNonProduction).toBe(true);
    expect(mod.RATE_LIMIT_CONFIGS.auth.maxRequests).toBe(1000);
  });

  it.each([" Development ", "TEST", "Local"])(
    "trims and lowercases before matching (%s)",
    (value) => {
      // Documented behaviour: the value is trimmed and lowercased, so these are
      // genuine dev/test values, not near-misses.
      const mod = loadUnderNodeEnv(value);
      expect(mod.isNonProduction).toBe(true);
    },
  );

  it.each(STRICT_VALUES)("keeps strict limits for $why", ({ value }) => {
    const mod = loadUnderNodeEnv(value);
    expect(mod.isNonProduction).toBe(false);
    expect(mod.RATE_LIMIT_CONFIGS.auth.maxRequests).toBe(5);
    expect(mod.RATE_LIMIT_CONFIGS.login.maxRequests).toBe(5);
    expect(mod.RATE_LIMIT_CONFIGS.generalApi.maxRequests).toBe(300);
    expect(mod.RATE_LIMIT_CONFIGS.tokenRefresh.maxRequests).toBe(60);
    expect(mod.RATE_LIMIT_CONFIGS.mrmIngestion.maxRequests).toBe(5000);
    expect(mod.RATE_LIMIT_CONFIGS.webhook.maxRequests).toBe(100);
  });
});

/**
 * Closes the loop between config and the exported singletons.
 *
 * Everything above reasons about config objects; Phase 1 reasons about limiters
 * built from config objects. This asserts the exported `authLimiter` — the actual
 * middleware mounted on /api/users/register — enforces the number the gate chose.
 */
describe("the exported authLimiter honours the NODE_ENV gate", () => {
  it("blocks the sixth attempt when NODE_ENV is production", async () => {
    const mod = loadUnderNodeEnv("production");
    const limited = createLimitedApp(mod.authLimiter);

    try {
      for (let n = 1; n <= 5; n++) {
        expect((await get(limited, "192.0.2.201")).status).toBe(200);
      }
      const sixth = await get(limited, "192.0.2.201");
      expect(sixth.status).toBe(429);
      expect(sixth.body).toEqual({
        message: "Too Many Requests",
        data: PRODUCTION.auth.message,
      });
    } finally {
      await limited.close();
    }
  });

  it("lets a developer keep working when NODE_ENV is test", async () => {
    const mod = loadUnderNodeEnv("test");
    const limited = createLimitedApp(mod.authLimiter);

    try {
      for (let n = 1; n <= 6; n++) {
        expect((await get(limited, "192.0.2.202")).status).toBe(200);
      }
    } finally {
      await limited.close();
    }
  });
});
