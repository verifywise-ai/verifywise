/**
 * How a link's stored reason detail is worded in each language.
 *
 * The scan writes the detail in English at a time no request language exists,
 * so the panel translates it. These cases pin which signals are translated and
 * which carry the user's own text.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { translateDetail } from "..";
import { translations } from "../../../../i18n/translations";

const LANG_KEYS = ["de", "fr", "es"] as const;

describe.each(LANG_KEYS)("translateDetail in %s", (lang) => {
  const t = (key: string) => translations[lang][key] ?? key;

  it("translates each shared category", () => {
    expect(translateDetail("shared_category", "Operational risk, Legal risk", t)).toBe(
      `${t("Operational risk")}, ${t("Legal risk")}`,
    );
    expect(t("Operational risk")).not.toBe("Operational risk");
  });

  it("translates the lifecycle phase", () => {
    expect(translateDetail("same_lifecycle_phase", "Problem definition & planning", t)).toBe(
      t("Problem definition & planning"),
    );
  });

  it("keeps the count and translates the label, singular and plural", () => {
    expect(
      translateDetail(
        "shared_framework_element",
        "3 EU AI Act controls, 1 EU AI Act control, 2 NIST AI RMF subcategories",
        t,
      ),
    ).toBe(
      `3 ${t("EU AI Act controls")}, 1 ${t("EU AI Act control")}, 2 ${t("NIST AI RMF subcategories")}`,
    );
    expect(t("EU AI Act controls")).not.toBe(t("EU AI Act control"));
  });

  it("leaves a part it does not recognise as it is", () => {
    expect(translateDetail("shared_framework_element", "a new kind of element", t)).toBe(
      "a new kind of element",
    );
  });

  it.each(["shared_control", "shared_assessment", "shared_project", "something_new"])(
    "leaves the %s detail alone: it is the user's own text",
    (signal) => {
      expect(translateDetail(signal, "AC-17 remote access", t)).toBe("AC-17 remote access");
    },
  );
});

describe("framework labels the server can write", () => {
  const source = resolve(
    __dirname,
    "../../../../../../Servers/services/riskLinks/providers/structuralGraph.ts",
  );

  // The labels are written by the scan, so a prefix added there is English in
  // every language until it is added to the dictionary. Skipped only when the
  // Servers package is not checked out next to this one.
  it.skipIf(!existsSync(source))("are all in the dictionary", () => {
    const labels = [...readFileSync(source, "utf8").matchAll(/\["([^"]+)", "([^"]+)"\]/g)].flatMap(
      (match) => [match[1], match[2]],
    );
    expect(labels.length).toBeGreaterThanOrEqual(18);
    for (const lang of LANG_KEYS) {
      const missing = labels.filter((label) => !translations[lang][label]);
      expect(missing, `${lang} is missing`).toEqual([]);
    }
  });
});
