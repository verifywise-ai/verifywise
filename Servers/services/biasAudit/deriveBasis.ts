/**
 * The 5-302(b) basis, per protected category, derived rather than asked twice.
 *
 * `data.basis` states the reason for the run as a whole; the veto `data.held`
 * already records what the customer holds per characteristic. The split falls
 * out of the two, and a second per-category grid would add friction for
 * information already given.
 *
 * Why the split matters. One engagement held sex for roughly 1,500 to 2,000
 * candidates and no race or ethnicity at all. Sex could be reported from
 * historical data while race, ethnicity and the intersectional categories
 * could not, and the expiry conditions differ: a race attribute basis ends when
 * customers begin capturing race, and records of another characteristic never
 * end it however far their volume grows. A customer who later collects 50,000
 * sex disclosures must not see a race basis reported as resolved.
 *
 * This is OUR INFERENCE, not the customer's statement. Writing an inference
 * back as a client's words is a named failure that put a false sentence in a
 * signed report, so `confirmed` starts false, the summary says "we read your
 * answers as follows", and an unconfirmed split appears in the open items.
 *
 * Each trigger speaks only about its own category: a sex trigger never names
 * race or ethnicity, and a race trigger never names sex.
 */
import { hasValue } from "./applicability";
import type { AnswerMap } from "./applicability";

export type BasisKind =
  "historical" | "test_volume" | "test_attribute" | "test_availability" | "not_applicable";

export type BasisCategory = "sex" | "race_ethnicity" | "intersectional";

export interface CategoryBasis {
  category: BasisCategory;
  basis: BasisKind;
  expiryTrigger: string;
}

export interface DerivedBasis {
  perCategory: CategoryBasis[];
  /** Always false when derived: the customer confirms or corrects the reading. */
  confirmed: boolean;
  summary: string;
}

const NO_TRIGGER = "";

const TRIGGERS: Record<BasisCategory, Record<BasisKind, string>> = {
  sex: {
    historical: NO_TRIGGER,
    not_applicable: NO_TRIGGER,
    test_volume:
      "This basis ends when your historical records of sex reach a volume that supports " +
      "the intersectional categories 5-301(c) requires.",
    test_attribute: "This basis ends when sex begins to be captured at reportable volumes.",
    test_availability: "This basis ends if the historical records of sex become available to you.",
  },
  race_ethnicity: {
    historical: NO_TRIGGER,
    not_applicable: NO_TRIGGER,
    test_volume:
      "This basis ends when your historical records of race and ethnicity reach a volume that " +
      "supports the intersectional categories 5-301(c) requires.",
    test_attribute:
      "This basis ends when race and ethnicity begin to be captured at reportable volumes. " +
      "Growth in the volume of any other record does not end it.",
    test_availability:
      "This basis ends if the historical records of race and ethnicity become available to you.",
  },
  intersectional: {
    historical: NO_TRIGGER,
    not_applicable: NO_TRIGGER,
    test_volume:
      "This basis ends when your historical records reach a volume that supports the " +
      "intersectional categories 5-301(c) requires.",
    test_attribute:
      "This basis ends only when both sex and race and ethnicity are captured at reportable " +
      "volumes. Either one alone does not end it.",
    test_availability: "This basis ends if the historical records become available to you.",
  },
};

const BASIS_WORDS: Record<BasisKind, string> = {
  historical: "historical applicant data",
  test_volume: "test data, because historical volume is too low",
  test_attribute: "test data, because the characteristic is not held",
  test_availability: "test data, because the historical records are held by others",
  not_applicable: "not applicable",
};

const CATEGORY_WORDS: Record<BasisCategory, string> = {
  sex: "sex",
  race_ethnicity: "race and ethnicity",
  intersectional: "the intersectional categories",
};

const BASIS_KINDS: readonly BasisKind[] = [
  "historical",
  "test_volume",
  "test_attribute",
  "test_availability",
  "not_applicable",
];

/**
 * A characteristic that is not held cannot rest on historical data, so a stated
 * "historical" becomes test_attribute for it; any other stated basis stands.
 */
function notHeld(stated: BasisKind): BasisKind {
  return stated === "historical" ? "test_attribute" : stated;
}

/** Per-characteristic basis from what is held, falling back to the stated basis. */
function perCharacteristic(
  held: string,
  stated: BasisKind,
): { sex: BasisKind; race: BasisKind } | null {
  switch (held) {
    case "none":
      return { sex: notHeld(stated), race: notHeld(stated) };
    case "sex_only":
      return { sex: "historical", race: notHeld(stated) };
    case "all_low_volume":
      return { sex: "test_volume", race: "test_volume" };
    case "all_sufficient":
      return { sex: "historical", race: "historical" };
    case "customers_hold_it":
      return { sex: "test_availability", race: "test_availability" };
    default:
      return null;
  }
}

/** The intersection is historical only when both halves are. */
function weaker(a: BasisKind, b: BasisKind): BasisKind {
  if (a === "historical") return b;
  return a;
}

export function deriveBasis(answers: AnswerMap): DerivedBasis | null {
  if (!hasValue(answers, "data.held") || !hasValue(answers, "data.basis")) return null;
  const stated = answers["data.basis"].value as BasisKind;
  if (!BASIS_KINDS.includes(stated)) return null;
  const split = perCharacteristic(answers["data.held"].value as string, stated);
  if (!split) return null;

  const bases: Record<BasisCategory, BasisKind> = {
    sex: split.sex,
    race_ethnicity: split.race,
    intersectional: weaker(split.sex, split.race),
  };
  const categories: BasisCategory[] = ["sex", "race_ethnicity", "intersectional"];
  const perCategory = categories.map((category) => ({
    category,
    basis: bases[category],
    expiryTrigger: TRIGGERS[category][bases[category]],
  }));

  const lines = perCategory
    .map((c) => `${CATEGORY_WORDS[c.category]}: ${BASIS_WORDS[c.basis]}`)
    .join("; ");
  const summary =
    `We read your answers as follows: ${lines}. ` +
    "This is our reading of your answers, not your statement. Please confirm it or correct it.";

  return { perCategory, confirmed: false, summary };
}
