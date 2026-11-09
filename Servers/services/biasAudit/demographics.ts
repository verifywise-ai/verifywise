/**
 * Reads the demographic values of an uploaded file onto the module's category
 * lists, so that "M", "Male" and "male" are one group and "Prefer not to say"
 * is not a group at all.
 *
 * Case and surrounding whitespace are ignored. A value means one of three
 * things:
 *
 *  - a category on the list, written as the list writes it, or a usual form of
 *    it (the alias table);
 *  - no answer: it becomes blank, so the data gates and the engine count it as
 *    the unknown category of § 5-301(b)(5) and (c)(5);
 *  - anything else, which stays as its own group and is reported. Refusing the
 *    file would refuse valid data such as a non-binary category.
 */
export interface DemographicCategory {
  groups: string[];
}

export interface UnmatchedValue {
  /** The value as first written in the file. */
  value: string;
  count: number;
}

const NO_ANSWER = new Set([
  "prefer not to say",
  "prefer not to answer",
  "prefer not to disclose",
  "prefer not to state",
  "prefer not to respond",
  "decline",
  "declined",
  "decline to state",
  "declined to state",
  "decline to answer",
  "declined to answer",
  "decline to identify",
  "declined to identify",
  "decline to self-identify",
  "declined to self-identify",
  "decline to disclose",
  "unknown",
  "not known",
  "n/a",
  "na",
  "not applicable",
  "none",
  "null",
  "nil",
  "nan",
  "not specified",
  "unspecified",
  "not stated",
  "not provided",
  "not reported",
  "not disclosed",
  "undisclosed",
  "not available",
  "no answer",
  "no response",
  "no data",
  "did not answer",
  "did not disclose",
  "did not specify",
  "did not respond",
  "missing",
  "-",
  "--",
  "?",
]);

/** Usual forms of each category name. The official name is matched without being listed. */
const ALIASES: Record<string, readonly string[]> = {
  Male: ["m", "man", "men", "cis male", "cisgender male", "cis man", "cisgender man"],
  Female: ["f", "woman", "women", "cis female", "cisgender female", "cis woman", "cisgender woman"],
  "Hispanic or Latino": [
    "hispanic",
    "latino",
    "latina",
    "latinx",
    "latine",
    "hispanic/latino",
    "hispanic/latina",
    "hispanic/latinx",
    "hispanic or latina",
    "hispanic or latinx",
    "hispanic latino",
    "latino/hispanic",
  ],
  White: ["caucasian", "white/caucasian", "white or caucasian", "european american"],
  "Black or African American": [
    "black",
    "african american",
    "african-american",
    "black/african american",
    "black/african-american",
    "black african american",
    "black or african-american",
  ],
  "Native Hawaiian or Pacific Islander": [
    "native hawaiian",
    "hawaiian",
    "pacific islander",
    "native hawaiian/pacific islander",
    "native hawaiian or other pacific islander",
    "native hawaiian/other pacific islander",
    "hawaiian or pacific islander",
    "hawaiian/pacific islander",
  ],
  Asian: ["asian american", "asian-american"],
  "Native American or Alaska Native": [
    "native american",
    "alaska native",
    "alaskan native",
    "american indian",
    "american indian or alaska native",
    "american indian or alaskan native",
    "american indian/alaska native",
    "american indian/alaskan native",
    "native american/alaska native",
    "native american/alaskan native",
    "native american or alaskan native",
    "indigenous american",
  ],
  "Two or more races": [
    "two or more",
    "2 or more",
    "2 or more races",
    "2+ races",
    "two+ races",
    "multiracial",
    "multi-racial",
    "multi racial",
    "biracial",
    "bi-racial",
    "mixed",
    "mixed race",
    "mixed-race",
    "more than one race",
  ],
};

function normalizedKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The rule's tables write categories as "White (Not Hispanic or Latino)", and
 * data exports often as "White, Non-Hispanic". The qualifier does not change
 * the category, so it is dropped before a second look-up. A value that is only
 * the qualifier is left alone.
 */
function withoutQualifier(key: string): string {
  const stripped = key
    .replace(/\(?\s*(?:not|non)[\s-]hispanic(?:\s+or\s+latin[oax]+)?\s*\)?/g, "")
    .replace(/[\s,;-]+$/g, "")
    .replace(/^[\s,;-]+/g, "")
    .trim();
  return stripped === "" ? key : stripped;
}

export interface DemographicNormalizer {
  /** Whether this mapped key is a demographic category the normalizer knows. */
  handles(categoryKey: string): boolean;
  /** The category name, blank for no answer, or the value itself if it matches nothing. */
  normalize(categoryKey: string, raw: string): string;
  /** Values that matched nothing, per category, most frequent first. */
  unmatched(): Record<string, UnmatchedValue[]>;
}

export function createDemographicNormalizer(
  categories: Record<string, DemographicCategory>,
): DemographicNormalizer {
  const lookups = new Map<string, Map<string, string>>();
  const unmatched = new Map<string, Map<string, UnmatchedValue>>();
  for (const [categoryKey, { groups }] of Object.entries(categories)) {
    const lookup = new Map<string, string>();
    for (const group of groups) {
      lookup.set(normalizedKey(group), group);
      for (const alias of ALIASES[group] ?? []) lookup.set(normalizedKey(alias), group);
    }
    lookups.set(categoryKey, lookup);
    unmatched.set(categoryKey, new Map());
  }

  return {
    handles: (categoryKey) => lookups.has(categoryKey),
    normalize(categoryKey, raw) {
      const lookup = lookups.get(categoryKey);
      if (!lookup) return raw;
      const key = normalizedKey(raw);
      if (key === "" || NO_ANSWER.has(key)) return "";
      const known = lookup.get(key) ?? lookup.get(withoutQualifier(key));
      if (known) return known;

      const seen = unmatched.get(categoryKey)!;
      const entry = seen.get(key);
      if (entry) {
        entry.count += 1;
        return entry.value;
      }
      const value = raw.trim();
      seen.set(key, { value, count: 1 });
      return value;
    },
    unmatched() {
      const out: Record<string, UnmatchedValue[]> = {};
      for (const [categoryKey, seen] of unmatched) {
        const values = [...seen.values()].sort(
          (a, b) => b.count - a.count || a.value.localeCompare(b.value),
        );
        if (values.length > 0) out[categoryKey] = values;
      }
      return out;
    },
  };
}
