/**
 * Shared helpers for the i18n extraction and codemod scripts.
 *
 * Keeping the walker, regex constants, arg parsing, and diff-collection in one
 * place avoids drift when scan rules change (e.g. adding a new excluded
 * directory or test-file suffix).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
export const SERVERS_ROOT = path.resolve(path.dirname(__filename), "..", "..");

// Captures the inner contents of "..." or '...' as group 1 / group 2 (whichever
// matched). Used by both the extractor (find calls to wrap) and the codemod
// (find calls to rewrite).
export const STATIC_STR_PATTERN = String.raw`(?:"((?:[^"\\]|\\.)*?)"|'((?:[^'\\]|\\.)*?)')`;

const SKIP_DIRS = new Set(["__tests__", "tests"]);
const SKIP_FILE_SUFFIXES = [/\.test\.ts$/, /\.spec\.ts$/];
const TS_FILE = /\.ts$/;

/**
 * Walk one or more roots, calling `onFile(absolutePath)` for each `.ts` file
 * that isn't a test fixture. Roots that don't exist are silently skipped.
 */
export function walkTsFiles(roots, onFile) {
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(p);
      } else if (
        entry.isFile() &&
        TS_FILE.test(entry.name) &&
        !SKIP_FILE_SUFFIXES.some((re) => re.test(entry.name))
      ) {
        onFile(p);
      }
    }
  };
  for (const root of roots) visit(root);
}

/**
 * Parse the standard `--dry-run` / `--diff` flags shared by every script.
 */
export function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    DRY_RUN: args.has("--dry-run"),
    SHOW_DIFF: args.has("--diff"),
  };
}

/**
 * Find the first line that changed between two file versions and append it to
 * `diffs` (capped at `cap`). Used by codemods to surface a sample diff per
 * file without producing a full unified-diff dump.
 */
export function recordDiff(diffs, filePath, original, updated, cap = 10) {
  if (diffs.length >= cap) return;
  const origLines = original.split("\n");
  const newLines = updated.split("\n");
  for (let i = 0; i < origLines.length; i++) {
    if (origLines[i] !== newLines[i]) {
      diffs.push({
        file: path.relative(SERVERS_ROOT, filePath),
        line: i + 1,
        before: origLines[i].trim(),
        after: newLines[i].trim(),
      });
      return;
    }
  }
}

/**
 * Render the diff samples block printed by both codemods.
 */
export function printDiffSamples(diffs) {
  console.log("\n--- sample diffs (first changed line per file, max 10) ---");
  for (const d of diffs) {
    console.log(`\n${d.file}:${d.line}`);
    console.log(`  - ${d.before}`);
    console.log(`  + ${d.after}`);
  }
}

/**
 * Read a JSON file. If `defaultValue` is provided, returns it on any read or
 * parse error; otherwise lets the error throw. Used by the i18n scripts to
 * load locale dictionaries.
 */
export function readJson(filePath, defaultValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    if (arguments.length >= 2) return defaultValue;
    throw err;
  }
}

/**
 * Write an object as pretty-printed JSON with a trailing newline (matches the
 * format the audit and other scripts already produce on disk).
 */
export function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Convenience: locale dictionary path within Servers/locales/.
 */
export function localePath(lang) {
  return path.join(SERVERS_ROOT, "locales", `${lang}.json`);
}
