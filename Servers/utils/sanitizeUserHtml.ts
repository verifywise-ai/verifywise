/**
 * @file sanitizeUserHtml.ts
 * @description Shared HTML sanitizer for user-generated rich-text content.
 *
 * Call this on every rich-text field before persisting (notes, evidence
 * descriptions, intake form descriptions, policy bodies, etc.) to mitigate
 * stored XSS. The allowlist mirrors the one in
 * services/policies/policyImporter.ts: safe formatting/structural tags plus
 * inline images, with `data:` and `javascript:` URIs explicitly blocked.
 *
 * Behavior:
 *   - null / undefined inputs are returned unchanged (handy for optional fields)
 *   - non-string inputs are coerced to string before sanitizing
 *   - <script>, <iframe>, <object>, on* event handlers, javascript:/data: URIs
 *     are all stripped
 *   - tag/attribute allowlist below; everything else is dropped silently
 */

import sanitizeHtml from "sanitize-html";

export const USER_HTML_ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat([
  "h1",
  "h2",
  "h3",
  "img",
  "sup",
  "sub",
  "u",
  "s",
]);

export const USER_HTML_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  ...sanitizeHtml.defaults.allowedAttributes,
  img: ["src", "alt", "width", "height"],
  a: ["href", "target", "rel"],
};

// `data:` is intentionally excluded — it can carry executable payloads via
// <iframe src="data:text/html,..."> or <img src="data:image/svg+xml,..."> with
// inline scripts.
export const USER_HTML_ALLOWED_SCHEMES = ["http", "https", "blob"];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: USER_HTML_ALLOWED_TAGS,
  allowedAttributes: USER_HTML_ALLOWED_ATTRIBUTES,
  allowedSchemes: USER_HTML_ALLOWED_SCHEMES,
};

export function sanitizeUserHtml<T extends string | null | undefined>(input: T): T;
export function sanitizeUserHtml(input: unknown): string | null | undefined;
export function sanitizeUserHtml(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return input as null | undefined;
  const str = typeof input === "string" ? input : String(input);
  return sanitizeHtml(str, SANITIZE_OPTIONS);
}
