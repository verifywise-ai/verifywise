/**
 * URL validation helpers
 */

// Scheme and "//" written out, and no whitespace: new URL() would otherwise
// repair "https:example.com" or trim "  https://x.com  " and call it valid.
const WEB_URL_PREFIX_RE = /^https?:\/\/\S+$/i;

/**
 * True for an absolute http or https address, as typed. `new URL()` alone also
 * accepts javascript:, mailto:, data: and other schemes, which are not web
 * addresses.
 */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string" || !WEB_URL_PREFIX_RE.test(value)) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
