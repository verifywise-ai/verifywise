#!/usr/bin/env node
/**
 * Wrap user-facing string literals in `req.t(...)` so the i18n middleware can
 * translate them per request. Operates ONLY on `Servers/controllers/` because
 * that's the only place `req` is reliably in scope. Utility/domain throws stay
 * in English — the controller's catch block translates them via
 * `req.t(error.message)` (Phase 3.7).
 *
 * Usage:
 *   node scripts/codemod-i18n-wrap.mjs              # rewrite files
 *   node scripts/codemod-i18n-wrap.mjs --dry-run    # show counts only
 *   node scripts/codemod-i18n-wrap.mjs --diff       # show first 10 diffs
 *
 * What it rewrites (static, double- or single-quoted literals only — never
 * template literals, never variables/expressions):
 *
 *   STATUS_CODE[200]("Vendor saved")
 *     -> STATUS_CODE[200](req.t!("Vendor saved"))
 *
 * The `!` non-null assertion is required because `req.t` is typed optional
 * (see Servers/types/express.d.ts) — making it required broke ~400 unrelated
 * handler signatures across the codebase. The middleware always sets `t`, so
 * the assertion is sound at runtime; the catch-block pattern in Phase 3.7
 * uses optional chaining for defensive translation.
 *
 * Idempotent: a literal already wrapped in `req.t!("...")` is skipped.
 *
 * Out of scope (handled in later phases):
 *   - Template literals (Phase 3.5: hand-fix to req.t("key", { vars }))
 *   - throw new XxxException(...) (catch block translates via req.t(error.message))
 *   - sanitizeErrorMessage fallbacks (Phase 3.8)
 *   - error.message wrapping in catch blocks (Phase 3.7)
 */
import fs from "node:fs";
import path from "node:path";
import {
  SERVERS_ROOT,
  STATIC_STR_PATTERN,
  walkTsFiles,
  parseArgs,
  recordDiff,
  printDiffSamples,
} from "./lib/i18nScriptUtils.mjs";

const SCAN_DIRS = [path.join(SERVERS_ROOT, "controllers"), path.join(SERVERS_ROOT, "middleware")];
const { DRY_RUN, SHOW_DIFF } = parseArgs();

// Match STATUS_CODE[\d+](<whitespace>"literal" | 'literal') — first arg only.
// Lookahead avoids double-wrapping `STATUS_CODE[xxx](req.t!("..."))`.
const TARGET = new RegExp(
  String.raw`(STATUS_CODE\[\d+\]\(\s*)(?!req\.t!?\()${STATIC_STR_PATTERN}`,
  "gs",
);

// Object-form: STATUS_CODE[xxx]({ message: "literal", ... }) — wrap the
// literal in req.t!. Captures: (prefix)(message:<ws>)("literal"|'literal').
// Idempotent via the `req.t!` lookahead.
const TARGET_OBJ = new RegExp(
  String.raw`(STATUS_CODE\[\d+\]\(\s*\{\s*message\s*:\s*)(?!req\.t!?\()${STATIC_STR_PATTERN}`,
  "gs",
);

// Direct-res-json forms that bypass STATUS_CODE entirely, e.g.:
//   res.status(401).json({ message: "Unauthorized" })
//   res.status(500).json({ error: "Internal server error" })
// Captures: (prefix)("literal"|'literal'). Same lookahead.
const TARGET_RES_JSON = new RegExp(
  String.raw`(res\.status\(\d+\)\.json\(\s*\{\s*(?:message|error)\s*:\s*)(?!req\.t!?\()${STATIC_STR_PATTERN}`,
  "gs",
);

const diffs = [];
let filesChanged = 0;
let wrapsApplied = 0;

walkTsFiles(SCAN_DIRS, (filePath) => {
  const original = fs.readFileSync(filePath, "utf8");
  let count = 0;
  const replacer = (_whole, prefix, dq, sq) => {
    count += 1;
    const literal = dq !== undefined ? `"${dq}"` : `'${sq}'`;
    return `${prefix}req.t!(${literal})`;
  };
  let updated = original.replace(TARGET, replacer);
  updated = updated.replace(TARGET_OBJ, replacer);
  updated = updated.replace(TARGET_RES_JSON, replacer);
  if (count === 0) return;

  wrapsApplied += count;
  filesChanged += 1;
  if (SHOW_DIFF) recordDiff(diffs, filePath, original, updated);
  if (!DRY_RUN) fs.writeFileSync(filePath, updated);
});

console.log("=== i18n codemod (STATUS_CODE wrap) ===");
console.log(`Scanned: ${SCAN_DIRS.map((d) => path.relative(SERVERS_ROOT, d)).join(", ")}`);
console.log(`Files changed: ${filesChanged}`);
console.log(`Wraps applied: ${wrapsApplied}`);
if (DRY_RUN) console.log("(dry-run — no files written)");
if (SHOW_DIFF) printDiffSamples(diffs);
