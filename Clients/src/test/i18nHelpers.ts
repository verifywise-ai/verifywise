/**
 * Helpers for tests that render a screen in German, French or Spanish through
 * the real DOM translator and the real dictionary (nothing about translation is
 * mocked), then check what ended up on screen.
 *
 * The translator's own gap audit (`vw_audit`) is the safety net: it records every
 * text node it could not find in the dictionary. It also re-reads text it just
 * wrote, so translated output shows up too. `expectNoUntranslatedText` therefore
 * subtracts what the test expects (`tr`/`plain`), the dictionary's own
 * translations and the fixture data, and fails on whatever is left.
 */

import { expect } from "vitest";
import { initDomTranslator } from "../i18n/domTranslator";
import { translations, type Lang } from "../i18n/translations";
import { fill } from "../i18n/fill";
import { storageService } from "../infrastructure/storage";

export const LANGS = ["de", "fr", "es"] as const satisfies readonly Lang[];

interface TranslatorDebug {
  __vwI18nGaps: () => Record<string, string[]>;
  __vwI18nClear: () => void;
}
const debug = () => window as unknown as TranslatorDebug;

const expected = new Set<string>();

/**
 * Switch the app language and turn the translator's gap audit on or off.
 *
 * Resolves once the language's dictionary has loaded. The translator sets the
 * language before its dictionary arrives, so rendering earlier would let the
 * observer translate with the previous test's dictionary (the app reloads the
 * page on such a switch; a test cannot) and would record English text the
 * audit then reports as missing.
 */
export const setLanguage = async (lang: Lang, audit = false): Promise<void> => {
  storageService.setRaw("vw_audit", audit ? "1" : "0", { raw: true });
  storageService.set("language", lang);
  const loaded = new Promise<void>((resolve) =>
    window.addEventListener("vw:languagechange", () => resolve(), { once: true }),
  );
  initDomTranslator();
  await loaded;
};

/** Start a test with a clean audit and no remembered expectations. */
export const resetAudit = () => {
  debug().__vwI18nClear();
  expected.clear();
};

/** Records text a test composes from translated parts (a joined cell, a heading). */
export const plain = (text: string) => {
  expected.add(text);
  return text;
};

/** The dictionary's text for `key` with its placeholders filled; throws if the key is missing. */
export const tr = (lang: Lang, key: string, values: Record<string, string | number> = {}) => {
  const text = translations[lang][key];
  if (text === undefined) throw new Error(`"${key}" is missing from the ${lang} dictionary`);
  return plain(fill(text, values));
};

/**
 * The shared table footer ("Showing 1 - 5 of 15 pairs", "Page 1 of 3") is built
 * from fragments in StandardTablePagination, which is the same on every table in
 * the app and has no translations anywhere. Not specific to any one screen.
 */
const SHARED_PAGINATION = [
  /^Showing$/,
  /^Page \d+ of \d+$/,
  /^(risk|pair|signal|reason|vendor)s?$/,
];

/**
 * Fails on rendered text that is neither translated, expected nor fixture data.
 * Data (risk names, people, joined detail text) is never translated, so each
 * test lists the fixtures it put on screen.
 */
export const expectNoUntranslatedText = (lang: Lang, fixtures: ReadonlySet<string>) => {
  const translated = new Set(Object.values(translations[lang]));
  const gaps = debug().__vwI18nGaps()[lang] ?? [];
  expect(
    gaps.filter(
      (text) =>
        !expected.has(text) &&
        !translated.has(text) &&
        !fixtures.has(text) &&
        !SHARED_PAGINATION.some((pattern) => pattern.test(text)),
    ),
  ).toEqual([]);
};
