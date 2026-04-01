/**
 * @fileoverview Rate Limiting Middleware
 *
 * Provides production-ready rate limiting for API endpoints to prevent abuse and DoS attacks.
 * Uses express-rate-limit with IPv6-safe IP normalization.
 *
 * Rate Limiters:
 * - fileOperationsLimiter: 50 requests/15min (for file uploads, downloads, deletions)
 * - generalApiLimiter: 100 requests/15min (for standard API endpoints)
 * - authLimiter: 5 requests/15min (for authentication to prevent brute force)
 *
 * @module middleware/rateLimit
 */

import rateLimit, { Options } from "express-rate-limit";
import { Request, Response } from "express";
import logger from "../utils/logger/fileLogger";

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
    message:
      "Too many file operation requests from this IP, please try again after 15 minutes",
  },
  generalApi: {
    windowMinutes: 15,
    maxRequests: 100,
    message:
      "Too many requests from this IP, please try again after 15 minutes",
  },
  auth: {
    windowMinutes: 15,
    maxRequests: 5,
    message:
      "Too many authentication attempts from this IP, please try again after 15 minutes",
  },
  aiDetectionScan: {
    windowMinutes: 60,
    maxRequests: 10,
    message:
      "Too many AI detection scan requests from this IP, please try again after 60 minutes",
  },
};

/**
 * Creates a standardized rate limit error handler
 * Returns consistent error format using STATUS_CODE utility
 */
const createRateLimitHandler = (message: string) => {
  return (req: Request, res: Response) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    logger.warn(
      `Rate limit exceeded for IP ${clientIp} on ${req.path}: ${message}`
    );
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
export const fileOperationsLimiter = createRateLimiter(
  RATE_LIMIT_CONFIGS.fileOperations
);

/**
 * General API rate limiter for standard CRUD endpoints
 * Moderate limits for typical operations
 */
export const generalApiLimiter = createRateLimiter(
  RATE_LIMIT_CONFIGS.generalApi
);

/**
 * Strict rate limiter for authentication endpoints
 * Very restrictive to prevent brute force attacks
 */
export const authLimiter = createRateLimiter(RATE_LIMIT_CONFIGS.auth);

/**
 * Rate limiter for AI Detection scan operations
 * Moderate limits as scans are resource-intensive
 */
export const aiDetectionScanLimiter = createRateLimiter(
  RATE_LIMIT_CONFIGS.aiDetectionScan
);
