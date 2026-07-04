/**
 * @fileoverview JWT Token Management Utilities
 *
 * Provides functions for generating and validating JSON Web Tokens (JWT) used for
 * user authentication and session management. Implements both access and refresh
 * token patterns for enhanced security.
 *
 * Token Types:
 * - Access Token: Short-lived (1 hour) for API authentication
 * - Refresh Token: Long-lived (30 days) for obtaining new access tokens
 *
 * Security Features:
 * - Separate secrets for access and refresh tokens
 * - Token expiration validation
 * - Signature verification using HMAC-SHA256
 * - Automatic expiration timestamp injection
 *
 * @module utils/jwt
 */

import Jwt from "jsonwebtoken";

/**
 * Verifies and decodes an access token
 *
 * Validates the access token signature using JWT_SECRET.
 * Returns null if verification fails (invalid signature, malformed).
 * Note: Expiration must be checked separately using the returned expire timestamp.
 *
 * @param {string} token - JWT access token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 * @returns {number} returns.id - User ID
 * @returns {string} returns.email - User email
 * @returns {number} returns.expire - Expiration timestamp (must be checked by caller)
 *
 * @security
 * - Uses JWT_SECRET environment variable
 * - Verifies HMAC-SHA256 signature
 * - Caller must validate expire timestamp against Date.now()
 *
 * @example
 * const payload = getTokenPayload(accessToken);
 * if (payload && payload.expire > Date.now()) {
 *   console.log(`User ID: ${payload.id}`);
 * } else {
 *   console.error('Invalid or expired token');
 * }
 */
const getTokenPayload = (token: any): any => {
  try {
    return Jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      email: string;
      expire: number;
    };
  } catch (error) {
    return null;
  }
};

/**
 * Verifies and decodes a refresh token
 *
 * Validates the refresh token signature using REFRESH_TOKEN_SECRET.
 * Returns null if verification fails (invalid signature, malformed).
 * Note: Expiration must be checked separately using the returned expire timestamp.
 *
 * @param {string} token - JWT refresh token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 * @returns {number} returns.id - User ID
 * @returns {string} returns.email - User email
 * @returns {number} returns.expire - Expiration timestamp (must be checked by caller)
 *
 * @security
 * - Uses REFRESH_TOKEN_SECRET environment variable
 * - Verifies HMAC-SHA256 signature
 * - Caller must validate expire timestamp against Date.now()
 * - Should only be used for refresh token operations
 *
 * @example
 * const payload = getRefreshTokenPayload(refreshToken);
 * if (payload && payload.expire > Date.now()) {
 *   // Generate new access token
 * } else {
 *   // Require re-authentication
 * }
 */
const getRefreshTokenPayload = (token: any): any => {
  try {
    return Jwt.verify(token, process.env.REFRESH_TOKEN_SECRET as string) as {
      id: number;
      email: string;
      expire: number;
    };
  } catch (error) {
    return null;
  }
};

// Token expiration constants
const ONE_HOUR_MS = 1 * 3600 * 1000;
const ONE_WEEK_MS = 7 * 24 * 3600 * 1000;
const THIRTY_DAYS_MS = 1 * 3600 * 1000 * 24 * 30;

/**
 * Internal helper to generate JWT tokens with configurable expiration and secret
 */
const signToken = (payload: Object, expiresInMs: number, secret: string): string | undefined => {
  try {
    return Jwt.sign(
      {
        ...payload,
        expire: Date.now() + expiresInMs,
      },
      secret,
    );
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

/**
 * Generates a short-lived JWT access token (1 hour)
 */
const generateToken = (payload: Object) => {
  return signToken(payload, ONE_HOUR_MS, process.env.JWT_SECRET as string);
};

/**
 * Generates a JWT token for invitation and password-reset emails (1 week)
 */
const generateInviteToken = (payload: Object) => {
  return signToken(payload, ONE_WEEK_MS, process.env.JWT_SECRET as string);
};

/**
 * Generates a long-lived JWT refresh token (30 days)
 * Signed with REFRESH_TOKEN_SECRET for added security
 */
const generateRefreshToken = (payload: Object) => {
  return signToken(payload, THIRTY_DAYS_MS, process.env.REFRESH_TOKEN_SECRET as string);
};

/**
 * Generates a JWT API token with configurable expiration
 * For programmatic API access by integrations and scripts.
 *
 * The token carries a `type: "api_token"` claim. The auth middleware uses this
 * claim to branch into a database-backed check against the api_tokens table, so
 * that API tokens can be revoked independently of their JWT expiry. Session
 * tokens have no `type` claim and skip that lookup.
 *
 * @param payload - Token payload (user info, organization, role, etc.)
 * @param expiresInDays - Optional expiration in days (default: 30 days)
 */
const generateApiToken = (payload: Object, expiresInDays?: number) => {
  const expiresInMs = expiresInDays ? expiresInDays * 24 * 60 * 60 * 1000 : THIRTY_DAYS_MS;
  return signToken(
    { ...payload, type: "api_token" },
    expiresInMs,
    process.env.JWT_SECRET as string,
  );
};

export {
  getTokenPayload,
  generateToken,
  generateInviteToken,
  getRefreshTokenPayload,
  generateRefreshToken,
  generateApiToken,
  ONE_WEEK_MS,
};
