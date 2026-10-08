import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { translations } from "../translations";

// The questionnaire and result text is served by the backend and translated in
// the DOM, so the static i18n audit cannot see it. Read the source files.
// Resolve with node:path: Vite rewrites `new URL(..., import.meta.url)` into an
// asset import, which it refuses for files outside Clients/.
const SOURCE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../Servers/services/euAiActClassification",
);
const read = (file: string) => readFileSync(resolve(SOURCE_DIR, file), "utf8");
const SOURCE = read("questionnaire.v2.ts") + read("score.v2.ts");
const strings = [
  ...new Set(
    [...SOURCE.matchAll(/\b(?:text|label|description|help):\s*"((?:[^"\\]|\\.)+)"/g)].map((m) =>
      m[1].replace(/\\"/g, '"'),
    ),
  ),
];

describe("EU AI Act questionnaire translations", () => {
  it("found the questionnaire strings", () => {
    expect(strings.length).toBeGreaterThan(80);
  });

  it.each(["de", "fr", "es"] as const)("every string has a %s translation", (lang) => {
    const missing = strings.filter((s) => !translations[lang]?.[s]);
    expect(missing).toEqual([]);
  });
});
