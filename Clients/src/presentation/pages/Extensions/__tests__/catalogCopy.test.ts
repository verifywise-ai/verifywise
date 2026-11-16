import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { translations } from "../../../../i18n/translations";
import {
  CATEGORY_LABEL,
  EXTENSION_CATALOG_COPY,
  EXTENSION_CONFIG_FIELD_COPY,
  EXTENSION_DISABLED_MESSAGE,
  EXTENSION_ENABLED_MESSAGE,
} from "../catalogCopy";

// Resolve with node:path: Vite rewrites `new URL(..., import.meta.url)` into an
// asset import, which it refuses for files outside Clients/.
const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../Servers/database/migrations",
);
const readMigration = (name: string) => readFileSync(resolve(MIGRATIONS_DIR, name), "utf8");

const SEED = readMigration("20260811102307-extensions-migration.js");
const JIRA_INCIDENTS = readMigration("20261014214049-jira-incidents-extension.js");
const FRAMEWORK_IMPORT = readMigration("20261111092001-framework-import-extension.js");
const CATALOG_COPY = readMigration("20261116005338-extension-catalog-copy.js");
// The values the latest catalog migration writes (its NEW_VALUES block).
const LATEST_VALUES = CATALOG_COPY.slice(
  CATALOG_COPY.indexOf("const NEW_VALUES"),
  CATALOG_COPY.indexOf("const OLD_VALUES"),
);

/** The `{ ... }` entry for one extension key in the NEW_VALUES block, if any. */
const latestEntry = (key: string): string | null => {
  const quoted = /^[a-z]+$/.test(key) ? key : `"${key}"`;
  const start = LATEST_VALUES.indexOf(`\n  ${quoted}: {`);
  if (start < 0) return null;
  return LATEST_VALUES.slice(start, LATEST_VALUES.indexOf("\n  },", start));
};

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
  "enabled",
  "disabled",
  "Where it shows up",
  "AI risks → Add new risk → Import from Excel",
  "Datasets → Bulk upload",
  "Frameworks → Manage frameworks → Import framework from Excel",
  "Ask an Admin to set up MLflow.",
  "Ask an Admin to set up Azure AI Foundry.",
  "item",
  "items",
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

  it.each(catalog)("%s matches the text the migrations write", (key, copy) => {
    const latest = latestEntry(key);
    if (latest) {
      expect(latest).toContain(`name: ${JSON.stringify(copy.displayName)}`);
      expect(latest).toContain(`display_name: ${JSON.stringify(copy.displayName)}`);
      expect(latest).toContain(JSON.stringify(copy.description));
    } else {
      // Not rewritten since its seed: the seed text is the current text.
      const seed = SEED + JIRA_INCIDENTS + FRAMEWORK_IMPORT;
      expect(seed).toContain(`display_name: ${JSON.stringify(copy.displayName)}`);
      // Long descriptions sit on the line after `description:`.
      expect(seed).toContain(JSON.stringify(copy.description));
    }
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
