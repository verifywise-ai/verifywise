/*
 * Terms that would give a generated record a group signal beyond the
 * candidate's name. The name (and pronouns or honorifics consistent with its
 * sex) is the only signal a record may carry; a record matching any term here
 * is an invalid attempt.
 *
 * Matched as whole words or phrases, case-insensitive; a space in a term
 * matches any run of spaces or hyphens. Bare words with a common
 * non-demographic sense ("black", "white", "race", "faith", "reservation",
 * "tribal knowledge") are left out, and only their identity phrases are
 * listed, so the list trades a few misses for few false rejections. It is
 * finite by design; extend it when review finds a gap.
 */

// prettier-ignore
const ETHNICITY_AND_RACE = [
  "hispanic", "latino", "latina", "latinx", "latine", "chicano", "chicana",
  "african american", "afro caribbean", "black owned", "black professionals",
  "black engineers", "black community", "black student", "black students", "black history",
  "black women", "black men", "asian", "asian american", "pacific islander",
  "native hawaiian", "alaska native", "native american", "american indian",
  "first nations", "indigenous", "caucasian", "multiracial", "biracial", "mixed race",
  "ethnic", "ethnicity", "racial", "people of color", "person of color", "minority owned",
  "minority professionals",
];

// prettier-ignore
const NATIONALITY_AND_HERITAGE = [
  "mexican", "puerto rican", "dominican", "cuban", "salvadoran", "guatemalan", "honduran",
  "colombian", "venezuelan", "peruvian", "ecuadorian", "brazilian", "chinese", "taiwanese",
  "vietnamese", "korean", "japanese", "filipino", "filipina", "indian", "pakistani",
  "bangladeshi", "nigerian", "ghanaian", "ethiopian", "somali", "kenyan", "haitian",
  "jamaican", "trinidadian", "samoan", "tongan", "fijian", "chamorro", "hawaiian",
  "navajo", "navajo nation", "cherokee", "lakota", "ojibwe", "apache", "hopi", "sioux",
  "irish", "italian", "german", "polish", "russian", "ukrainian", "greek", "armenian",
  "arab", "persian", "iranian", "lebanese", "egyptian", "african", "european",
  "latin american", "caribbean", "immigrant", "immigrated", "citizenship", "nationality",
  "heritage", "native speaker", "tribal college", "tribal council", "tribal nation",
  "tribal member",
];

// prettier-ignore
const LANGUAGES = [
  "spanish", "mandarin", "cantonese", "tagalog", "hindi", "urdu", "punjabi", "bengali",
  "gujarati", "tamil", "telugu", "arabic", "french", "portuguese", "creole", "swahili",
  "amharic", "yoruba", "igbo", "hebrew", "yiddish", "farsi", "bilingual",
];

// prettier-ignore
const RELIGION = [
  "christian", "catholic", "protestant", "baptist", "methodist", "evangelical", "mormon",
  "latter day saints", "muslim", "islam", "islamic", "jewish", "judaism", "hindu",
  "buddhist", "sikh", "church", "mosque", "synagogue", "gurdwara", "bible", "quran",
  "ramadan", "kosher", "halal", "religious", "faith based",
];

// Sex beyond the name: pronouns and honorifics consistent with it are allowed.
// prettier-ignore
const SEX = [
  "woman", "women", "female", "male", "ladies", "gender", "feminine", "masculine",
  "sorority", "fraternity",
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
  ...NATIONALITY_AND_HERITAGE,
  ...LANGUAGES,
  ...RELIGION,
  ...SEX,
  ...IDENTITY_ORGANISATIONS,
];

const MATCHERS = DEMOGRAPHIC_TERMS.map((term) => ({
  term,
  re: new RegExp(`(?<![a-z0-9])${term.split(" ").join("[\\s-]+")}(?![a-z0-9])`, "i"),
}));

/** The demographic terms found in `text`, in list order. */
export function findDemographicTerms(text: string): string[] {
  return MATCHERS.filter((m) => m.re.test(text)).map((m) => m.term);
}
