import { describe, expect, it } from "vitest";
import { translations } from "../translations";

// The text of the "Other names" field of the vendor form. The form writes plain English and the
// DOM translator looks each string up whole, so a string that is missing from a language is shown
// in English there.
const STRINGS = [
  "Other names",
  "e.g. Facebook, Instagram",
  "Other names this vendor is known by, separated by commas. The research looks for them too.",
  "Other names must be at most 500 characters",
  "Other names can list at most 8 names",
  "Each of the other names must be between 2 and 80 characters",
  "Each of the other names must contain a letter or a digit",
];

describe("the text of the other names of a vendor", () => {
  it.each(["de", "fr", "es"] as const)("is translated into %s", (lang) => {
    const missing = STRINGS.filter((text) => !translations[lang]?.[text]);
    expect(missing).toEqual([]);
  });

  it.each(["de", "fr", "es"] as const)("keeps the numbers of the limits in %s", (lang) => {
    expect(translations[lang]["Other names must be at most 500 characters"]).toContain("500");
    expect(translations[lang]["Other names can list at most 8 names"]).toContain("8");
    expect(
      translations[lang]["Each of the other names must be between 2 and 80 characters"],
    ).toMatch(/2.*80/);
  });
});
