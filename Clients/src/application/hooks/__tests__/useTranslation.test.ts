import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../../i18n/translations", () => ({
  translations: {
    tr: { Hello: "Merhaba" },
  },
}));

let mockLang: "en" | "tr" = "en";
vi.mock("../../../i18n/domTranslator", () => ({
  getLanguage: () => mockLang,
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
      window.dispatchEvent(
        new CustomEvent("vw:languagechange", { detail: { lang: "tr" } }),
      );
    });

    expect(result.current.lang).toBe("tr");
  });

  it("ignores events without a lang in the detail payload", () => {
    const { result } = renderHook(() => useTranslation());

    act(() => {
      window.dispatchEvent(new CustomEvent("vw:languagechange", { detail: {} }));
    });

    expect(result.current.lang).toBe("en");
  });
});
