#!/usr/bin/env node
/**
 * Phase 3.7 codemod: rewrite catch-block error returns to translate via
 * `translateError(req, error)` (which honours `error.i18nKey` from
 * CustomException — see Phase 3.6 — or falls back to `req.t(error.message)`).
 *
 * Patterns rewritten:
 *   STATUS_CODE[xxx]((error as Error).message)  -> STATUS_CODE[xxx](translateError(req, error))
 *   STATUS_CODE[xxx](err.message)               -> STATUS_CODE[xxx](translateError(req, err))
 *
 * Inserts `import { translateError } from "../utils/i18n.utils";` at the top of
 * any file that gained a `translateError(...)` reference.
 *
 * Idempotent: skips lines already wrapped in translateError().
 *
 * Scope: Servers/controllers/. Skips __tests__ and *.test.ts.
 *
 * Usage:
 *   node scripts/codemod-catch-translate.mjs              # write
 *   node scripts/codemod-catch-translate.mjs --dry-run    # show counts only
 *   node scripts/codemod-catch-translate.mjs --diff       # show first 10 diffs
 */
import fs from "node:fs";
import path from "node:path";
import {
  SERVERS_ROOT,
  walkTsFiles,
  parseArgs,
  recordDiff,
  printDiffSamples,
} from "./lib/i18nScriptUtils.mjs";

const SCAN_DIRS = [path.join(SERVERS_ROOT, "controllers")];
const { DRY_RUN, SHOW_DIFF } = parseArgs();

const PATTERN_AS_ERROR = new RegExp(
  String.raw`(STATUS_CODE\[\d+\]\()\(([a-zA-Z_]\w*)\s+as\s+Error\)\.message\)`,
  "g",
);
const PATTERN_BARE = new RegExp(String.raw`(STATUS_CODE\[\d+\]\()(err|error)\.message\)`, "g");

const IMPORT_STATEMENT = `import { translateError } from "../utils/i18n.utils";`;

const diffs = [];
let filesChanged = 0;
let wrapsApplied = 0;

const ensureImport = (src) => {
  if (src.includes(`from "../utils/i18n.utils"`)) {
    if (src.includes("translateError")) return src;
    // i18n.utils is already imported but for something else; merge in translateError.
    return src.replace(
      /import\s*\{([^}]*)\}\s*from\s*"\.\.\/utils\/i18n\.utils";/,
      (_whole, names) => `import { ${names.trim()}, translateError } from "../utils/i18n.utils";`,
    );
  }
  // Insert after the last existing import line.
  const importLines = [...src.matchAll(/^import .+ from .+;\s*$/gm)];
  if (importLines.length === 0) return IMPORT_STATEMENT + "\n" + src;
  const last = importLines[importLines.length - 1];
  const insertPos = last.index + last[0].length;
  return src.slice(0, insertPos) + "\n" + IMPORT_STATEMENT + src.slice(insertPos);
};

walkTsFiles(SCAN_DIRS, (filePath) => {
  const original = fs.readFileSync(filePath, "utf8");
  let count = 0;
  const replace = (_whole, prefix, name) => {
    count += 1;
    return `${prefix}translateError(req, ${name}))`;
  };
  let updated = original.replace(PATTERN_AS_ERROR, replace).replace(PATTERN_BARE, replace);
  if (count === 0) return;

  updated = ensureImport(updated);
  wrapsApplied += count;
  filesChanged += 1;
  if (SHOW_DIFF) recordDiff(diffs, filePath, original, updated);
  if (!DRY_RUN) fs.writeFileSync(filePath, updated);
});

console.log("=== i18n codemod (catch-block translate) ===");
console.log(`Scanned: ${SCAN_DIRS.map((d) => path.relative(SERVERS_ROOT, d)).join(", ")}`);
console.log(`Files changed: ${filesChanged}`);
console.log(`Wraps applied: ${wrapsApplied}`);
if (DRY_RUN) console.log("(dry-run — no files written)");
if (SHOW_DIFF) printDiffSamples(diffs);
