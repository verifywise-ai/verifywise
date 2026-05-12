#!/usr/bin/env node
/**
 * Backend i18n audit — checks the translation dictionaries are in sync.
 *
 *   - en.json is the source of truth (extracted from source by
 *     `extract-i18n-keys.mjs`).
 *   - de.json / fr.json are checked for: (a) keys present in en.json but
 *     missing or untranslated (value === English), and (b) stale keys
 *     present in de/fr but no longer in en.
 *
 * Three failure modes:
 *   - missing: key in en, absent from de/fr.
 *   - untranslated: key in de/fr but value === English source (lookup is a
 *     no-op at runtime; user sees English).
 *   - stale: key in de/fr, absent from en (former English string, now removed).
 *
 * Usage:
 *   node scripts/i18n-audit.mjs                # human summary
 *   node scripts/i18n-audit.mjs --json         # JSON output for tooling
 *   node scripts/i18n-audit.mjs --lang=de      # only DE
 *   node scripts/i18n-audit.mjs --strict       # exit 1 if any missing/stale
 *   node scripts/i18n-audit.mjs --strict-all   # exit 1 if any untranslated either
 *   node scripts/i18n-audit.mjs --report       # list every gap (long output)
 *
 * In CI: prefer --strict (catches drift introduced by PRs without failing the
 * build over the existing untranslated baseline). Use --strict-all once the
 * dictionary is fully translated.
 */
import fs from "node:fs";
import path from "node:path";
import { SERVERS_ROOT, readJson, localePath } from "./lib/i18nScriptUtils.mjs";

const LOCALES_DIR = path.join(SERVERS_ROOT, "locales");

// Discover supported languages from disk: every `<lang>.json` in locales/ that
// isn't `en.json`. This auto-includes new languages as they're added without
// requiring a sync between this script and `utils/i18n.utils.ts`.
const SUPPORTED_LANGS = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json") && f !== "en.json")
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

const args = new Set(process.argv.slice(2));
const wantJson = args.has("--json");
const strict = args.has("--strict");
const strictAll = args.has("--strict-all");
const wantReport = args.has("--report");
const langArg = [...args].find((a) => a.startsWith("--lang="))?.split("=")[1];
const targetLangs = langArg ? [langArg] : SUPPORTED_LANGS;

const en = readJson(localePath("en"));
const enKeys = Object.keys(en);

const results = {};
for (const lang of targetLangs) {
  const dict = readJson(localePath(lang));
  const missing = enKeys.filter((k) => !(k in dict));
  const untranslated = enKeys.filter((k) => k in dict && dict[k] === en[k]);
  const stale = Object.keys(dict).filter((k) => !(k in en));
  const translated = enKeys.length - missing.length - untranslated.length;
  const coveragePct = enKeys.length === 0 ? 100 : Math.round((translated / enKeys.length) * 100);

  results[lang] = { missing, untranslated, stale, translated, coveragePct };
}

if (wantJson) {
  // JSON consumers always get the full key arrays — `--report` is implicit.
  console.log(JSON.stringify({ enKeys: enKeys.length, langs: results }, null, 2));
} else {
  console.log("=== i18n audit ===");
  console.log(`Source keys (en.json): ${enKeys.length}`);
  for (const lang of targetLangs) {
    const r = results[lang];
    console.log(`\n${lang.toUpperCase()}:`);
    console.log(`  translated:   ${r.translated} (${r.coveragePct}%)`);
    console.log(`  missing:      ${r.missing.length}`);
    console.log(`  untranslated: ${r.untranslated.length}`);
    console.log(`  stale:        ${r.stale.length}`);
    if (wantReport) {
      if (r.missing.length > 0) {
        console.log(`\n  --- ${lang.toUpperCase()} missing ---`);
        r.missing.forEach((k) => console.log("    " + k));
      }
      if (r.stale.length > 0) {
        console.log(`\n  --- ${lang.toUpperCase()} stale ---`);
        r.stale.forEach((k) => console.log("    " + k));
      }
      if (r.untranslated.length > 0) {
        console.log(`\n  --- ${lang.toUpperCase()} untranslated (sample, first 20) ---`);
        r.untranslated.slice(0, 20).forEach((k) => console.log("    " + k));
        if (r.untranslated.length > 20) {
          console.log(`    ... and ${r.untranslated.length - 20} more`);
        }
      }
    }
  }
}

// Exit code policy
const rows = Object.values(results);
const anyDrift = rows.some((r) => r.missing.length > 0 || r.stale.length > 0);
const anyUntranslated = rows.some((r) => r.untranslated.length > 0);
if (strictAll && (anyDrift || anyUntranslated)) process.exit(1);
if (strict && anyDrift) process.exit(1);
