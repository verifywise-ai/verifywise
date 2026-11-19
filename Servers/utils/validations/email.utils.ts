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
 * Accepts exactly what /^[^\s@]+@[^\s@]+\.[^\s@]+$/ accepted: a non-empty
 * local part, one @, no whitespace, and a dot inside the domain but not at
 * either end. Looser than isEmail on purpose, for values validated before
 * (extension configuration is re-validated on every update, so a stricter
 * check would lock out a stored address). That regex backtracked
 * quadratically on a long dotted domain; this check is linear.
 */
export function hasLegacyEmailShape(value: string): boolean {
  const at = value.indexOf("@");
  if (at < 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return !/\s/.test(local) && !/[\s@]/.test(domain) && domain.slice(1, -1).includes(".");
}

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
