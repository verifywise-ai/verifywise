#!/usr/bin/env node
/**
 * Apply hand-curated translations to the locale dictionaries.
 *
 * Reads `/tmp/translation-batch.json` (overridable as the first arg) of shape:
 *   { "<en key>": { "de": "...", "fr": "..." }, ... }
 *
 * For each entry, merges the per-language value into the matching dictionary
 * if (a) the key exists in en.json, and (b) the new value differs from both
 * the English source and the existing entry. Other dictionary entries are
 * untouched, so prior translations survive.
 *
 * Languages are auto-discovered from `Servers/locales/*.json` (excluding
 * en.json). Adding a 4th language only needs the new dictionary file plus
 * matching keys in the batch.
 *
 * Usage:
 *   node scripts/apply-translations.mjs                     # default path
 *   node scripts/apply-translations.mjs <input.json>        # custom path
 */
import fs from "node:fs";
import path from "node:path";
import { SERVERS_ROOT, readJson, writeJson, localePath } from "./lib/i18nScriptUtils.mjs";

const inputPath = process.argv[2] || "/tmp/translation-batch.json";
const batch = readJson(inputPath);

const en = readJson(localePath("en"));
const LANGS = fs
  .readdirSync(path.join(SERVERS_ROOT, "locales"))
  .filter((f) => f.endsWith(".json") && f !== "en.json")
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

const dicts = Object.fromEntries(LANGS.map((l) => [l, readJson(localePath(l))]));
const updated = Object.fromEntries(LANGS.map((l) => [l, 0]));
let skippedMissing = 0;
let skippedAlreadyTranslated = 0;

for (const [key, trans] of Object.entries(batch)) {
  if (!(key in en)) {
    skippedMissing++;
    continue;
  }
  for (const lang of LANGS) {
    const value = trans[lang];
    if (typeof value !== "string" || value === en[key]) continue;
    if (dicts[lang][key] === value) {
      skippedAlreadyTranslated++;
      continue;
    }
    dicts[lang][key] = value;
    updated[lang]++;
  }
}

for (const lang of LANGS) writeJson(localePath(lang), dicts[lang]);

console.log(`=== apply-translations from ${path.relative(SERVERS_ROOT, inputPath)} ===`);
console.log(`Batch entries: ${Object.keys(batch).length}`);
for (const lang of LANGS) console.log(`${lang.toUpperCase()} updated: ${updated[lang]}`);
console.log(`Skipped (missing in en.json): ${skippedMissing}`);
console.log(`Skipped (no change): ${skippedAlreadyTranslated}`);
