/**
 * @fileoverview Policy DOCX Import Service
 *
 * Converts an uploaded DOCX buffer to sanitized HTML suitable for
 * insertion into the policy TipTap editor.
 *
 * @module services/policies/policyImporter
 */

import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";

/** Maximum permitted upload size (must match multer limit in policy.route.ts). */
export const DOCX_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * MIME types accepted for DOCX uploads.
 *
 * `application/octet-stream` is a permitted fallback because some
 * browsers (e.g. older Edge, some mobile browsers) send DOCX files
 * with a generic binary MIME type.  The extension check in the
 * controller is the primary guard; this list is a secondary filter.
 */
export const DOCX_ALLOWED_MIMES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
] as const;

/** Result shape returned by {@link convertDocxToHtml}. */
export interface DocxImportResult {
  html: string;
  warnings: string[];
}

/**
 * Converts a DOCX buffer to sanitized HTML.
 *
 * Steps:
 * 1. Use mammoth to produce raw HTML from the DOCX binary.
 * 2. Post-process: collapse h4-h6 to h3, strip auto-generated class attrs.
 * 3. Server-side sanitization (defense-in-depth, mirrors client DOMPurify pass).
 *
 * @param buffer - Raw DOCX file bytes.
 * @returns Sanitized HTML string and any conversion warnings.
 */
export async function convertDocxToHtml(
  buffer: Buffer
): Promise<DocxImportResult> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h3:fresh",
        "p[style-name='Heading 5'] => h3:fresh",
        "p[style-name='Heading 6'] => h3:fresh",
      ],
    }
  );

  // Collapse any remaining h4/h5/h6 elements and strip class attributes
  let html = result.value;
  html = html.replace(/<(\/?)h[456](\s|>)/gi, "<$1h3$2");
  html = html.replace(/\s+class="[^"]*"/g, "");

  // Server-side sanitization — only allow safe URI schemes (no data: URIs)
  html = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "h1",
      "h2",
      "h3",
      "img",
      "sup",
      "sub",
      "u",
      "s",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
      a: ["href", "target", "rel"],
    },
    // Explicitly exclude "data:" to prevent XSS via data URIs
    allowedSchemes: ["http", "https", "blob"],
  });

  const warnings = result.messages
    .filter((m) => m.type === "warning")
    .map((m) => m.message);

  return { html, warnings };
}
