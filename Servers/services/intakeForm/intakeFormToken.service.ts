/**
 * HMAC-signed tokens for intake-form CAPTCHAs and resubmission links.
 *
 * Signs payloads with a sha256 HMAC keyed on `JWT_SECRET` (or
 * `ENCRYPTION_KEY` as a fallback). Verification is timing-safe.
 *
 * Tokens are base64-encoded JSON envelopes: `{ data, signature }`.
 */

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
if (!TOKEN_SECRET) {
  throw new Error("JWT_SECRET or ENCRYPTION_KEY must be set for intake form token signing");
}

export const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function createSignedToken(payload: Record<string, unknown>): string {
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", TOKEN_SECRET!).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

export function verifySignedToken<T = Record<string, unknown>>(token: string): T | null {
  try {
    const { data, signature } = JSON.parse(Buffer.from(token, "base64").toString());
    const expectedSignature = createHmac("sha256", TOKEN_SECRET!).update(data).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export interface CaptchaChallenge {
  question: string;
  token: string;
  answer: number;
}

/**
 * Generate a fresh arithmetic CAPTCHA + signed token. The token encodes the
 * answer plus a timestamp; verification compares user answer + checks the
 * token has not aged past `FIVE_MINUTES_MS`.
 */
export function generateCaptchaChallenge(): CaptchaChallenge {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operators = ["+", "-"] as const;
  const operator = operators[Math.floor(Math.random() * operators.length)];

  let answer: number;
  let question: string;

  if (operator === "+") {
    answer = num1 + num2;
    question = `${num1} + ${num2}`;
  } else {
    const larger = Math.max(num1, num2);
    const smaller = Math.min(num1, num2);
    answer = larger - smaller;
    question = `${larger} - ${smaller}`;
  }

  const token = createSignedToken({ answer, timestamp: Date.now() });
  return { question, token, answer };
}

export interface ResubmissionTokenPayload {
  submissionId: number;
  formId: number;
  email: string;
  timestamp: number;
}

export type ResubmissionTokenValidation =
  | { kind: "valid"; payload: ResubmissionTokenPayload }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "email_mismatch" };

/**
 * Validate a resubmission token against the expected email and the 7-day
 * expiry window. Returns a tagged union describing the failure mode if any.
 */
export function validateResubmissionToken(
  token: string,
  expectedEmail: string,
): ResubmissionTokenValidation {
  const decoded = verifySignedToken<ResubmissionTokenPayload>(token);
  if (!decoded || !decoded.submissionId) return { kind: "invalid" };

  const tokenAge = Date.now() - (decoded.timestamp || 0);
  if (tokenAge > SEVEN_DAYS_MS) return { kind: "expired" };
  if (decoded.email !== expectedEmail) return { kind: "email_mismatch" };
  return { kind: "valid", payload: decoded };
}

export type CaptchaValidation =
  | { ok: true }
  | { ok: false; error: "missing" | "invalid" | "expired" | "wrong_answer" };

/**
 * Verify the CAPTCHA payload from a public form submission.
 */
export function validateCaptcha(
  token: string | undefined,
  userAnswer: unknown,
): CaptchaValidation {
  if (!token || userAnswer === undefined) return { ok: false, error: "missing" };

  const payload = verifySignedToken<{ answer: number; timestamp: number }>(token);
  if (!payload) return { ok: false, error: "invalid" };

  const tokenAge = Date.now() - payload.timestamp;
  if (tokenAge > FIVE_MINUTES_MS) return { ok: false, error: "expired" };
  if (Number(payload.answer) !== Number(userAnswer)) return { ok: false, error: "wrong_answer" };
  return { ok: true };
}
