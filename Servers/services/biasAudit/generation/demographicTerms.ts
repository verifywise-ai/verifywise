/*
 * Terms that would give a generated record a group signal beyond the
 * candidate's name. The name (and pronouns or honorifics consistent with its
 * sex) is the only signal a record may carry; a record matching any term or
 * phrase here is an invalid attempt.
 *
 * Terms match as whole words or phrases, case-insensitive; a space in a term
 * matches any run of spaces or hyphens. Words that are also common job
 * vocabulary are left out as bare words ("polish floors", "Apache Kafka",
 * "Sioux Falls", "French fries", "church" as an address, "kosher" kitchens,
 * "black belt", "race to close"); national origin and language are caught by
 * explicit phrases instead ("Italian-born", "of Italian descent", "native
 * French speaker", "fluent in Korean"). Some bare national-origin adjectives
 * therefore slip; every rejection is logged with its reason, so the rate can
 * be measured. The list is finite by design; extend it when review finds a gap.
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
  "puerto rican", "salvadoran", "guatemalan", "honduran", "venezuelan", "peruvian",
  "ecuadorian", "taiwanese", "vietnamese", "filipino", "filipina", "pakistani",
  "bangladeshi", "nigerian", "ghanaian", "ethiopian", "somali", "kenyan", "haitian",
  "jamaican", "trinidadian", "samoan", "tongan", "fijian", "chamorro", "navajo nation",
  "lakota", "ojibwe", "hopi", "ukrainian", "armenian", "arab", "iranian", "lebanese",
  "african", "immigrant", "immigrated", "citizenship", "nationality", "tribal college",
  "tribal council", "tribal nation", "tribal member",
];

// Language names that are not also common job vocabulary.
// prettier-ignore
const LANGUAGES = [
  "spanish", "cantonese", "tagalog", "hindi", "urdu", "punjabi", "bengali", "gujarati",
  "tamil", "telugu", "arabic", "portuguese", "swahili", "amharic", "yoruba", "igbo",
  "hebrew", "yiddish", "farsi", "bilingual",
];

// prettier-ignore
const RELIGION = [
  "christian", "protestant", "evangelical", "mormon", "latter day saints", "muslim",
  "islam", "islamic", "jewish", "judaism", "hindu", "buddhist", "sikh", "mosque",
  "synagogue", "gurdwara", "bible", "quran", "ramadan", "religious", "faith based",
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

// Every language a phrase can name, the ambiguous ones included: "French" is
// a fry, but "fluent in French" is a language.
// prettier-ignore
const LANGUAGE_NAMES = [
  ...LANGUAGES.filter((l) => l !== "bilingual"), "french", "italian", "german",
  "russian", "polish", "greek", "mandarin", "chinese", "korean", "japanese",
  "vietnamese", "creole", "hawaiian", "navajo", "cherokee", "samoan", "tongan",
  "somali", "ukrainian", "armenian", "persian",
].join("|");

/** Explicit national-origin and language phrases, with the label reported. */
const PHRASES: Array<{ term: string; re: RegExp }> = [
  // "Mexican-born", "Puerto Rico-born"; capitalised so "first-born" is not one.
  { term: "-born", re: /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?-born\b/ },
  {
    term: "of … descent",
    re: /\bof\s+(?:[a-z-]+\s+){1,3}(?:descent|ancestry|extraction|heritage)\b/i,
  },
  { term: "native … speaker", re: /\bnative\s+(?:[a-z-]+\s+)?speakers?\b/i },
  {
    term: "speaks a language",
    re: new RegExp(
      `\\b(?:fluent|fluency|proficient|proficiency|conversational|speaks?|speaking|bilingual)` +
        `\\s+(?:in\\s+)?(?:english\\s+and\\s+)?(?:${LANGUAGE_NAMES})\\b`,
      "i",
    ),
  },
  {
    term: "-speaking",
    re: new RegExp(`\\b(?:${LANGUAGE_NAMES})[\\s-]speak(?:ing|er|ers)\\b`, "i"),
  },
];

const MATCHERS = [
  ...DEMOGRAPHIC_TERMS.map((term) => ({
    term,
    re: new RegExp(`(?<![a-z0-9])${term.split(" ").join("[\\s-]+")}(?![a-z0-9])`, "i"),
  })),
  ...PHRASES,
];

/** The demographic terms and phrases found in `text`. */
export function findDemographicTerms(text: string): string[] {
  return MATCHERS.filter((m) => m.re.test(text)).map((m) => m.term);
}
