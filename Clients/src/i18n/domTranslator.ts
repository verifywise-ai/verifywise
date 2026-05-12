import { translations, type Lang } from "./translations";

const STORAGE_KEY = "vw_lang_prototype";
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

let currentLang: Lang = "en";
let observer: MutationObserver | null = null;
let dict: Record<string, string> = {};

// ─── i18n gap audit ──────────────────────────────────────────────────────────
// Enable with `localStorage.setItem("vw_audit", "1")` and reload. While active,
// every untranslated text node / attribute we encounter is logged to the
// console (deduplicated, throttled). Use `__vwI18nGaps()` in the console to
// dump the full list as JSON ready to paste into translations.ts.

const AUDIT_KEY = "vw_audit";
const auditMisses = new Map<string, Set<string>>(); // lang → set of source strings
let auditFlushTimer: ReturnType<typeof setTimeout> | null = null;

const isAuditOn = () => typeof window !== "undefined" && localStorage.getItem(AUDIT_KEY) === "1";

const looksLikeDynamicData = (s: string): boolean => {
  // Skip strings we'd never want to translate so the log isn't drowned in noise.
  if (s.length < 3) return true;
  if (/^\d/.test(s)) return true; // numbers, dates, IDs
  if (/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return true; // email
  if (/^https?:\/\//i.test(s)) return true; // URLs
  if (/^[\w-]+\/[\w.-]+$/.test(s)) return true; // paths / repo slugs
  if (!/[a-zA-Z]/.test(s)) return true; // pure punctuation/symbols
  if (/^\s*$/.test(s)) return true;
  return false;
};

const recordMiss = (text: string) => {
  if (!isAuditOn()) return;
  if (currentLang === "en") return;
  const trimmed = text.trim();
  if (!trimmed) return;
  if (looksLikeDynamicData(trimmed)) return;
  if (dict[trimmed]) return;

  let bucket = auditMisses.get(currentLang);
  if (!bucket) {
    bucket = new Set();
    auditMisses.set(currentLang, bucket);
  }
  if (bucket.has(trimmed)) return;
  bucket.add(trimmed);

  // Throttle console output: log a count line at most every 500ms.
  if (auditFlushTimer) return;
  auditFlushTimer = setTimeout(() => {
    auditFlushTimer = null;
    const total = Array.from(auditMisses.values()).reduce((n, s) => n + s.size, 0);
    console.warn(`[i18n] ${total} missing string(s) so far. Run __vwI18nGaps() for the full list.`);
  }, 500);
};

if (typeof window !== "undefined") {
  (window as any).__vwI18nGaps = () => {
    const out: Record<string, string[]> = {};
    for (const [lang, set] of auditMisses) {
      out[lang] = Array.from(set).sort();
    }
    console.log(JSON.stringify(out, null, 2));
    return out;
  };
  (window as any).__vwI18nClear = () => {
    auditMisses.clear();
    console.log("[i18n] gap audit cleared.");
  };
}

const SUPPORTED: Lang[] = ["en", "de", "fr"];

const getCurrentLang = (): Lang => {
  const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
  return stored && SUPPORTED.includes(stored) ? stored : "en";
};

const setCurrentLang = (lang: Lang) => {
  localStorage.setItem(STORAGE_KEY, lang);
  currentLang = lang;
  dict = lang === "en" ? {} : translations[lang] || {};
};

const translate = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const translated = dict[trimmed];
  if (!translated) {
    recordMiss(text);
    return null;
  }
  if (translated === trimmed) return null;
  return text.replace(trimmed, translated);
};

const walkTextNodes = (node: Node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue;
    if (!text || !text.trim()) return;
    const parent = node.parentElement;
    if (parent && SKIP_TAGS.has(parent.tagName)) return;
    if (parent?.closest('[data-vw-no-translate="true"]')) return;
    const next = translate(text);
    if (next !== null && next !== text) {
      node.nodeValue = next;
    }
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.getAttribute("data-vw-no-translate") === "true") return;

    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        const next = translate(val);
        if (next !== null && next !== val) {
          el.setAttribute(attr, next);
        }
      }
    }

    node.childNodes.forEach(walkTextNodes);
  }
};

const translateAll = () => {
  if (currentLang === "en") return;
  walkTextNodes(document.body);
};

const startObserver = () => {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (currentLang === "en") return;
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach(walkTextNodes);
      } else if (m.type === "characterData") {
        walkTextNodes(m.target);
      } else if (m.type === "attributes") {
        if (m.target.nodeType === Node.ELEMENT_NODE) {
          const el = m.target as Element;
          const attr = m.attributeName;
          if (attr && TRANSLATABLE_ATTRS.includes(attr)) {
            const val = el.getAttribute(attr);
            if (val) {
              const next = translate(val);
              if (next !== null && next !== val) {
                el.setAttribute(attr, next);
              }
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS,
  });
};

export const initDomTranslator = () => {
  if (typeof window === "undefined") return;
  setCurrentLang(getCurrentLang());

  const boot = () => {
    translateAll();
    startObserver();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
};

export const setLanguage = (lang: Lang) => {
  const prev = currentLang;
  setCurrentLang(lang);
  // If we're leaving a non-English language, the DOM already contains translated
  // text that won't match our English-keyed dictionary. Reload to get fresh
  // English source before applying the new target.
  if (prev !== "en") {
    window.location.reload();
    return;
  }
  translateAll();
};

export const getLanguage = (): Lang => currentLang;
