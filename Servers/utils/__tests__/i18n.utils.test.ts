import { describe, it, expect } from "@jest/globals";
import { isSupportedLang, getTranslator, translate, translateError } from "../i18n.utils";

describe("i18n.utils", () => {
  describe("isSupportedLang", () => {
    it("recognises supported langs", () => {
      expect(isSupportedLang("en")).toBe(true);
      expect(isSupportedLang("de")).toBe(true);
      expect(isSupportedLang("fr")).toBe(true);
    });

    it("rejects unsupported langs", () => {
      expect(isSupportedLang("ja")).toBe(false);
      expect(isSupportedLang("es")).toBe(false);
    });

    it("rejects non-string input", () => {
      expect(isSupportedLang(undefined)).toBe(false);
      expect(isSupportedLang(null)).toBe(false);
      expect(isSupportedLang(42)).toBe(false);
      expect(isSupportedLang({})).toBe(false);
    });
  });

  describe("getTranslator", () => {
    it("returns the same reference for the same lang (pre-built closures)", () => {
      expect(getTranslator("de")).toBe(getTranslator("de"));
      expect(getTranslator("fr")).toBe(getTranslator("fr"));
    });

    it("returns a translator that looks up the dictionary", () => {
      const t = getTranslator("de");
      expect(t("Vendor not found")).toBe("Anbieter nicht gefunden");
    });

    it("interpolates vars when called", () => {
      const t = getTranslator("de");
      expect(t("Step {n} name is required", { n: 7 })).toBe("Schritt 7: Name ist erforderlich");
    });
  });

  describe("translate (request-less callers)", () => {
    it("translates with a known lang", () => {
      expect(translate("de", "Vendor not found")).toBe("Anbieter nicht gefunden");
      expect(translate("fr", "Vendor not found")).toBe("Fournisseur introuvable");
    });

    it("falls back to en for unsupported lang", () => {
      expect(translate("ja", "Vendor not found")).toBe("Vendor not found");
    });

    it("falls back to en for undefined lang", () => {
      expect(translate(undefined, "Vendor not found")).toBe("Vendor not found");
    });

    it("preserves {placeholder} when no matching var", () => {
      expect(translate("de", "Step {n} name is required")).toBe(
        "Schritt {n}: Name ist erforderlich",
      );
    });

    it("returns the key unchanged when key is not in dictionary", () => {
      const unknownKey = "__not_a_real_key_" + Math.random();
      expect(translate("de", unknownKey)).toBe(unknownKey);
    });
  });

  describe("translateError (catch-block helper)", () => {
    it("prefers i18nKey + i18nVars over message", () => {
      const req: any = { t: getTranslator("de") };
      const err = {
        message: "Action with ID 47 not found",
        i18nKey: "Action with ID {id} not found",
        i18nVars: { id: 47 },
      };
      expect(translateError(req, err)).toBe("Aktion mit ID 47 nicht gefunden");
    });

    it("falls back to error.message when i18nKey is absent", () => {
      const req: any = { t: getTranslator("de") };
      const err = new Error("Vendor not found");
      expect(translateError(req, err)).toBe("Anbieter nicht gefunden");
    });

    it("falls back to the English translator when req.t is missing", () => {
      const req: any = {};
      const err = new Error("Vendor not found");
      expect(translateError(req, err)).toBe("Vendor not found");
    });

    it("ignores i18nKey if it is not a string (defensive)", () => {
      const req: any = { t: getTranslator("de") };
      const err = {
        message: "Vendor not found",
        i18nKey: 42,
      };
      expect(translateError(req, err)).toBe("Anbieter nicht gefunden");
    });

    it("handles non-Error throws (string, null)", () => {
      const req: any = { t: getTranslator("de") };
      expect(translateError(req, "raw string")).toBe("raw string");
      expect(translateError(req, null)).toBe("null");
    });
  });
});
