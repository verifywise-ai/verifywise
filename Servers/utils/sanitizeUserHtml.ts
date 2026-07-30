/**
 * @file sanitizeUserHtml.ts
 * @description Backward-compatibility re-export for the shared HTML sanitizer.
 *
 * The canonical implementation now lives in {@link ../sanitization.utils.ts}.
 * Existing imports from this path continue to work; new code should import
 * directly from `Servers/utils/sanitization.utils.ts`.
 */

export {
  sanitizeUserHtml,
  USER_HTML_ALLOWED_TAGS,
  USER_HTML_ALLOWED_ATTRIBUTES,
  USER_HTML_ALLOWED_STYLES,
  USER_HTML_ALLOWED_SCHEMES,
} from "./sanitization.utils";
