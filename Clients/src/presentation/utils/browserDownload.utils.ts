/**
 * @fileoverview Browser Download Utilities
 *
 * Presentation layer utilities for triggering file downloads in the browser.
 * Handles DOM manipulation and browser-specific download behavior.
 *
 * @module presentation/utils/browserDownload
 */

/**
 * Triggers a file download in the browser using the download attribute
 *
 * Creates a temporary anchor element, triggers a click, and cleans up.
 * This is the standard browser mechanism for programmatic downloads.
 *
 * @param {Blob} blob - The file content as a Blob
 * @param {string} filename - The name to save the file as
 *
 * @example
 * const blob = new Blob([data], { type: 'application/pdf' });
 * triggerBrowserDownload(blob, 'report.pdf');
 */
export const triggerBrowserDownload = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

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
