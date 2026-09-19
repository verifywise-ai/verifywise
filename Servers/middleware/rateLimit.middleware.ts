/**
 * @fileoverview Rate Limiting Middleware
 *
 * Provides production-ready rate limiting for API endpoints to prevent abuse and DoS attacks.
 * Uses express-rate-limit with IPv6-safe IP normalization.
 *
 * Every limiter in the application is defined here and built through
 * `createRateLimiter`, so they all share one contract: draft-6 `RateLimit-*`
 * headers, no legacy `X-RateLimit-*`, and the canonical STATUS_CODE[429] body
 * `{ message: "Too Many Requests", data: <limiter message> }`. Defining a limiter
 * inline in a route file re-introduces express-rate-limit's defaults (legacy
 * headers, a non-standard body) and silently breaks that contract — see
 * tests/integration/rate-limiting/.
 *
 * Production limits:
 * - generalApiLimiter: 300/min — loose global ceiling mounted ahead of all route
 *   mounts in app.ts; stricter per-route limiters still apply on top
 * - authLimiter: 5/15min — register, password reset, change password
 * - loginLimiter: 5/min — login and login-microsoft
 * - tokenRefreshLimiter: 60/15min — automatic access-token refresh
 * - fileOperationsLimiter: 100/15min — file uploads, downloads, deletions
 * - aiDetectionScanLimiter: 10/hour — expensive scans
 * - mrmIngestionLimiter: 5000/15min, keyed by token — machine-to-machine push
 * - webhookLimiter: 100/min — inbound signature-verified webhooks
 * - passwordResetEmailLimiter / inviteEmailLimiter / invitationResendLimiter:
 *   5/min each — outbound email
 * - slackWebhookCreateLimiter / slackWorkspaceCreateLimiter: 10/hour each
 * - healthCheckLimiter: 1000/min — probe endpoint
 *
 * The strict auth/refresh limits apply by default. They are relaxed ONLY when
 * NODE_ENV is an explicit dev/test value, so a single developer hammering
 * localhost from one IP is not locked out. A missing or unknown NODE_ENV keeps
 * the strict production limits (fail closed).
 *
 * @module middleware/rateLimit
 */

import rateLimit, { Options, ipKeyGenerator } from "express-rate-limit";
import { Request, Response } from "express";
import logger from "../utils/logger/fileLogger";
import { STATUS_CODE } from "../utils/statusCode.utils";

// Fail closed: the strict (production) limits apply unless NODE_ENV is
// EXPLICITLY a known non-production value. A missing or misspelled NODE_ENV in
// production must NOT silently relax brute-force protection, so anything we
// don't recognise as dev/test is treated as production.
const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
export const isNonProduction =
  nodeEnv === "development" || nodeEnv === "test" || nodeEnv === "local";

/**
 * Rate limit configuration with time window and request limits
 */
export interface RateLimitConfig {
  windowMinutes: number;
  maxRequests: number;
  message: string;
  // Optional custom key. Defaults to per-IP. Machine-auth endpoints (e.g. MRM
  // ingestion) key by token so tenants behind a shared NAT don't share a budget.
  keyGenerator?: Options["keyGenerator"];
}

/**
 * Builds the rate limit configurations for every endpoint type.
 *
 * Parameterised on `relaxed` rather than reading `isNonProduction` directly so the
 * PRODUCTION limits can be built inside a test process (which necessarily runs with
 * NODE_ENV=test). Without this, a brute-force test would silently exercise the
 * relaxed dev limits — 1000 auth attempts instead of 5 — and pass without ever
 * reaching the limit it claims to verify.
 *
 * @param relaxed - true to apply the loosened dev/test limits, false for production
 */
