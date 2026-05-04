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
 * Extracts filename from Content-Disposition header
 *
 * @param {Headers} headers - Response headers
 * @param {string} fallback - Fallback filename if header not found
 * @returns {string} Extracted or fallback filename
 */
export const extractFilenameFromHeaders = (
  headers: Headers,
  fallback: string = "download",
): string => {
  const headerContent = headers.get("Content-Disposition");
  if (!headerContent) return fallback;

  const fileAttachment = [...headerContent.matchAll(/"([^"]+)"/g)];
  const filenames = fileAttachment.map((m) => m[1]);

  return filenames[0] || fallback;
};
