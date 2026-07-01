/**
 * @file sanitization.utils.ts
 * @description Shared HTML sanitizer for user-generated rich-text content.
 *
 * Call this on every rich-text field before persisting (notes, evidence
 * descriptions, intake form descriptions, policy bodies, etc.) to mitigate
 * stored XSS. The allowlist is explicit and strict: only formatting,
 * structural, link, image, and table tags are permitted; scripts, event
 * handlers, dangerous URI schemes, and arbitrary styles are stripped.
 *
 * Behavior:
 *   - null / undefined inputs are returned unchanged (handy for optional fields)
 *   - non-string inputs are coerced to string before sanitizing
 *   - <script>, <style>, <iframe>, <object>, <embed>, <form>, on* event
 *     handlers, javascript:/data: URIs, and non-allowlisted attributes are
 *     all stripped silently
 *   - style attributes are restricted to a safe subset of properties only
 */

import sanitizeHtml from "sanitize-html";

/**
 * Allowlisted HTML tags.
 *
 * Mirrors the markup produced by the TipTap-based RichTextEditor:
 * headings, paragraphs, lists, links, images, tables, code blocks,
 * blockquotes, and basic inline formatting.
 */
export const USER_HTML_ALLOWED_TAGS: string[] = [
  // Text structure
  "p",
  "br",
  "div",
  "span",
  "hr",
  // Headings
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  // Inline formatting
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "mark",
  "sup",
  "sub",
  // Code
  "code",
  "pre",
  // Lists
  "ul",
  "ol",
  "li",
  // Links / media
  "a",
  "img",
  // Tables
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  // Block elements
  "blockquote",
];

/**
 * Allowlisted HTML attributes per tag.
 *
 * Global attribute `class` is allowed for styling hooks.
 * Link and image attributes are restricted to safe, non-executable values.
 */
export const USER_HTML_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  "*": ["class", "style"],
  a: ["href", "target", "rel", "title"],
  img: ["src", "alt", "width", "height", "title"],
  th: ["colspan", "rowspan"],
  td: ["colspan", "rowspan"],
  // TipTap task-list specific attributes
  ul: ["data-type"],
  li: ["data-checked"],
};

/**
 * Allowlisted inline CSS properties.
 *
 * Only text alignment and color properties used by the editor are permitted.
 * All other styles (positioning, behavior URLs, expressions, etc.) are removed.
 */
export const USER_HTML_ALLOWED_STYLES: sanitizeHtml.IOptions["allowedStyles"] = {
  "*": {
    "text-align": [/^left$|^right$|^center$|^justify$/i],
    color: [/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6,8})$/i, /^(?:rgb|hsl)a?\([^)]*\)$/i],
    "background-color": [/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6,8})$/i, /^(?:rgb|hsl)a?\([^)]*\)$/i],
  },
};

/**
 * Allowlisted URI schemes.
 *
 * `data:` is intentionally excluded — it can carry executable payloads via
 * <img src="data:image/svg+xml,..."> or <iframe src="data:text/html,...">.
 * `javascript:` and `vbscript:` are blocked by sanitize-html by default.
 */
export const USER_HTML_ALLOWED_SCHEMES: string[] = ["http", "https", "blob", "mailto", "tel"];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: USER_HTML_ALLOWED_TAGS,
  allowedAttributes: USER_HTML_ALLOWED_ATTRIBUTES,
  allowedStyles: USER_HTML_ALLOWED_STYLES,
  allowedSchemes: USER_HTML_ALLOWED_SCHEMES,
  // Ensure disallowed tags/attributes are removed (not escaped)
  disallowedTagsMode: "discard",
};

/**
 * Sanitizes user-provided HTML for safe persistence and rendering.
 *
 * @param input - Raw HTML string, or null/undefined for optional fields.
 * @returns The sanitized HTML string, or null/undefined if the input was.
 */
export function sanitizeUserHtml<T extends string | null | undefined>(input: T): T;
export function sanitizeUserHtml(input: unknown): string | null | undefined;
export function sanitizeUserHtml(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return input as null | undefined;
  const str = typeof input === "string" ? input : String(input);
  return sanitizeHtml(str, SANITIZE_OPTIONS);
}
