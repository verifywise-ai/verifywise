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
 *  - anything else. If it looks like a category label (see
 *    looksLikeCategoryLabel) it stays as its own group and is reported by name,
 *    because refusing the file would refuse valid data such as a non-binary
 *    category. If it does not, it joins the unknown category and only its count
 *    is kept. The dataset is hashed and not retained, and a mis-mapped column
 *    must not put names, emails or IDs into a stored run or a stance PDF.
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
  /** Values that looked like category labels, most frequent first. */
  named: UnmatchedValue[];
  /** Records with a value that was not one, and so is not kept. */
  otherRecords: number;
}

/** A value longer than this is not a category and gets no further processing. */
const MAX_VALUE_LENGTH = 200;
/** Longest value that can be reported by name. */
const MAX_LABEL_LENGTH = 40;
/** Fewest records a value needs to be reported by name. */
const MIN_LABEL_RECORDS = 5;
/** Largest share of digits in a value that can be reported by name. */
const MAX_LABEL_DIGIT_SHARE = 0.25;

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
    key.replace(/\(?\s*(?:not|non)[\s-]hispanic(?:\s+or\s+latin[oax]+)?\s*\)?/g, ""),
  );
  return stripped === "" ? key : stripped;
}

/**
 * Whether a value that matched nothing may be kept and shown. A category label
 * is short, contains a letter, is shared by several records, and is not an
 * email address or mostly digits. Anything else could be a person's name, an
 * email or an ID from a mis-mapped column.
 */
function looksLikeCategoryLabel(value: string, count: number): boolean {
  if (count < MIN_LABEL_RECORDS || value.length > MAX_LABEL_LENGTH) return false;
  if (value.includes("@") || !/\p{L}/u.test(value)) return false;
  const digits = [...value].filter((c) => c >= "0" && c <= "9").length;
  return digits / value.length <= MAX_LABEL_DIGIT_SHARE;
}

export interface DemographicNormalizer {
  /** Whether this mapped key is a demographic category the normalizer knows. */
  handles(categoryKey: string): boolean;
  /** The category name, blank for no answer, or the value itself if it matches nothing. */
  normalize(categoryKey: string, raw: string): string;
  /**
   * Call once every value is read: a value's record count decides whether it
   * is kept. Blanks kept-out values in `records` and returns what was found.
   */
  finish(records: Array<Record<string, unknown>>): Record<string, UnmatchedColumn>;
}

export function createDemographicNormalizer(
  categories: Record<string, DemographicCategory>,
): DemographicNormalizer {
  const lookups = new Map<string, Map<string, string>>();
  const unmatched = new Map<string, Map<string, UnmatchedValue>>();
  const tooLong = new Map<string, number>();
  for (const [categoryKey, { groups }] of Object.entries(categories)) {
    const lookup = new Map<string, string>();
    for (const group of groups) {
      lookup.set(normalizedKey(group), group);
      for (const alias of ALIASES[group] ?? []) lookup.set(normalizedKey(alias), group);
    }
    lookups.set(categoryKey, lookup);
    unmatched.set(categoryKey, new Map());
    tooLong.set(categoryKey, 0);
  }

  return {
    handles: (categoryKey) => lookups.has(categoryKey),
    normalize(categoryKey, raw) {
      const lookup = lookups.get(categoryKey);
      if (!lookup) return raw;
      const value = raw.trim();
      if (value.length > MAX_VALUE_LENGTH) {
        tooLong.set(categoryKey, tooLong.get(categoryKey)! + 1);
        return "";
      }
      const key = normalizedKey(value);
      if (key === "" || NO_ANSWER.has(key)) return "";
      const known = lookup.get(key) ?? lookup.get(withoutQualifier(key));
      if (known) return known;

      const seen = unmatched.get(categoryKey)!;
      const entry = seen.get(key);
      if (entry) {
        entry.count += 1;
        return entry.value;
      }
      seen.set(key, { value, count: 1 });
      return value;
    },
    finish(records) {
      const out: Record<string, UnmatchedColumn> = {};
      for (const [categoryKey, seen] of unmatched) {
        const named: UnmatchedValue[] = [];
        const hidden = new Set<string>();
        let otherRecords = tooLong.get(categoryKey)!;
        for (const entry of seen.values()) {
          if (looksLikeCategoryLabel(entry.value, entry.count)) named.push(entry);
          else {
            hidden.add(entry.value);
            otherRecords += entry.count;
          }
        }
        if (hidden.size > 0) {
          for (const record of records) {
            if (hidden.has(record[categoryKey] as string)) record[categoryKey] = "";
          }
        }
        named.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
        if (named.length > 0 || otherRecords > 0) out[categoryKey] = { named, otherRecords };
      }
      return out;
    },
  };
}
