/**
 * @fileoverview Rate Limiting Middleware
 *
 * Provides production-ready rate limiting for API endpoints to prevent abuse and DoS attacks.
 * Uses express-rate-limit with IPv6-safe IP normalization.
 *
 * Rate Limiters:
 * - fileOperationsLimiter: 50 requests/15min (for file uploads, downloads, deletions)
 * - generalApiLimiter: 100 requests/15min (for standard API endpoints)
 * - authLimiter: 5 requests/15min (for login/register/reset to prevent brute force)
 * - tokenRefreshLimiter: 60 requests/15min (for automatic access-token refresh)
 *
 * The strict auth/refresh limits apply by default. They are relaxed ONLY when
 * NODE_ENV is an explicit dev/test value, so a single developer hammering
 * localhost from one IP is not locked out. A missing or unknown NODE_ENV keeps
 * the strict production limits (fail closed).
 *
 * @module middleware/rateLimit
 */

import rateLimit, { Options } from "express-rate-limit";
import { Request, Response } from "express";
import logger from "../utils/logger/fileLogger";

// Fail closed: the strict (production) limits apply unless NODE_ENV is
// EXPLICITLY a known non-production value. A missing or misspelled NODE_ENV in
// production must NOT silently relax brute-force protection, so anything we
// don't recognise as dev/test is treated as production.
const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
const isNonProduction = nodeEnv === "development" || nodeEnv === "test" || nodeEnv === "local";

/**
 * Rate limit configuration with time window and request limits
 */
interface RateLimitConfig {
  windowMinutes: number;
  maxRequests: number;
  message: string;
}

/**
 * Predefined rate limit configurations for different endpoint types
 */
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  fileOperations: {
    windowMinutes: 15,
    maxRequests: 100,
    message: "Too many file operation requests from this IP, please try again after 15 minutes",
  },
  generalApi: {
    windowMinutes: 15,
    maxRequests: 100,
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
  auth: {
    windowMinutes: 15,
    // Strict by default to prevent brute force; relaxed only in explicit
    // dev/test so a single developer on one localhost IP is not locked out.
    maxRequests: isNonProduction ? 1000 : 5,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes",
  },
  // Token refresh happens automatically and legitimately many times in a normal
  // session, so it gets its own generous limit rather than sharing the strict
  // brute-force limiter. It still requires a valid refresh-token cookie.
  tokenRefresh: {
    windowMinutes: 15,
    maxRequests: isNonProduction ? 1000 : 60,
    message: "Too many token refresh attempts from this IP, please try again after 15 minutes",
  },
  aiDetectionScan: {
    windowMinutes: 60,
    maxRequests: 10,
    message: "Too many AI detection scan requests from this IP, please try again after 60 minutes",
  },
};

/**
 * Creates a standardized rate limit error handler
 * Returns consistent error format using STATUS_CODE utility
 */
const createRateLimitHandler = (message: string) => {
  return (req: Request, res: Response) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    logger.warn(`Rate limit exceeded for IP ${clientIp} on ${req.path}: ${message}`);
    res.status(429).json({ message, statusCode: 429 });
  };
};

/**
 * Creates a rate limiter with the specified configuration
 * Uses express-rate-limit's built-in IP extraction and IPv6 normalization
 */
const createRateLimiter = (config: RateLimitConfig) => {
  const options: Partial<Options> = {
    windowMs: config.windowMinutes * 60 * 1000,
    max: config.maxRequests,
    standardHeaders: true, // Send rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    handler: createRateLimitHandler(config.message),
    // Let express-rate-limit handle IP extraction with IPv6 support
    // This automatically uses req.ip with proper IPv6 normalization
  };

  return rateLimit(options);
};

/**
 * Rate limiter for file operations (upload, download, delete)
 * Restrictive limits due to expensive I/O operations
 */
export const fileOperationsLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.fileOperations);

/**
 * General API rate limiter for standard CRUD endpoints
 * Moderate limits for typical operations
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
