/**
 * Reading a download's file name from its Content-Disposition header.
 * DOM-free, so repositories can use it without importing presentation code.
 */

/**
 * The filename in a Content-Disposition header value, as axios exposes it
 * (`response.headers["content-disposition"]`). Handles quoted, unquoted and
 * RFC 5987 (`filename*=UTF-8''...`) forms.
 *
 * @param {unknown} disposition - The raw header value, if any
 * @param {string} fallback - Name to use when the header has none
 * @returns {string} The filename or the fallback
 */
export const filenameFromContentDisposition = (disposition: unknown, fallback: string): string => {
  if (typeof disposition !== "string") return fallback;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Malformed encoding: fall through to the plain filename.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain?.[1].trim() || fallback;
};
