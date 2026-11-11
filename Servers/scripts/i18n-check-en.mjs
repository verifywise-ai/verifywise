#!/usr/bin/env node
/**
 * CI check: Servers/locales/en.json must match the messages in the code.
 *
 * `i18n:audit:strict` checks de.json and fr.json against en.json; this checks
 * en.json against the code, so a new server message cannot ship without a
 * key (and so without a German or French translation).
 *
 * Fails (exit 1) when:
 *   - missing:   a message reaches a translator but has no en.json key
 *   - unused:    an en.json key is no longer sent by any code
 *   - bare:      STATUS_CODE[n]("literal") sends a message without req.t
 *   - template:  a template literal reaches req.t / translate / STATUS_CODE,
 *                which can never match a key (use a key with named
 *                placeholders: req.t!("Invalid email: {email}", { email }))
 *
 * Email subjects that are not translated yet, and in-app titles sent as fixed
 * English, are listed with --report but do not fail. An en.json key for such
 * a subject may stay (its translation is ready) but is not required.
 *
 * Usage:
 *   node scripts/i18n-check-en.mjs            # summary, then each problem
 *   node scripts/i18n-check-en.mjs --report   # also list untranslated subjects and titles
 *
 * Fix missing/unused keys with `npm run i18n:extract`, then add or remove the
 * same keys in de.json and fr.json (`npm run i18n:audit:strict` must pass).
 */
import { localePath, readJson } from "./lib/i18nScriptUtils.mjs";
import { scanServerMessages } from "./lib/i18nCodeScanner.mjs";

const REPORT = process.argv.includes("--report");

const scan = scanServerMessages();
const en = readJson(localePath("en"));

const missing = [...scan.keys.keys()].filter((k) => !(k in en)).sort();
const unused = Object.keys(en)
  .filter((k) => !scan.keys.has(k) && !scan.subjectKeys.has(k))
  .sort();

console.log("=== i18n check: en.json against the code ===");
console.log(`Scanned files:              ${scan.files}`);
console.log(`Messages in code:           ${scan.keys.size}`);
console.log(`Keys in en.json:            ${Object.keys(en).length}`);
console.log(`Missing from en.json:       ${missing.length}`);
console.log(`Unused en.json keys:        ${unused.length}`);
console.log(`Bare STATUS_CODE messages:  ${scan.bareStatus.length}`);
console.log(`Template literal messages:  ${scan.templates.length}`);
console.log(`Untranslated email subjects (not checked): ${scan.untranslatedSubjects.length}`);
console.log(`Untranslated in-app titles (not checked):  ${scan.untranslatedTitles.length}`);

const section = (title, rows) => {
  if (rows.length === 0) return;
  console.log(`\n--- ${title} ---`);
  for (const r of rows) console.log(`  ${r}`);
};
const where = (k) => [...scan.keys.get(k).locs].slice(0, 2).join(", ");

section(
  "missing from en.json (run `npm run i18n:extract`, then translate in de.json/fr.json)",
  missing.map((k) => `${JSON.stringify(k)}  (${where(k)})`),
);
section(
  "unused en.json keys (remove from en.json, de.json and fr.json)",
  unused.map((k) => JSON.stringify(k)),
);
section(
  'bare STATUS_CODE messages (wrap as STATUS_CODE[n](req.t!("...")))',
  scan.bareStatus.map((b) => `${b.loc}  ${JSON.stringify(b.value)}`),
);
section(
  "template literals sent as messages (use a key with named placeholders)",
  scan.templates.map((t) => `${t.loc}  ${t.text}`),
);
if (REPORT) {
  section(
    "untranslated email subjects",
    scan.untranslatedSubjects.map((s) => `${s.loc}  ${JSON.stringify(s.key)}`),
  );
  section(
    "in-app titles sent as fixed English (use titleKey)",
    scan.untranslatedTitles.map((t) => `${t.loc}  ${t.text}`),
  );
}

const failed = missing.length + unused.length + scan.bareStatus.length + scan.templates.length > 0;
console.log(failed ? "\nFAILED" : "\nOK");
process.exit(failed ? 1 : 0);
