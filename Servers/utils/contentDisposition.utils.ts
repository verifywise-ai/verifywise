/**
 * Build an attachment Content-Disposition header value that is safe for any
 * filename (RFC 6266 / RFC 5987). A plain ASCII `filename=` is always sent for
 * old clients; `filename*=UTF-8''...` carries the real Unicode name.
 *
 * @param {string} filename - The intended download name, possibly non-ASCII
 * @returns {string} The header value
 */
export function contentDispositionAttachment(rawFilename: string): string {
  // A lone surrogate makes encodeURIComponent throw; swap it for U+FFFD.
  const filename = rawFilename.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "\uFFFD",
  );
  const dot = filename.lastIndexOf(".");
  const extension = dot > 0 ? filename.slice(dot).replace(/[^\x21-\x7e]/g, "") : "";
  const base = dot > 0 ? filename.slice(0, dot) : filename;

  const asciiBase = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallback = `${asciiBase.replace(/[-_.]/g, "") ? asciiBase : "policy"}${extension}`;

  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
