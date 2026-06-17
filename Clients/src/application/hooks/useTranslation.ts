import { useCallback, useEffect, useState } from "react";
import { translations, type Lang } from "../../i18n/translations";
import { getLanguage } from "../../i18n/domTranslator";

/**
 * Lightweight reactive translation hook.
 *
 * Reads the active language from the DOM translator and re-renders when
 * `setLanguage()` dispatches the `vw:languagechange` event.
 */
export const useTranslation = () => {
  const [lang, setLang] = useState<Lang>(getLanguage());

  useEffect(() => {
    const handleChange = (e: Event) => {
      const next = (e as CustomEvent<{ lang: Lang }>).detail?.lang;
      if (next) setLang(next);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("vw:languagechange", handleChange);
      return () => window.removeEventListener("vw:languagechange", handleChange);
    }
    return undefined;
  }, []);

  const t = useCallback(
    (key: string): string => {
      if (lang === "en") return key;
      return translations[lang]?.[key] || key;
    },
    [lang],
  );

  return { t, lang };
};

export default useTranslation;
