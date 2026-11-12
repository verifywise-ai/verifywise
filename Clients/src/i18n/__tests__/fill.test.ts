import { fill, pluralKey } from "../fill";
import * as evals from "../modules/evals";

describe("pluralKey", () => {
  it("follows English rules: only 1 is singular", () => {
    expect(pluralKey("en", 1, "one", "other")).toBe("one");
    expect(pluralKey("en", 0, "one", "other")).toBe("other");
    expect(pluralKey("en", 2, "one", "other")).toBe("other");
  });

  it("follows French rules: 0 and 1 are singular", () => {
    expect(pluralKey("fr", 0, "one", "other")).toBe("one");
    expect(pluralKey("fr", 1, "one", "other")).toBe("one");
    expect(pluralKey("fr", 2, "one", "other")).toBe("other");
  });

  it("falls back to English rules for an invalid locale", () => {
    expect(pluralKey("not a locale!", 1, "one", "other")).toBe("one");
    expect(pluralKey("not a locale!", 0, "one", "other")).toBe("other");
  });
});

describe("evals count templates", () => {
  const templates = Object.keys(evals.de).filter((key) => key.includes("{count}"));

  it("has count templates to check", () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(["de", "fr", "es"] as const)("keeps {count} in every %s translation", (lang) => {
    for (const key of templates) {
      const translated = evals[lang][key];
      expect(translated, `${lang}: ${key}`).toBeDefined();
      expect(fill(translated, { count: 7 }), `${lang}: ${key}`).toContain("7");
    }
  });
});
