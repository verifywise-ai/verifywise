/**
 * Shared server-side HTML sanitization for user-generated rich-text content.
 *
 * Sits in front of any persistence path that accepts HTML (policy bodies,
 * note text, evidence / form descriptions, etc.) so that stored XSS payloads
 * are stripped before they reach the database.
 *
 * Defaults are conservative: a small whitelist of inline / block formatting
 * tags plus links. Images are opt-in via `allowImages` since most rich-text
 * inputs don't need them and `<img onerror>` is a common XSS vector.
 *
 * Only http(s) URI schemes are permitted by default — explicitly excluding
 * `data:` / `javascript:` / `vbscript:` and the various `on*` attribute
 * handlers (which sanitize-html strips by default).
 *
 * @module utils/sanitization/sanitizeUserHtml
 */

import sanitizeHtml from "sanitize-html";

/** Tags allowed in any user-generated rich-text input by default. */
const DEFAULT_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "sup",
  "sub",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

/** Attribute whitelist per tag, applied on top of sanitize-html defaults. */
const DEFAULT_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "name", "target", "rel"],
  // span/div get class only — supports common WYSIWYG output without unlocking
  // style attributes (which can carry expression()/url() based attacks).
  span: ["class"],
  div: ["class"],
  th: ["scope"],
};

/** Default schemes — `data:` is intentionally excluded. */
const DEFAULT_ALLOWED_SCHEMES = ["http", "https", "mailto"];

const IMG_TAG = "img";
const IMG_ATTRS = ["src", "alt", "width", "height"];

export interface SanitizeUserHtmlOptions {
  /**
   * Allow `<img>` tags. Defaults to `false`. When `true`, image `src` is
   * restricted to the configured `allowedSchemes` (`http(s)` by default —
   * caller can add `"blob"` for in-browser-generated images).
   */
  allowImages?: boolean;
  /**
   * Override the URI schemes allowed for `href` / `src`. Defaults to
   * `["http", "https", "mailto"]`. `data:` is intentionally not in the default.
   */
  allowedSchemes?: string[];
  /**
   * Extra tags to allow in addition to the defaults. Use sparingly — every
   * additional tag is a potential vector.
   */
  extraAllowedTags?: string[];
}

/**
 * Strip XSS-prone markup from user-supplied HTML. Returns the sanitized
 * string. `null` / `undefined` inputs pass through unchanged so this is safe
 * to call on optional fields without first null-checking.
 *
 * @example
 * const safe = sanitizeUserHtml(req.body.description);
 * @example
 * // For long-form rich text where the editor allows inline images:
 * const safe = sanitizeUserHtml(req.body.content_html, { allowImages: true });
 */
export function sanitizeUserHtml(
  input: string,
  options?: SanitizeUserHtmlOptions,
): string;
export function sanitizeUserHtml(
  input: null,
  options?: SanitizeUserHtmlOptions,
): null;
export function sanitizeUserHtml(
  input: undefined,
  options?: SanitizeUserHtmlOptions,
): undefined;
export function sanitizeUserHtml(
  input: string | null | undefined,
  options?: SanitizeUserHtmlOptions,
): string | null | undefined;
export function sanitizeUserHtml(
  input: string | null | undefined,
  options: SanitizeUserHtmlOptions = {},
): string | null | undefined {
  if (input === null || input === undefined) return input;
  if (typeof input !== "string") {
    // Defensive: callers occasionally pass `unknown` payload fields. Refuse
    // silently rather than risk passing junk through to sanitize-html.
    return "";
  }

  const allowedTags = [...DEFAULT_ALLOWED_TAGS, ...(options.extraAllowedTags ?? [])];
  const allowedAttributes: sanitizeHtml.IOptions["allowedAttributes"] = {
    ...DEFAULT_ALLOWED_ATTRIBUTES,
  };

  if (options.allowImages) {
    allowedTags.push(IMG_TAG);
    allowedAttributes[IMG_TAG] = IMG_ATTRS;
  }

  return sanitizeHtml(input, {
    allowedTags,
    allowedAttributes,
    allowedSchemes: options.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES,
    // Force rel="noopener noreferrer" on every anchor — defence against
    // tabnabbing in addition to XSS scrubbing. `merge=true` keeps href / target.
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
    },
    // Drop <style>, <script>, and friends entirely (default behaviour, but
    // making it explicit so it's obvious from this file).
    disallowedTagsMode: "discard",
    allowProtocolRelative: false,
  });
}

/** The default allowed tag list, exported so tests / callers can introspect it. */
export const SANITIZE_DEFAULT_ALLOWED_TAGS = DEFAULT_ALLOWED_TAGS;
/** The default allowed scheme list, exported for test assertions. */
export const SANITIZE_DEFAULT_ALLOWED_SCHEMES = DEFAULT_ALLOWED_SCHEMES;
