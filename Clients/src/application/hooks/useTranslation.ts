import { useCallback, useEffect, useState } from "react";
import type { Lang } from "../../i18n/translations";
import { getLanguage, translateKey } from "../../i18n/domTranslator";

/**
 * Lightweight reactive translation hook.
 *
 * Reads the active language from the DOM translator and re-renders when
 * `setLanguage()` dispatches the `vw:languagechange` event.
 */
export const useTranslation = () => {
  const [lang, setLang] = useState<Lang>(getLanguage());
  // The translator sets the language before its dictionary has loaded, then
  // announces the load with an event for that same language. A component
  // mounted in between already has that lang, so setLang alone would not
  // re-render it and anything built from t() would stay in English.
  const [dictionaryVersion, setDictionaryVersion] = useState(0);

  useEffect(() => {
    const handleChange = (e: Event) => {
      const next = (e as CustomEvent<{ lang: Lang }>).detail?.lang;
      if (next) {
        setLang(next);
        setDictionaryVersion((version) => version + 1);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("vw:languagechange", handleChange);
      return () => window.removeEventListener("vw:languagechange", handleChange);
    }
    return undefined;
  }, []);

  const t = useCallback(
    (key: string): string => translateKey(key),
    // lang and dictionaryVersion re-bind the callback so consumers re-render
    // on a language change and when its dictionary arrives; the lookup itself
    // reads the DOM translator's loaded dictionary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, dictionaryVersion],
  );

  return { t, lang };
};

export default useTranslation;
