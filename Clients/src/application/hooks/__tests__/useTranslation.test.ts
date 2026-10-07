import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

let mockLang: "en" | "tr" = "en";
const dict: Record<string, string> = { Hello: "Merhaba" };

vi.mock("../../../i18n/domTranslator", () => ({
  getLanguage: () => mockLang,
  translateKey: (key: string) => (mockLang === "en" ? key : dict[key] || key),
}));

import { useTranslation } from "../useTranslation";

describe("useTranslation", () => {
  beforeEach(() => {
    mockLang = "en";
  });

  it("returns the key unchanged when the active language is English", () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.lang).toBe("en");
    expect(result.current.t("Hello")).toBe("Hello");
  });

  it("translates a known key when a non-English language is active", () => {
    mockLang = "tr";
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t("Hello")).toBe("Merhaba");
  });

  it("falls back to the key when no translation exists", () => {
    mockLang = "tr";
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t("Untranslated Key")).toBe("Untranslated Key");
  });

  it("updates the language when a vw:languagechange event is dispatched", () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.lang).toBe("en");

    act(() => {
      window.dispatchEvent(new CustomEvent("vw:languagechange", { detail: { lang: "tr" } }));
    });

    expect(result.current.lang).toBe("tr");
  });

  it("re-binds t when the active language's dictionary finishes loading", () => {
    // The translator sets the language first and loads its dictionary after,
    // then announces the load with an event for the same language.
    mockLang = "tr";
    const { result } = renderHook(() => useTranslation());
    const before = result.current.t;

    act(() => {
      window.dispatchEvent(new CustomEvent("vw:languagechange", { detail: { lang: "tr" } }));
    });

    expect(result.current.lang).toBe("tr");
    expect(result.current.t).not.toBe(before);
  });

  it("ignores events without a lang in the detail payload", () => {
    const { result } = renderHook(() => useTranslation());

    act(() => {
      window.dispatchEvent(new CustomEvent("vw:languagechange", { detail: {} }));
    });

    expect(result.current.lang).toBe("en");
  });
});
