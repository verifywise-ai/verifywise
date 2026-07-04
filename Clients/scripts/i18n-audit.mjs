#!/usr/bin/env node
/**
 * i18n gap audit — static scan of src/ for English strings that aren't
 * present in the German or French dictionaries.
 *
 * Usage:
 *   node scripts/i18n-audit.mjs            # human summary
 *   node scripts/i18n-audit.mjs --json     # JSON: { de: [...], fr: [...] }
 *   node scripts/i18n-audit.mjs --lang=de  # only DE
 *   node scripts/i18n-audit.mjs --strict   # exit 1 if any gaps (CI mode)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, "..", "src");
const TRANSLATIONS_PATH = join(SRC_DIR, "i18n", "translations.ts");
const SUPPORTED_LANGS = ["de", "fr", "es"];

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const strict = args.includes("--strict");
const langArg = args.find((a) => a.startsWith("--lang="))?.split("=")[1];
const targetLangs = langArg ? [langArg] : SUPPORTED_LANGS;

// ─── Load dictionaries ──────────────────────────────────────────────────────

function loadDict(lang) {
  const content = readFileSync(TRANSLATIONS_PATH, "utf8");
  const blockRe = new RegExp(`^\\s*${lang}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`, "m");
  const block = content.match(blockRe);
  if (!block) {
    throw new Error(`Could not find ${lang}: { ... } block in translations.ts`);
  }
  const keys = new Set();
  // Collect keys in any of the three forms Prettier may produce:
  //   "Foo bar":   "..."      (default — has special chars)
  //   Dashboard:   "..."      (bare identifier — Prettier strips quotes)
  //   'Click "X"': "..."      (single quotes — when content contains ")
  // Without handling all three, hundreds of dictionary entries silently
  // disappear from the audit's view whenever a formatter changes the file.
  const pairRe =
    /(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)'|([A-Za-z_$][\w$]*))\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  for (const m of block[1].matchAll(pairRe)) {
    // Unescape: \" → ", \' → ', \\ → \
    const raw = m[1] ?? m[2] ?? m[3];
    const key = raw.replace(/\\(["'\\])/g, "$1");
    keys.add(key);
  }
  return keys;
}

// ─── Walk src/ ──────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "__tests__",
  "test",
  "tests",
  "i18n", // skip our own dictionary file
]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, files);
    } else if ([".tsx", ".ts"].includes(extname(name))) {
      // Skip test files
      if (/\.test\.(tsx?|jsx?)$/.test(name)) continue;
      // Skip the StyleGuide page — it's full of dev-only demo strings
      if (full.includes("/pages/StyleGuide/")) continue;
      files.push(full);
    }
  }
  return files;
}

// ─── Extract English strings from a file ────────────────────────────────────

function extractStrings(content) {
  const found = new Set();

  // 1. JSX text nodes between tags: >Text Here< (inline or multi-line).
  //    The \s* on each side handles Prettier-formatted JSX where the text
  //    sits on its own line, e.g.:
  //        <Typography sx={...}>
  //          System Frameworks
  //        </Typography>
  //    Without \s*, the regex would require the capital letter to sit
  //    immediately after `>`, missing every multi-line text node.
  //    The negative lookbehind on `=` excludes TypeScript generics that look
  //    like JSX: `=> Promise<void>` would otherwise match `> Promise <`.
  const jsxRe = /(?<!=)>\s*([A-Z][A-Za-z0-9 ,.?!:;'"\-/&()]{2,200}?)\s*</g;
  for (const m of content.matchAll(jsxRe)) {
    found.add(m[1].trim());
  }

  // 2. Common UI props: label="...", title="...", placeholder="..." etc.
  //    Matches both JSX attribute form (prop="...") and object-property form
  //    (prop: "..."). The latter catches state-setter calls like
  //    `setAlert({ title: "Success", body: "Saved." })` which the JSX-only
  //    regex misses — those values still flow into rendered DOM text via the
  //    component, and the DOM walker needs them in the dictionary.
  const props = [
    "label",
    "title",
    "placeholder",
    "helperText",
    "tooltip",
    "description",
    "text",
    "message",
    "subtitle",
    "header",
    "heading",
    "buttonText",
    "confirmText",
    "cancelText",
    "emptyMessage",
    "errorMessage",
    "aria-label",
    "alt",
    "name",
    "submitButtonText",
    "body",
  ];
  for (const prop of props) {
    // JSX attribute: prop="..."
    const attrRe = new RegExp(`${prop}=["']([A-Z][A-Za-z0-9 ,.?!:;\\-/&()]{2,200})["']`, "g");
    for (const m of content.matchAll(attrRe)) {
      found.add(m[1].trim());
    }
    // Object property: prop: "..."  (with optional whitespace around `:`).
    // Anchored to a word-boundary so we don't pick up substrings of other
    // identifiers (e.g. `subtitle:` shouldn't match `subtle:`).
    const objRe = new RegExp(
      `\\b${prop}\\s*:\\s*["']([A-Z][A-Za-z0-9 ,.?!:;\\-/&()]{2,200})["']`,
      "g",
    );
    for (const m of content.matchAll(objRe)) {
      found.add(m[1].trim());
    }
  }

  return found;
}

// ─── Heuristic noise filter ─────────────────────────────────────────────────

// Style-guide demo strings that leak out of pages/StyleGuide because they
// also appear inline in component files. Translating them is pointless.
const KNOWN_DEMO_STRINGS = new Set([
  "Center",
  "Left",
  "Right",
  "Narrow",
  "Small",
  "None",
  "Default",
  "Custom",
  "Custom scorer only",
  "Cycle",
  "Label",
  "Size",
  "Placeholder",
  "Outlined",
  "Outlined Primary",
  "Primary",
  "Primary Small",
  "Secondary",
  "Text Primary",
  "Color theme",
  "Description for option 1",
  "Disabled State:",
  "Normal State:",
  "First item",
  "Second item",
  "Option 1",
  "Sample text",
  "Hover me",
  "Usage example",
  "With retrieval context",
  "VerifyWise", // brand name, doesn't translate
  // AI Trust Index — English content mirrored verbatim from the public website
  // feed/rubric (verifywise.ai/ai-trust-index.json). This surface displays the
  // upstream assessment in English by design; these labels are not translated.
  "Training-data use",
  "Data-subject rights",
  "Retention and deletion",
  "Third-party sharing",
  "Sensitive data and children",
  "Security and accountability",
  "Grade scale",
  "What the policy is silent or vague on",
]);

function isNoise(s) {
  if (KNOWN_DEMO_STRINGS.has(s)) return true;
  if (s.length < 3) return true;
  // CamelCase code identifier (no spaces, internal lowercase→uppercase
  // transition). Catches type names (SxProps, ColumnConfig), generic types
  // (Promise), and component imports that leak through the regex.
  if (!/\s/.test(s) && /[a-z][A-Z]/.test(s)) return true;
  // ALL-CAPS short tokens (often header constants)
  if (/^[A-Z0-9_]+$/.test(s) && s.length <= 15) return true;
  // Pure numbers / dates / IDs
  if (/^\d/.test(s)) return true;
  // URLs and emails
  if (/^https?:\/\//i.test(s)) return true;
  if (/@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return true;
  // File paths / regex-looking
  if (/^\/|\\\\/.test(s)) return true;
  return false;
}

// ─── Run audit ──────────────────────────────────────────────────────────────

const allFiles = walk(SRC_DIR);
const allStrings = new Set();
for (const file of allFiles) {
  const content = readFileSync(file, "utf8");
  for (const s of extractStrings(content)) {
    if (!isNoise(s)) allStrings.add(s);
  }
}

const result = {};
for (const lang of targetLangs) {
  const dict = loadDict(lang);
  const missing = Array.from(allStrings)
    .filter((s) => !dict.has(s))
    .sort();
  result[lang] = missing;
}

// ─── Output ─────────────────────────────────────────────────────────────────

if (wantJson) {
  process.stdout.write(JSON.stringify(result, null, 2));
  process.stdout.write("\n");
} else {
  console.log(`\nScanned ${allFiles.length} files in ${SRC_DIR}`);
  console.log(`Extracted ${allStrings.size} unique candidate strings.\n`);

  for (const lang of targetLangs) {
    const dict = loadDict(lang);
    const missing = result[lang];
    const have = allStrings.size - missing.length;
    const pct = allStrings.size === 0 ? 100 : Math.round((have * 100) / allStrings.size);
    console.log(
      `  ${lang.toUpperCase()}: ${dict.size} keys in dictionary | ${have}/${allStrings.size} extracted strings covered (${pct}%) | ${missing.length} gaps`,
    );
  }
  console.log();

  for (const lang of targetLangs) {
    const missing = result[lang];
    if (missing.length === 0) continue;
    console.log(`─── ${lang.toUpperCase()} gaps (first 30 of ${missing.length}) ───`);
    for (const s of missing.slice(0, 30)) {
      console.log(`  ${s}`);
    }
    if (missing.length > 30) {
      console.log(`  ... ${missing.length - 30} more. Run with --json for full list.`);
    }
    console.log();
  }
}

if (strict) {
  const totalGaps = Object.values(result).reduce((n, arr) => n + arr.length, 0);
  if (totalGaps > 0) {
    console.error(`i18n audit failed: ${totalGaps} gap(s) across ${targetLangs.join(", ")}`);
    process.exit(1);
  }
}
