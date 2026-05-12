#!/usr/bin/env node
/**
 * Extract user-facing English strings from controllers, utils, and exception
 * throws. Writes them as JSON keys to Servers/locales/en.json (English keys
 * mapped to their English values — that's the en-as-key convention).
 *
 * Usage:
 *   node scripts/extract-i18n-keys.mjs                # write en.json
 *   node scripts/extract-i18n-keys.mjs --dry-run      # print stats only
 *   node scripts/extract-i18n-keys.mjs --report       # print categorised breakdown
 *
 * Detection (matches across line breaks — many calls are formatted multi-line):
 *   - STATUS_CODE[xxx]("literal")            and  STATUS_CODE[xxx](`tpl`)
 *   - throw new XxxException("literal", ...)         (static only)
 *   - sanitizeErrorMessage(error, "fallback")        (2nd arg is the user-visible fallback)
 *   - req.t("literal") / req.t!("literal") / _req.t!(...)
 *   - i18nKey: "literal"                             (CustomException option)
 *   - translate(lang, "literal", ...)                (callers without req)
 *
 * Email-subject patterns are scanned only against EMAIL_SUBJECT_FILES because
 * `subject:` is too generic to apply across the codebase (would pick up DB
 * column names etc.):
 *   - subject: "literal"                  /  subject: `tpl`
 *   - sendEmail(<arg>, "literal" | `tpl`, ...)
 *   - getSubject: (...) => `tpl`
 *
 * Skips: matches whose line context contains logger.* / logStructured /
 * logEvent / logProcessing / logSuccess / logFailure / console.*
 *
 * Template normalisation:
 *   - STATUS_CODE / throw templates -> positional `{1}/{2}` (hand-rewritten in
 *     Phase 3.5/3.6 to named placeholders).
 *   - Email-subject templates -> `{identifierName}` derived from the last
 *     identifier in the `${expr}`. Falls back to positional on collision.
 *
 * Dynamic exception throws are not captured: by Phase 3.6 convention they must
 * carry an explicit `i18nKey`, which IS captured.
 */
import fs from "node:fs";
import path from "node:path";
import {
  SERVERS_ROOT,
  STATIC_STR_PATTERN as STATIC_STR,
  walkTsFiles,
} from "./lib/i18nScriptUtils.mjs";

const OUT_PATH = path.join(SERVERS_ROOT, "locales", "en.json");

// Roots scanned for the main extraction pass. Email-subject scanning is a
// content-based opt-in (see EMAIL_FILE_HINT below) so we add `services/` and
// `routes/` here too — they're cheap, and many files there call `req.t!()`
// or `translate(...)` even outside email contexts.
const SCAN_DIRS = [
  path.join(SERVERS_ROOT, "controllers"),
  path.join(SERVERS_ROOT, "utils"),
  path.join(SERVERS_ROOT, "domain.layer"),
  path.join(SERVERS_ROOT, "services"),
  path.join(SERVERS_ROOT, "routes"),
  path.join(SERVERS_ROOT, "middleware"),
];

// Email-subject regexes (`subject:` etc.) are too generic to run unconditionally
// — they'd pick up DB column names and API field labels. We opt in per file by
// checking for a notification/email-related token in the source. This
// auto-discovers new email senders without an allow-list.
const EMAIL_FILE_HINT =
  /\b(sendEmail|getSubject|emailService|sendInAppNotification|sendEmailWithTemplate)\b/;

// Whole-source regexes (with /s flag so `.` matches newlines for whitespace gaps).
const TPL_STR = String.raw`\`((?:[^\`\\]|\\.)*?)\``;

