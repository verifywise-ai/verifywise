/*
 * Terms that would give a generated record a group signal beyond the
 * candidate's name. The name (and pronouns or honorifics consistent with its
 * sex) is the only signal a record may carry; a record matching any term or
 * phrase here is an invalid attempt.
 *
 * Terms match as whole words or phrases, case-insensitive; a space in a term
 * matches any run of spaces or hyphens. Only the words that are also common
 * job vocabulary are left out as bare words: polish, apache, cherokee, sioux,
 * church, heritage, dominican, kosher, ladies, french and italian ("polish
 * floors", "Apache Kafka", "Sioux Falls", "French fries", "kosher kitchen").
 * Those are still caught in explicit phrases ("Italian-born", "of Italian
 * descent", "native French speaker", "fluent in French", "my church"). Bare
 * words with a common non-demographic sense ("black", "white", "race",
 * "faith", "reservation") are listed only in identity phrases. Every
 * rejection is logged with its reason, so the false-rejection rate can be
 * measured. The list is finite by design; extend it when review finds a gap.
 */

// prettier-ignore
const ETHNICITY_AND_RACE = [
  "hispanic", "latino", "latina", "latinx", "latine", "chicano", "chicana",
  "african american", "afro caribbean", "black owned", "black professionals",
  "black engineers", "black community", "black student", "black students",
  "black history", "black women", "black men", "asian", "asian american",
  "pacific islander", "native hawaiian", "alaska native", "native american",
  "american indian", "first nations", "indigenous", "caucasian", "multiracial",
  "biracial", "mixed race", "ethnic", "ethnicity", "racial", "people of color",
  "person of color", "minority owned", "minority professionals",
];

// prettier-ignore
const NATIONALITY = [
  "mexican", "puerto rican", "cuban", "salvadoran", "guatemalan", "honduran",
  "colombian", "venezuelan", "peruvian", "ecuadorian", "brazilian", "chinese",
  "taiwanese", "vietnamese", "korean", "japanese", "filipino", "filipina", "indian",
  "pakistani", "bangladeshi", "nigerian", "ghanaian", "ethiopian", "somali", "kenyan",
  "haitian", "jamaican", "trinidadian", "samoan", "tongan", "fijian", "chamorro",
  "hawaiian", "navajo", "navajo nation", "cherokee nation", "lakota", "ojibwe", "hopi", "irish", "german",
  "russian", "ukrainian", "greek", "armenian", "arab", "persian", "iranian", "lebanese",
  "egyptian", "african", "european", "latin american", "caribbean", "immigrant",
  "immigrated", "citizenship", "nationality", "tribal college",
  "tribal council", "tribal nation", "tribal member",
];

// prettier-ignore
const LANGUAGES = [
  "spanish", "mandarin", "cantonese", "tagalog", "hindi", "urdu", "punjabi", "bengali",
  "gujarati", "tamil", "telugu", "arabic", "portuguese", "creole", "swahili", "amharic",
  "yoruba", "igbo", "hebrew", "yiddish", "farsi", "bilingual",
];

// prettier-ignore
const RELIGION = [
  "christian", "catholic", "protestant", "baptist", "methodist", "evangelical", "mormon", "latter day saints", "muslim",
  "islam", "islamic", "jewish", "judaism", "hindu", "buddhist", "sikh", "mosque",
  "synagogue", "gurdwara", "bible", "quran", "ramadan", "halal", "religious", "faith based",
  "my church", "our church", "church choir", "church volunteer", "church youth",
];

// Sex beyond the name: pronouns and honorifics consistent with it are allowed.
// prettier-ignore
const SEX = [
  "woman", "women", "female", "male", "gender", "feminine", "masculine", "sorority",
  "fraternity",
];

// prettier-ignore
const IDENTITY_ORGANISATIONS = [
  "naacp", "shpe", "nsbe", "lulac", "unidosus", "hbcu", "howard university", "spelman",
  "morehouse", "hampton university", "tuskegee", "fisk university", "alpha kappa alpha",
  "delta sigma theta", "kappa alpha psi", "omega psi phi", "phi beta sigma",
  "zeta phi beta", "sigma gamma rho", "iota phi theta", "alpha phi alpha",
];