export const buildRateLimitConfigs = (relaxed: boolean): Record<string, RateLimitConfig> => ({
  fileOperations: {
    windowMinutes: 15,
    maxRequests: 100,
    message: "Too many file operation requests from this IP, please try again after 15 minutes",
  },
  // Loose global ceiling for all API traffic, mounted ahead of the route
  // mounts in app.ts (audit 4.5). Deliberately generous — it only stops
  // runaway/DoS-level volume; the stricter per-route limiters below remain
  // the real abuse controls. Effectively unlimited in explicit dev/test so
  // a developer hammering localhost from one IP is not locked out.
  generalApi: {
    windowMinutes: 1,
    maxRequests: relaxed ? 100000 : 300,
    message: "Too many requests from this IP, please slow down and retry",
  },
  auth: {
    windowMinutes: 15,
    // Strict by default to prevent brute force; relaxed only in explicit
    // dev/test so a single developer on one localhost IP is not locked out.
    maxRequests: relaxed ? 1000 : 5,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes",
  },
  // Token refresh happens automatically and legitimately many times in a normal
  // session, so it gets its own generous limit rather than sharing the strict
  // brute-force limiter. It still requires a valid refresh-token cookie.
  tokenRefresh: {
    windowMinutes: 15,
    maxRequests: relaxed ? 1000 : 60,
    message: "Too many token refresh attempts from this IP, please try again after 15 minutes",
  },
  aiDetectionScan: {
    windowMinutes: 60,
    maxRequests: 10,
    message: "Too many AI detection scan requests from this IP, please try again after 60 minutes",
  },
  // MRM metric ingestion is a machine-to-machine push from a customer's
  // monitoring pipeline. It is legitimately high-volume (a nightly job may push
  // many models x metrics, and a single request can batch many points), so the
  // limit is deliberately generous — far above the auth/general limiters — while
  // still capping a runaway or abusive pusher. Keyed by ingestion TOKEN (not IP):
  // enterprise pipelines behind a shared NAT must not share one budget, and one
  // runaway token must not 429 every other tenant on the same egress IP.
  mrmIngestion: {
    windowMinutes: 15,
    maxRequests: relaxed ? 100000 : 5000,
    message: "Too many metric ingestion requests for this token, please slow down and retry",
    keyGenerator: (req) => {
      const tokenId = (req as { mrmIngestionToken?: { tokenId?: number } }).mrmIngestionToken
        ?.tokenId;
      // Auth runs before this limiter, so a token is present for every real request.
      // The IP branch is a defensive fallback — use the library's ipKeyGenerator so
      // IPv6 addresses are normalized (raw req.ip is rejected by express-rate-limit v8).
      return tokenId !== undefined ? `mrm-token:${tokenId}` : ipKeyGenerator(req.ip ?? "");
    },
  },
  webhook: {
    windowMinutes: 1,
    maxRequests: relaxed ? 100000 : 100,
    message: "Too many webhook requests from this IP, please slow down and retry",
  },
  // Brute-force control on the actual login endpoints. Separate from `auth`
  // (which guards register/reset/change-password) because the window is shorter:
  // a credential-stuffing run is fast, and a one-minute lockout costs a real user
  // far less than fifteen. Relaxed in explicit dev/test so the E2E suite's
  // repeated UI logins from one localhost IP are not blocked.
  login: {
    windowMinutes: 1,
    maxRequests: relaxed ? 1000 : 5,
    message: "Too many login attempts from this IP, please try again after a minute",
  },
  // Outbound-email endpoints. These are not relaxed in dev/test: the cost being
  // controlled is sending mail to a third party, which is just as real locally.
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
  // Load-balancer and uptime probes are legitimately frequent, so this ceiling is
  // generous — it exists to stop /health being used as a free amplification
  // endpoint, not to throttle monitoring.
  healthCheck: {
    windowMinutes: 1,
    maxRequests: relaxed ? 100000 : 1000,
    message: "Too many health-check requests from this IP, please slow down",
  },
});

/**
 * The configurations the running process actually uses, resolved once from NODE_ENV.
 */
