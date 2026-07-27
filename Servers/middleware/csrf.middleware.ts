import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { THIRTY_DAYS_MS } from "../utils/jwt.utils";

/**
 * Double-submit-cookie CSRF protection.
 *
 * The API is primarily authenticated with Bearer JWTs in the Authorization
 * header, which is inherently CSRF-immune. The only cookie-authenticated
 * flow is the refresh-token flow (`refresh_token` httpOnly cookie, path
 * `/api/users`). For those requests we require the client to echo a
 * non-httpOnly `csrfToken` cookie back in the `x-csrf-token` header —
 * something a cross-site attacker cannot do.
 */

export const CSRF_COOKIE_NAME = "csrfToken";
export const CSRF_HEADER_NAME = "x-csrf-token";

const REFRESH_COOKIE_NAME = "refresh_token";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Public auth endpoints are never cookie-authenticated flows; a stale
// refresh_token cookie left in the browser must not block login/registration.
const CSRF_EXEMPT_PATHS = new Set([
  "/api/users/login",
  "/api/users/login-microsoft",
  "/api/users/register",
  "/api/users/reset-password",
]);

/**
 * Generates a new CSRF token and sets it as a NON-httpOnly cookie so the
 * frontend can read it and echo it back in the `x-csrf-token` header.
 *
 * Mirrors the SameSite/Secure/path/expiry semantics of the refresh cookie
 * set in `generateUserTokens` (auth.utils.ts) so the two cookies always
 * travel together.
 */
export function generateCsrfToken(res: Response): string {
  const token = crypto.randomBytes(32).toString("hex");
  // Note: the cookie name is intentionally a string literal (not a shared
  // constant) so static analysis (CodeQL js/missing-token-validation) can
  // recognize this as a CSRF-token cookie definition.
  res.cookie("csrfToken", token, {
    httpOnly: false, // JS must be able to read this cookie
    path: "/", // must be readable from the SPA routes (e.g., /login)
    expires: new Date(Date.now() + THIRTY_DAYS_MS), // match refresh cookie
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  return token;
}

/**
 * Express middleware enforcing the double-submit-cookie pattern.
 *
 * - Requests WITHOUT the `refresh_token` cookie (pure Bearer clients) pass
 *   through untouched.
 * - Safe methods (GET/HEAD/OPTIONS) pass through.
 * - State-changing requests carrying the `refresh_token` cookie must send
 *   an `x-csrf-token` header equal to the `csrfToken` cookie; the
 *   comparison uses `crypto.timingSafeEqual` (with a length guard).
 *   Missing or mismatched tokens are rejected with 403.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Public auth endpoints are not CSRF-protected; they are the flows that
  // create/rotate the cookies in the first place.
  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  // Only cookie-authenticated flows are CSRF-exposed; Bearer-only clients pass.
  if (!req.cookies?.[REFRESH_COOKIE_NAME]) {
    return next();
  }

  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  // Static property access is intentional: CodeQL recognizes a CSRF token
  // check only when the cookie property name literally contains "csrf".
  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (
    cookieToken === undefined ||
    cookieToken === "" ||
    typeof headerToken !== "string" ||
    headerToken.length === 0
  ) {
    res.status(403).json({ message: "CSRF token missing or invalid" });
    return;
  }

  const cookieBuffer = Buffer.from(cookieToken, "utf8");
  const headerBuffer = Buffer.from(headerToken, "utf8");

  if (
    cookieBuffer.length !== headerBuffer.length ||
    !crypto.timingSafeEqual(cookieBuffer, headerBuffer)
  ) {
    res.status(403).json({ message: "CSRF token missing or invalid" });
    return;
  }

  next();
}
