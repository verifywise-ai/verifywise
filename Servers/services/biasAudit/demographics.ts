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
 *  - a recognized label outside the list (OTHER_LABELS), such as non-binary.
 *    It stays as its own group and is reported by name, because refusing it
 *    would refuse valid data. The 2% exclusion applies to it like any group;
 *  - anything else joins the unknown category and only a count of it is kept.
 *    The dataset is hashed and not retained, and a mis-mapped column must not
 *    put names, emails or IDs into a stored run or a stance PDF. No heuristic
 *    can tell a name on five rows from a label, so this is an allowlist.
 */
export interface DemographicCategory {
  groups: string[];
}

export interface UnmatchedValue {
  /** The value as first written in the file. */
  value: string;
  count: number;
}

export interface UnmatchedColumn {
  /** Recognized labels outside the category list, most frequent first. */
  named: UnmatchedValue[];
  /** Records with any other value: counted as unknown, and the value is not kept. */
  otherRecords: number;
}

/** A value longer than this is not a category and gets no further processing. */
const MAX_VALUE_LENGTH = 200;
const NO_ANSWER = new Set([
  "prefer not to say",
  "prefer not to answer",
  "prefer not to disclose",
  "prefer not to state",
  "prefer not to respond",
  "prefer not to identify",
  "prefer not to specify",
  "prefer not to self-identify",
  "prefer not to self identify",
  "i prefer not to say",
  "i prefer not to answer",
  "i prefer not to disclose",
  "i prefer not to identify",
  "i don't wish to answer",
  "i do not wish to answer",
  "i don't wish to say",
  "i do not wish to say",
  "i don't wish to disclose",
  "i do not wish to disclose",
  "i don't wish to identify",
  "i do not wish to identify",
  "don't wish to answer",
  "do not wish to answer",
  "don't wish to disclose",
  "do not wish to disclose",
  "wish not to answer",
  "wish not to disclose",
  "choose not to say",
  "choose not to answer",
  "choose not to disclose",
  "chose not to say",
  "chose not to answer",
  "chose not to disclose",
  "rather not say",
  "would rather not say",
  "i'd rather not say",
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
  "decline to self identify",
  "declined to self identify",
  "i decline to state",
  "i decline to answer",
  "i decline to self-identify",
  "i decline to self identify",
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
  "not answered",
  "unanswered",
  "withheld",
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
    "latino or hispanic",
    "hispanic/latine",
    "hispanic or latine",
    "latine/hispanic",
    "latinx/hispanic",
    "latino/a",
    "latina/o",
    "hispanic/latino/a",
    "hispanic or latino/a",
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

/** Recognized labels outside LL144's category lists, by category key: name, then other forms. */
const OTHER_LABELS: Record<string, Record<string, readonly string[]>> = {
  sex: {
    "Non-binary": ["nonbinary", "non binary", "enby"],
    Genderqueer: ["gender queer", "gender-queer"],
    "Gender fluid": ["genderfluid", "gender-fluid"],
    Agender: [],
    Transgender: ["trans"],
    "Transgender man": ["trans man", "trans male", "transgender male"],
    "Transgender woman": ["trans woman", "trans female", "transgender female"],
    Intersex: [],
    "Two-spirit": ["two spirit"],
    "Gender non-conforming": ["gender nonconforming", "gender non conforming"],
    "Another gender": ["other gender", "different gender", "a different gender"],
    Other: [],
  },
  race_ethnicity: {
    "Middle Eastern or North African": [
      "middle eastern",
      "north african",
      "mena",
      "middle eastern/north african",
    ],
    "Some other race": ["other race", "another race", "a different race"],
    Other: [],
  },
};

function normalizedKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ");
}

const SEPARATORS = new Set([" ", ",", ";", "-"]);

/** A loop, not an anchored regex: a long run of separators stays linear. */
function trimSeparators(text: string): string {
  let end = text.length;
  while (end > 0 && SEPARATORS.has(text[end - 1])) end--;
  let start = 0;
  while (start < end && SEPARATORS.has(text[start])) start++;
  return text.slice(start, end);
}

/**
 * The rule's tables write categories as "White (Not Hispanic or Latino)", and
 * data exports often as "White, Non-Hispanic". The qualifier does not change
 * the category, so it is dropped before a second look-up. A value that is only
 * the qualifier is left alone. Callers pass a normalized key no longer than
 * MAX_VALUE_LENGTH, so the regex runs on short text with single spaces.
 */
function withoutQualifier(key: string): string {
  const stripped = trimSeparators(
    key.replace(
      /\(?\s*(?:not|non)[\s-](?:hispanic|latin[oaxe]+)(?:\s*(?:or|\/)\s*latin[oaxe]+)?\s*\)?/g,
      "",
    ),
  );
  return stripped === "" ? key : stripped;
}

export interface DemographicNormalizer {
  /** Whether this mapped key is a demographic category the normalizer knows. */
  handles(categoryKey: string): boolean;
  /** The group name to record, or blank for no answer or an unrecognized value. */
  normalize(categoryKey: string, raw: string): string;
  /** Values that were not on the category list, per category. */
  unmatched(): Record<string, UnmatchedColumn>;
}

function addForms(lookup: Map<string, string>, name: string, forms: readonly string[]): void {
  lookup.set(normalizedKey(name), name);
  for (const form of forms) lookup.set(normalizedKey(form), name);
}

export function createDemographicNormalizer(
  categories: Record<string, DemographicCategory>,
): DemographicNormalizer {
  const lookups = new Map<string, Map<string, string>>();
  const otherLookups = new Map<string, Map<string, string>>();
  const named = new Map<string, Map<string, number>>();
  const otherRecords = new Map<string, number>();
  for (const [categoryKey, { groups }] of Object.entries(categories)) {
    const lookup = new Map<string, string>();
    for (const group of groups) addForms(lookup, group, ALIASES[group] ?? []);
    lookups.set(categoryKey, lookup);

    const otherLookup = new Map<string, string>();
    for (const [name, forms] of Object.entries(OTHER_LABELS[categoryKey] ?? {})) {
      addForms(otherLookup, name, forms);
    }
    otherLookups.set(categoryKey, otherLookup);
    named.set(categoryKey, new Map());
    otherRecords.set(categoryKey, 0);
  }

  const notKept = (categoryKey: string): string => {
    otherRecords.set(categoryKey, otherRecords.get(categoryKey)! + 1);
    return "";
  };

  return {
    handles: (categoryKey) => lookups.has(categoryKey),
    normalize(categoryKey, raw) {
      const lookup = lookups.get(categoryKey);
      if (!lookup) return raw;
      const value = raw.trim();
      if (value.length > MAX_VALUE_LENGTH) return notKept(categoryKey);
      const key = normalizedKey(value);
      if (key === "" || NO_ANSWER.has(key)) return "";
      const bare = withoutQualifier(key);
      const known = lookup.get(key) ?? lookup.get(bare);
      if (known) return known;

      const otherLookup = otherLookups.get(categoryKey)!;
      const label = otherLookup.get(key) ?? otherLookup.get(bare);
      if (!label) return notKept(categoryKey);
      const counts = named.get(categoryKey)!;
      counts.set(label, (counts.get(label) ?? 0) + 1);
      return label;
    },
    unmatched() {
      const out: Record<string, UnmatchedColumn> = {};
      for (const [categoryKey, counts] of named) {
        const values = [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
        const other = otherRecords.get(categoryKey)!;
        if (values.length > 0 || other > 0) {
          out[categoryKey] = { named: values, otherRecords: other };
        }
      }
      return out;
    },
  };
}