const STATIC_STATUS = new RegExp(String.raw`STATUS_CODE\[\d+\]\(\s*${STATIC_STR}`, "gs");
const DYN_STATUS = new RegExp(String.raw`STATUS_CODE\[\d+\]\(\s*${TPL_STR}`, "gs");
const STATIC_THROW = new RegExp(String.raw`throw\s+new\s+\w+Exception\(\s*${STATIC_STR}`, "gs");
const SANITIZE_FALLBACK = new RegExp(
  String.raw`sanitizeErrorMessage\(\s*[^,]+?,\s*${STATIC_STR}`,
  "gs",
);
// Direct req.t() / req.t!() / _req.t!() calls — covers post-codemod controllers
// and any hand-written calls that introduce new keys.
const REQ_T_CALL = new RegExp(String.raw`\b_?req\.t!?\(\s*${STATIC_STR}`, "gs");
// i18nKey: "..." in CustomException options object — Phase 3.6 dynamic throws
const I18N_KEY_OPTION = new RegExp(String.raw`i18nKey\s*:\s*${STATIC_STR}`, "gs");
// translate(lang, "...") for callers without req — covers email helpers, BullMQ
const TRANSLATE_CALL = new RegExp(String.raw`\btranslate\(\s*[^,]+?,\s*${STATIC_STR}`, "gs");
// Email-subject patterns — only run against EMAIL_SUBJECT_FILES.
const SUBJECT_STATIC = new RegExp(String.raw`subject:\s*${STATIC_STR}`, "gs");
const SUBJECT_TPL = new RegExp(String.raw`subject:\s*${TPL_STR}`, "gs");
const SENDEMAIL_STATIC = new RegExp(String.raw`sendEmail\(\s*[^,]+?,\s*${STATIC_STR}`, "gs");
const SENDEMAIL_TPL = new RegExp(String.raw`sendEmail\(\s*[^,]+?,\s*${TPL_STR}`, "gs");
const GETSUBJECT_TPL = new RegExp(String.raw`getSubject:\s*\([^)]*\)\s*=>\s*${TPL_STR}`, "gs");

const SKIP_LINE_PATTERNS = [
  /logger\.(error|warn|info|debug|trace)/,
  /logStructured\b/,
  /logEvent\b/,
  /logProcessing\b/,
  /logSuccess\b/,
  /logFailure\b/,
  /console\.(log|warn|error|info|debug)/,
];

// Hand-curated noise list — strings that match the regexes but are not
// user-facing translatable copy. Most are internal/developer errors that only
// surface to external integrators (webhooks, API key holders) or are dev-only
// mock data. Generic-template strings ("{1} with id {2} not found") are
// dropped because the entity name placeholder ({1}) won't be translated.
const NOISE_KEYS = new Set([
  // Webhook / external-integration errors — seen by other systems, not end users
  "Missing X-API-Key header",
  "Missing X-GitHub-Event header",
  "Missing X-Hub-Signature-256 header",
  "Request body must be raw buffer",
  // Dev/test-only
  "Mock data deleted",
  "Mock data inserted",
]);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const REPORT = args.has("--report");

function normalizeTemplate(raw) {
  let n = 0;
  return raw.replace(/\$\{[^}]+\}/g, () => `{${++n}}`);
}

// Email subjects use `${entity.name}` / `${someFn(arg)}` / `${variable}` —
// derive a sensible placeholder name from the expression. For `obj.method()`
// the trailing identifier is a method name (not the value), so back off to
// the preceding identifier — `${event.entityType.toLowerCase()}` becomes
// `{entityType}`. A bare function call like `${formatNumber(count)}` is a
// different shape (no leading `.`) and the trailing `count` IS the value.
// Falls back to a positional `{n}` on identifier collision or empty match.
function normalizeNamed(raw) {
  const used = new Set();
  let positional = 0;
  return raw.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const trimmed = expr.trim();
    const idents = trimmed.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
    if (idents.length === 0) return `{${++positional}}`;
    let name = idents[idents.length - 1];
    if (/\.\s*[a-zA-Z_]\w*\s*\([^)]*\)\s*$/.test(trimmed) && idents.length > 1) {
      name = idents[idents.length - 2];
    }
    if (used.has(name)) return `{${++positional}}`;
    used.add(name);
    return `{${name}}`;
  });
}

