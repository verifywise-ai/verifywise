import fs from "fs";
import path from "path";

export const SUPPORTED_LANGS = ["en", "de", "fr"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_LANGS);
const LOCALES_DIR = path.resolve(__dirname, "..", "locales");

const loadDict = (lang: SupportedLang): Record<string, string> => {
  try {
    const raw = fs.readFileSync(path.join(LOCALES_DIR, `${lang}.json`), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[i18n] Failed to load locales/${lang}.json:`, err);
    return {};
  }
};

const dicts: Record<SupportedLang, Record<string, string>> = {
  en: loadDict("en"),
  de: loadDict("de"),
  fr: loadDict("fr"),
};

// Observability: if a non-English dict is empty, every DE/FR request silently
// serves English. Surface this loudly at boot so it gets caught before users do.
for (const lang of SUPPORTED_LANGS) {
  if (lang === "en") continue;
  if (Object.keys(dicts[lang]).length === 0) {
    console.warn(
      `[i18n] WARNING: locales/${lang}.json is empty or unreadable. ` +
        `All ${lang} requests will fall back to English. ` +
        `Check the deploy step that copies locales/ to dist/locales/.`,
    );
  }
}

const interpolate = (s: string, vars?: Record<string, string | number>): string => {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
};

const buildTranslator = (lang: SupportedLang): Translator => {
  const dict = dicts[lang];
  return (key, vars) => interpolate(dict[key] ?? key, vars);
};

const translators: Record<SupportedLang, Translator> = {
  en: buildTranslator("en"),
  de: buildTranslator("de"),
  fr: buildTranslator("fr"),
};

export const isSupportedLang = (lang: unknown): lang is SupportedLang =>
  typeof lang === "string" && SUPPORTED_SET.has(lang);

export const getTranslator = (lang: SupportedLang): Translator => translators[lang];

/**
 * Translate a key for callers without a `req` (e.g. BullMQ jobs, email helpers
 * called outside an HTTP request). Falls back to English when the language is
 * unsupported or the key is missing from the dictionary.
 *
 * Convention: in route handlers and controllers where `req` is in scope, use
 * `req.t!(key, vars)`. In services/utils that receive only a `lang` string
 * threaded through, use `translate(lang, key, vars)`.
 */
export const translate = (
  lang: string | undefined,
  key: string,
  vars?: Record<string, string | number>,
): string => {
  const resolved: SupportedLang = isSupportedLang(lang) ? lang : "en";
  return translators[resolved](key, vars);
};

/**
 * Translate a caught error using the request translator. Prefers `i18nKey` /
 * `i18nVars` (set on CustomException for dynamic messages) and falls back to
 * the literal `error.message`. The catch block can use the result directly:
 *
 *     STATUS_CODE[500](translateError(req, error))
 *
 * Defensive against missing `req.t` (would only happen if i18nMiddleware did
 * not run on this request — falls back to the English translator).
 */
export const translateError = (req: { t?: Translator }, error: unknown): string => {
  const t = req.t ?? translators.en;
  if (error && typeof error === "object") {
    const e = error as { i18nKey?: unknown; i18nVars?: unknown; message?: unknown };
    if (typeof e.i18nKey === "string") {
      const vars =
        e.i18nVars && typeof e.i18nVars === "object"
          ? (e.i18nVars as Record<string, string | number>)
          : undefined;
      return t(e.i18nKey, vars);
    }
    if (typeof e.message === "string") return t(e.message);
  }
  return t(String(error));
};