export const RATE_LIMIT_CONFIGS = buildRateLimitConfigs(isNonProduction);

/**
 * Creates a standardized rate limit error handler
 * Responds with the canonical STATUS_CODE[429] envelope:
 * { message: "Too Many Requests", data: <limiter-specific message> }
 */
const createRateLimitHandler = (message: string) => {
  return (req: Request, res: Response) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    logger.warn(`Rate limit exceeded for IP ${clientIp} on ${req.path}: ${message}`);
    res.status(429).json(STATUS_CODE[429](message));
  };
};

/**
 * Creates a rate limiter with the specified configuration
 * Uses express-rate-limit's built-in IP extraction and IPv6 normalization
 */
export const createRateLimiter = (config: RateLimitConfig) => {
  const options: Partial<Options> = {
    windowMs: config.windowMinutes * 60 * 1000,
    max: config.maxRequests,
    standardHeaders: true, // Send rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    handler: createRateLimitHandler(config.message),
    // Let express-rate-limit handle IP extraction with IPv6 support
    // This automatically uses req.ip with proper IPv6 normalization
    ...(config.keyGenerator ? { keyGenerator: config.keyGenerator } : {}),
  };

  return rateLimit(options);
};

/**
 * Rate limiter for file operations (upload, download, delete)
 * Restrictive limits due to expensive I/O operations
 */
export const fileOperationsLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.fileOperations);

/**
 * General API rate limiter: a loose per-IP ceiling for all API traffic,
 * mounted globally in app.ts ahead of the route mounts. Stricter per-route
 * limiters still apply on top of it.
 */
export const generalApiLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.generalApi);

/**
 * Strict rate limiter for authentication endpoints (login, register, reset)
 * Very restrictive to prevent brute force attacks
 */
export const authLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.auth);

/**
 * Rate limiter for the automatic access-token refresh endpoint
 * More generous than authLimiter because refresh is a routine, non-credential
 * operation that happens repeatedly during a normal session
 */
export const tokenRefreshLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.tokenRefresh);

/**
 * Rate limiter for AI Detection scan operations
 * Moderate limits as scans are resource-intensive
 */
export const aiDetectionScanLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.aiDetectionScan);

/**
 * Dedicated rate limiter for the MRM metric-ingestion push endpoint.
 * Generous vs. the auth/general limiters because ingestion is a legitimate
 * high-volume machine-to-machine flow (batched pushes from a monitoring cron),
 * but still bounded so a runaway pusher cannot flood the system.
 */
export const mrmIngestionLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.mrmIngestion);

/**
 * Rate limiter for public webhook endpoints.
 * Generous because webhooks are legitimate machine-to-machine pushes, but still
 * bounded so a misconfigured or malicious sender cannot flood the system.
 */
export const webhookLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.webhook);

/**
 * Brute-force limiter for POST /users/login and /users/login-microsoft.
 * Tighter window than authLimiter because credential stuffing is fast and a
 * one-minute lockout is cheap for a legitimate user who mistyped a password.
 */
export const loginLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.login);

/** Limiter for the password-reset email endpoint (POST /mail/reset-password). */
export const passwordResetEmailLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.passwordResetEmail);

/** Limiter for the user-invite email endpoint (POST /mail/invite). */
export const inviteEmailLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.inviteEmail);

/** Limiter for re-sending an invitation (POST /invitations/:id/resend). */
export const invitationResendLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.invitationResend);

/** Limiter for creating a Slack webhook (POST /slack-webhooks). */
export const slackWebhookCreateLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.slackWebhookCreate);

/** Limiter for connecting a Slack workspace (POST /extensions/slack/oauth/workspaces). */
export const slackWorkspaceCreateLimiter = createRateLimiter(
  RATE_LIMIT_CONFIGS.slackWorkspaceCreate,
);

/** Generous limiter for the GET /health probe endpoint. */
export const healthCheckLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.healthCheck);
