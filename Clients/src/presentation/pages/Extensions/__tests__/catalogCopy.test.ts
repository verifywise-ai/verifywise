import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { translations } from "../../../../i18n/translations";
import {
  CATEGORY_LABEL,
  EXTENSION_DISABLED_MESSAGE,
  EXTENSION_ENABLED_MESSAGE,
} from "../catalogCopy";
import { EXTENSION_CATALOG_COPY, EXTENSION_CONFIG_FIELD_COPY } from "./catalogCopy.fixture";

// Resolve with node:path: Vite rewrites `new URL(..., import.meta.url)` into an
// asset import, which it refuses for files outside Clients/.
const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../Servers/database/migrations",
);

const SEED_FILE = "20260811102307-extensions-migration.js";
const SEED = readFileSync(resolve(MIGRATIONS_DIR, SEED_FILE), "utf8");

/** Every migration that touches the extensions table, in the order they run. */
const EXTENSION_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".js"))
  .sort()
  .map((name) => ({ name, text: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8") }))
  .filter(({ text }) => /verifywise\.extensions\b/.test(text) || text.includes("EXTENSIONS_SEED"));

const JS_STRING = String.raw`"((?:[^"\\]|\\.)*)"`;
const SQL_STRING = String.raw`'((?:[^']|'')*)'`;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const jsString = (literal: string) => JSON.parse(`"${literal}"`) as string;

type CatalogText = { displayName?: string; description?: string };

/** `display_name: "..."` and `description: "..."` inside a JS object literal. */
function fromObjectLiteral(block: string): CatalogText {
  const name = block.match(new RegExp(String.raw`\bdisplay_name:\s*` + JS_STRING));
  const description = block.match(new RegExp(String.raw`\bdescription:\s*` + JS_STRING));
  return {
    displayName: name ? jsString(name[1]) : undefined,
    description: description ? jsString(description[1]) : undefined,
  };
}

/**
 * What one migration's up() writes for an extension, in the three shapes the
 * migrations use: a seed object (`key: "slack", ... display_name, description`),
 * a keyed values block (`slack: { display_name, description }`, read from
 * NEW_VALUES when the file has one, since OLD_VALUES is down()), or a SQL
 * VALUES tuple (`('key', 'name', 'display name', 'description'`).
 */
function catalogWrite(text: string, key: string): CatalogText | null {
  const write = findCatalogWrite(text, escapeRegExp(key));
  return write && (write.displayName !== undefined || write.description !== undefined)
    ? write
    : null;
}

function findCatalogWrite(text: string, k: string): CatalogText | null {
  const seed = text.match(new RegExp(String.raw`\bkey:\s*"` + k + String.raw`",`));
  if (seed?.index !== undefined) {
    const rest = text.slice(seed.index + seed[0].length);
    const next = rest.search(/\bkey:\s*"/);
    return fromObjectLiteral(next < 0 ? rest : rest.slice(0, next));
  }

  const upValues = text.includes("const NEW_VALUES")
    ? text.slice(text.indexOf("const NEW_VALUES"), text.indexOf("const OLD_VALUES"))
    : text;
  const keyed = upValues.match(
    new RegExp(String.raw`\n\s*(?:"` + k + String.raw`"|` + k + String.raw`):\s*\{`),
  );
  if (keyed?.index !== undefined) {
    const rest = upValues.slice(keyed.index + keyed[0].length);
    return fromObjectLiteral(rest.slice(0, rest.indexOf("}")));
  }

  const sql = text.match(
    new RegExp(
      String.raw`\(\s*'` +
        k +
        String.raw`',\s*` +
        SQL_STRING +
        String.raw`,\s*` +
        SQL_STRING +
        String.raw`,\s*` +
        SQL_STRING,
    ),
  );
  if (sql) {
    const unquote = (value: string) => value.replace(/''/g, "'");
    return { displayName: unquote(sql[2]), description: unquote(sql[3]) };
  }
  return null;
}

/** Writes name or description text in a way catalogWrite cannot read. */
const writesCatalogText = (text: string) =>
  /UPDATE\s+verifywise\.extensions[\s\S]{0,300}?\bSET\b[\s\S]{0,300}?\b(display_name|description)\b/.test(
    text,
  );

/** The text an extension has after every migration has run. */
function effectiveCatalogText(key: string): { text: CatalogText; from: string[] } {
  const text: CatalogText = {};
  const from: string[] = [];
  for (const migration of EXTENSION_MIGRATIONS) {
    const write = catalogWrite(migration.text, key);
    if (!write) continue;
    if (write.displayName !== undefined) text.displayName = write.displayName;
    if (write.description !== undefined) text.description = write.description;
    from.push(migration.name);
  }
  return { text, from };
}

/** The client-side literals on the extension pages that the i18n audit cannot see. */
const CLIENT_LITERALS = [
  "Configure to enable",
  "Configuration required",
  "Extension",
  "Configure and enable this extension.",
  "Enable failed",
  "Disable failed",
  "Save failed",
  "Test failed",
  "Failed to load extension",
  "{name} enabled.",
  "{name} disabled.",
  "Where it shows up",
  "AI risks → Add new risk → Import from Excel",
  "Datasets → Bulk upload",
  "Frameworks → Manage frameworks → Import framework from Excel",
  "Ask an Admin to set up MLflow.",
  "Ask an Admin to set up Azure AI Foundry.",
  "{count} item",
  "{count} items",
];

const catalog = Object.entries(EXTENSION_CATALOG_COPY);
const fieldStrings = Object.values(EXTENSION_CONFIG_FIELD_COPY).flatMap((f) => [
  ...f.labels,
  ...f.optionLabels,
  ...f.helpTexts,
]);

const TRANSLATED = [
  ...catalog.filter(([, c]) => !c.isProductName).map(([, c]) => c.displayName),
  ...catalog.map(([, c]) => c.description),
  ...Object.values(CATEGORY_LABEL),
  ...fieldStrings,
  ...Object.values(EXTENSION_ENABLED_MESSAGE),
  ...Object.values(EXTENSION_DISABLED_MESSAGE),
  ...CLIENT_LITERALS,
];

describe("extension catalog copy", () => {
  it("lists the nine extensions with a sentence for each", () => {
    expect(catalog).toHaveLength(9);
    for (const [key] of catalog) {
      expect(EXTENSION_ENABLED_MESSAGE[key]).toBeTruthy();
      expect(EXTENSION_DISABLED_MESSAGE[key]).toBeTruthy();
    }
  });

  it.each(catalog)("%s matches the text the latest migration writes", (key, copy) => {
    const { text, from } = effectiveCatalogText(key);
    expect(from.length).toBeGreaterThan(0);
    expect(text.displayName).toBe(copy.displayName);
    expect(text.description).toBe(copy.description);
  });

  it("reads every migration that rewrites catalog text", () => {
    // A rewrite in a shape catalogWrite cannot parse would leave the text
    // above checked against an older migration: fail instead.
    const unread = EXTENSION_MIGRATIONS.filter(
      ({ text }) =>
        writesCatalogText(text) && catalog.every(([key]) => catalogWrite(text, key) === null),
    ).map(({ name }) => name);
    expect(unread).toEqual([]);
  });

  it("matches the seeded configuration fields", () => {
    for (const label of Object.values(EXTENSION_CONFIG_FIELD_COPY).flatMap((f) => [
      ...f.labels,
      ...f.optionLabels,
    ])) {
      expect(SEED).toContain(`label: ${JSON.stringify(label)}`);
    }
    for (const help of Object.values(EXTENSION_CONFIG_FIELD_COPY).flatMap((f) => f.helpTexts)) {
      expect(SEED).toContain(`help_text: ${JSON.stringify(help)}`);
    }
  });

  it.each(["de", "fr", "es"] as const)("every catalog string has a %s translation", (lang) => {
    const missing = TRANSLATED.filter((s) => !translations[lang]?.[s]);
    expect(missing).toEqual([]);
  });
});