// Single source of truth — adding a category is a one-line edit here.
// `dynamicThrow` is intentionally absent: dynamic exception messages must carry
// an `i18nKey` (Phase 3.6), so the literal template is dead at runtime and only
// served as English fallback for unhandled `error.message` reads. Capturing it
// would produce positional `{1}/{2}` keys that duplicate the `{named}` i18nKey.
const CATEGORIES = [
  { name: "staticStatus", regex: STATIC_STATUS },
  { name: "dynamicStatus", regex: DYN_STATUS, normalize: normalizeTemplate },
  { name: "staticThrow", regex: STATIC_THROW },
  { name: "sanitize", regex: SANITIZE_FALLBACK },
  { name: "reqTCall", regex: REQ_T_CALL },
  { name: "i18nKey", regex: I18N_KEY_OPTION },
  { name: "translateCall", regex: TRANSLATE_CALL },
];

// Email-subject categories — applied only to EMAIL_SUBJECT_FILES.
const EMAIL_CATEGORIES = [
  { name: "subjectStatic", regex: SUBJECT_STATIC },
  { name: "subjectTpl", regex: SUBJECT_TPL, normalize: normalizeNamed },
  { name: "sendEmailStatic", regex: SENDEMAIL_STATIC },
  { name: "sendEmailTpl", regex: SENDEMAIL_TPL, normalize: normalizeNamed },
  { name: "getSubjectTpl", regex: GETSUBJECT_TPL, normalize: normalizeNamed },
];

const findings = Object.fromEntries(
  [...CATEGORIES, ...EMAIL_CATEGORIES].map((c) => [c.name, new Set()]),
);

// Heuristic only checks the current line and the previous line. Multi-line
// formatted `logger.error(\n  "...",\n  ctx\n)` calls with the string >1 line
// below the logger call would slip through; none observed in this codebase.
function isInLoggerContext(src, idx) {
  const lineStart = src.lastIndexOf("\n", idx - 1) + 1;
  const lineEnd = src.indexOf("\n", idx);
  const line = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
  if (SKIP_LINE_PATTERNS.some((re) => re.test(line))) return true;
  const prevLineEnd = lineStart - 1;
  if (prevLineEnd <= 0) return false;
  const prevLineStart = src.lastIndexOf("\n", prevLineEnd - 1) + 1;
  const prevLine = src.slice(prevLineStart, prevLineEnd);
  return SKIP_LINE_PATTERNS.some((re) => re.test(prevLine));
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  // Strip comments while preserving newlines/columns so match offsets stay aligned.
  const src = original
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

  const collect = (regex, target, normalize) => {
    for (const m of src.matchAll(regex)) {
      if (isInLoggerContext(src, m.index)) continue;
      const value = m[1] !== undefined ? m[1] : m[2];
      if (!value) continue;
      target.add(normalize ? normalize(value) : value);
    }
  };

  for (const c of CATEGORIES) collect(c.regex, findings[c.name], c.normalize);
  if (EMAIL_FILE_HINT.test(original)) {
    for (const c of EMAIL_CATEGORIES) collect(c.regex, findings[c.name], c.normalize);
  }
}

walkTsFiles(SCAN_DIRS, processFile);

const allKeys = new Set();
for (const c of [...CATEGORIES, ...EMAIL_CATEGORIES]) {
  for (const k of findings[c.name]) allKeys.add(k);
}

const droppedNoise = [...allKeys].filter((k) => NOISE_KEYS.has(k));
for (const k of droppedNoise) allKeys.delete(k);

const sorted = [...allKeys].sort((a, b) => a.localeCompare(b));
const out = {};
for (const k of sorted) out[k] = k;

const stats = {
  ...Object.fromEntries(
    [...CATEGORIES, ...EMAIL_CATEGORIES].map((c) => [c.name, findings[c.name].size]),
  ),
  droppedNoise: droppedNoise.length,
  totalUniqueKeys: allKeys.size,
};

console.log("=== i18n key extraction ===");
console.log(`Scanned: ${SCAN_DIRS.map((d) => path.relative(SERVERS_ROOT, d)).join(", ")}`);
console.log(stats);

if (REPORT) {
  for (const c of [...CATEGORIES, ...EMAIL_CATEGORIES]) {
    console.log(`\n--- ${c.name} ---`);
    [...findings[c.name]].sort().forEach((k) => console.log("  " + k));
  }
}

if (!DRY_RUN) {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${sorted.length} keys to ${path.relative(SERVERS_ROOT, OUT_PATH)}`);
}
