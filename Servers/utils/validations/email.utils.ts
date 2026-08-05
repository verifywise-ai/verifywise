/**
 * Email validation helpers
 *
 * These regexes are intentionally written to avoid polynomial backtracking
 * (ReDoS). The local and domain labels are separated by fixed characters so
 * the engine cannot partition the string in multiple ways.
 */

const SAFE_EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 320; // RFC 5321 maximum total length

/**
 * Type guard that returns true when the value is a syntactically valid email.
 */
export function isEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_EMAIL_LENGTH &&
    SAFE_EMAIL_RE.test(value)
  );
}