export const DEMOGRAPHIC_TERMS: readonly string[] = [
  ...ETHNICITY_AND_RACE,
  ...NATIONALITY,
  ...LANGUAGES,
  ...RELIGION,
  ...SEX,
  ...IDENTITY_ORGANISATIONS,
];

// Every language a phrase can name, the job-vocabulary ones included: "French"
// is a fry, but "fluent in French" is a language.
// prettier-ignore
const LANGUAGE_NAMES = [
  ...LANGUAGES.filter((l) => l !== "bilingual"), "french", "italian", "polish",
  "cherokee", "german", "russian", "greek", "chinese", "korean", "japanese",
  "vietnamese", "hawaiian", "navajo", "samoan", "tongan", "somali", "ukrainian",
  "armenian", "persian",
].join("|");

/** "of Italian descent": of/descent any case, the inner word(s) capitalised. */
function ofDescent(text: string): boolean {
  const re = /\bof\s+(\p{Lu}[\p{L}'-]*(?:\s+\p{Lu}[\p{L}'-]*)?)\s+(descent|ancestry)\b/giu;
  for (const m of text.matchAll(re)) {
    // A lowercase "descent", or a phrase set in capitals ("OF POLISH DESCENT").
    // A title-case heading ("Rate of Emergency Descent") is not a statement of origin.
    if (m[2] === m[2].toLowerCase() || m[0] === m[0].toUpperCase()) return true;
  }
  return false;
}

/** A "Languages:" line listing any language other than English. */
function languagesLine(text: string): boolean {
  const re = /^[\s\-*#•]*languages?(?:\s+spoken)?\s*[:–—-]\s*(.+)$/gim;
  for (const m of text.matchAll(re)) {
    const listed = m[1]
      .replace(/\([^)]*\)/g, " ")
      .split(/[,;/|]|\band\b/i)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l !== "");
    if (listed.some((l) => l !== "english")) return true;
  }
  return false;
}

const matches = (pattern: RegExp) => (text: string) => pattern.test(text);

/** Explicit national-origin and language phrases, with the label reported. */
const PHRASES: Array<{ term: string; test: (text: string) => boolean }> = [
  // "Italian-born", "mexican-born", "U.S.-born"; not "first-born".
  {
    term: "-born",
    test: matches(
      /(?<![\p{L}.])(?!(?:first|new|free|later|early|still)-born)(?:\p{L}+|(?:\p{L}\.){2,})-born\b/iu,
    ),
  },
  { term: "of … descent", test: ofDescent },
  { term: "Languages: line", test: languagesLine },
  { term: "native … speaker", test: matches(/\bnative\s+(?:[a-z-]+\s+)?speakers?\b/i) },
  {
    term: "speaks a language",
    test: matches(
      new RegExp(
        `\\b(?:fluent|fluency|proficient|proficiency|conversational|speaks?|speaking|bilingual)` +
          `\\s+(?:in\\s+)?(?:english\\s+and\\s+)?(?:${LANGUAGE_NAMES})\\b`,
        "i",
      ),
    ),
  },
  {
    term: "-speaking",
    test: matches(new RegExp(`\\b(?:${LANGUAGE_NAMES})[\\s-]speak(?:ing|er|ers)\\b`, "i")),
  },
];

const MATCHERS = [
  ...DEMOGRAPHIC_TERMS.map((term) => ({
    term,
    test: matches(new RegExp(`(?<![a-z0-9])${term.split(" ").join("[\\s-]+")}(?![a-z0-9])`, "i")),
  })),
  ...PHRASES,
];

/** The demographic terms and phrases found in `text`. */
export function findDemographicTerms(text: string): string[] {
  return MATCHERS.filter((m) => m.test(text)).map((m) => m.term);
}
