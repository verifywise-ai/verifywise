import { useMemo } from "react";
import DOMPurify from "dompurify";

/**
 * Allowlisted HTML tags for rich-text rendering.
 *
 * Mirrors the backend allowlist in Servers/utils/sanitization.utils.ts.
 */
export const RICH_TEXT_ALLOWED_TAGS: string[] = [
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
 * Allowlisted HTML attributes for rich-text rendering.
 */
export const RICH_TEXT_ALLOWED_ATTR: string[] = [
  "class",
  "style",
  "href",
  "target",
  "rel",
  "title",
  "src",
  "alt",
  "width",
  "height",
  "colspan",
  "rowspan",
  // TipTap task-list specific attributes
  "data-type",
  "data-checked",
];

/**
 * Allowlisted inline CSS properties.
 *
 * Only text alignment and color properties used by the editor are permitted.
 */
export const RICH_TEXT_ALLOWED_STYLES: ReadonlySet<string> = new Set([
  "text-align",
  "color",
  "background-color",
]);

/**
 * DOMPurify configuration that applies the same allowlist philosophy as the
 * backend sanitizer.
 */
export const DOMPURIFY_CONFIG: NonNullable<Parameters<typeof DOMPurify.sanitize>[1]> = {
  ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
  ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "base",
    "meta",
    "svg",
  ],
  FORBID_ATTR: [
    "onerror",
    "onload",
    "onclick",
    "onmouseover",
    "onfocus",
    "onblur",
    "onmouseenter",
    "onmouseleave",
    "onkeydown",
    "onkeyup",
    "onsubmit",
  ],
  ALLOW_DATA_ATTR: false,
  // Restrict URI schemes to safe values (http, https, blob, mailto, tel).
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|blob|mailto|tel):|[^a-z]|[a-z.+\-]+(?:[^a-z.+\-:]|$))/i,
};

/**
 * Filters a style attribute value down to the allowlisted CSS properties.
 *
 * Uses a temporary DOM element so the browser parses the CSS safely; any
 * property outside the allowlist is dropped.
 */
function sanitizeStyleAttribute(styleValue: string): string {
  if (typeof document === "undefined") {
    // SSR / test fallback: strip the entire style attribute if no DOM is available.
    return "";
  }

  const temp = document.createElement("div");
  temp.style.cssText = styleValue;

  const allowed: string[] = [];
  for (let i = 0; i < temp.style.length; i++) {
    const property = temp.style.item(i);
    if (RICH_TEXT_ALLOWED_STYLES.has(property)) {
      const value = temp.style.getPropertyValue(property);
      allowed.push(`${property}:${value}`);
    }
  }

  return allowed.join(";");
}

/**
 * Post-processes sanitized HTML to block data: URIs on images.
 *
 * DOMPurify's ALLOWED_URI_REGEXP does not apply to <img src> attributes, so we
 * remove any remaining data: image URIs to match the backend allowlist.
 */
function blockDataUrisOnImages(html: string): string {
  if (typeof document === "undefined" || !html.includes("data:")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  wrapper.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src.trim().toLowerCase().startsWith("data:")) {
      img.removeAttribute("src");
    }
  });

  return wrapper.innerHTML;
}

/**
 * Post-processes sanitized HTML to restrict inline style properties.
 *
 * DOMPurify does not provide fine-grained CSS property filtering, so we walk
 * the result and drop any style properties outside our allowlist.
 */
function restrictInlineStyles(html: string): string {
  if (typeof document === "undefined" || !html.includes("style=")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const elements = wrapper.querySelectorAll("[style]");
  elements.forEach((el) => {
    const sanitized = sanitizeStyleAttribute(el.getAttribute("style") || "");
    if (sanitized) {
      el.setAttribute("style", sanitized);
    } else {
      el.removeAttribute("style");
    }
  });

  return wrapper.innerHTML;
}

/**
 * Sanitizes user-generated HTML for safe rendering in the UI.
 *
 * @param html - Raw HTML string.
 * @returns Sanitized HTML string.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return html;
  const firstPass = DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as string;
  const noDataImages = blockDataUrisOnImages(firstPass);
  return restrictInlineStyles(noDataImages);
}

/**
 * Normalizes an HTML string for stable comparison.
 *
 * DOMPurify may reformat whitespace, attribute order, or self-closing tags;
 * this helper removes those differences so we can reliably detect whether
 * meaningful content was stripped.
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/\s+/g, " ")
    .replace(/\s*>\s*/g, ">")
    .replace(/\s*</g, "<")
    .replace(/\s*\/\s*>/g, "/>")
    .trim();
}

/**
 * React hook that sanitizes rich text and reports whether content was stripped.
 *
 * @param html - Raw HTML string.
 * @returns `{ sanitizedHtml, wasStripped }`
 */
export function useRichTextSanitizer(html: string): {
  sanitizedHtml: string;
  wasStripped: boolean;
} {
  return useMemo(() => {
    const sanitizedHtml = sanitizeRichText(html);
    const wasStripped = normalizeHtml(sanitizedHtml) !== normalizeHtml(html);
    return { sanitizedHtml, wasStripped };
  }, [html]);
}
