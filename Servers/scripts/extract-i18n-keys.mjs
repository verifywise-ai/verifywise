#!/usr/bin/env node
/**
 * Extract every server message that reaches a translator and write them to
 * Servers/locales/en.json (English keys mapped to their English values, the
 * en-as-key convention).
 *
 * Usage:
 *   node scripts/extract-i18n-keys.mjs              # write en.json
 *   node scripts/extract-i18n-keys.mjs --dry-run    # print the diff against en.json only
 *   node scripts/extract-i18n-keys.mjs --report     # also list every key with where it is used
 *
 * The scan itself lives in lib/i18nCodeScanner.mjs (TypeScript AST, shared
 * with `npm run i18n:check-en`). It follows messages through constants,
 * lookup maps, helper parameters, returned result objects, string-literal
 * union types and relative imports, so en.json written here keeps every key
 * the code can send. Placeholders are named (`{email}`), never positional:
 * an interpolated template literal cannot match a dictionary key, so the
 * scanner reports it instead of inventing a key for it.
 *
 * Keys are written in `localeCompare` order. de.json and fr.json mirror that
 * order; `npm run i18n:audit:strict` checks they have the same keys.
 */
import fs from "node:fs";
import path from "node:path";
import { SERVERS_ROOT, localePath, readJson, writeJson } from "./lib/i18nScriptUtils.mjs";
import { scanServerMessages } from "./lib/i18nCodeScanner.mjs";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const REPORT = args.has("--report");

const OUT_PATH = localePath("en");
const scan = scanServerMessages();
const sorted = [...scan.keys.keys()].sort((a, b) => a.localeCompare(b));
const current = readJson(OUT_PATH, {});
const added = sorted.filter((k) => !(k in current));
const removed = Object.keys(current).filter((k) => !scan.keys.has(k));

const bySink = {};
for (const { sinks } of scan.keys.values()) {
  for (const s of sinks) bySink[s] = (bySink[s] ?? 0) + 1;
}

console.log("=== i18n key extraction ===");
console.log(`Scanned ${scan.files} files under ${path.basename(SERVERS_ROOT)}/`);
console.log({ ...bySink, totalUniqueKeys: sorted.length });
console.log(`Compared with en.json: ${added.length} added, ${removed.length} removed`);
for (const k of added) console.log(`  + ${k}`);
for (const k of removed) console.log(`  - ${k}`);
if (scan.templates.length > 0) {
  console.log(`\n${scan.templates.length} template literal(s) reach a translator (not extracted):`);
  for (const t of scan.templates) console.log(`  ${t.loc}  ${t.text}`);
}

if (REPORT) {
  console.log("\n--- keys ---");
  for (const k of sorted) {
    const { sinks, locs } = scan.keys.get(k);
    console.log(`  ${k}\n      [${[...sinks].join(", ")}] ${[...locs].slice(0, 3).join(" ")}`);
  }
}

if (!DRY_RUN) {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeJson(OUT_PATH, Object.fromEntries(sorted.map((k) => [k, k])));
  console.log(`\nWrote ${sorted.length} keys to ${path.relative(SERVERS_ROOT, OUT_PATH)}`);
  if (added.length || removed.length) {
    console.log("Update de.json and fr.json to match, then run `npm run i18n:audit:strict`.");
  }
}
