/**
 * URL validation helpers
 */

/**
 * True for an absolute http or https address. `new URL()` alone also accepts
 * javascript:, mailto:, data: and other schemes, which are not web addresses.
 */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
