import { LL144_RACE, LL144_SEX, type Demographics } from "./allocation";

/*
 * Names for generated candidates. A record carries its sex and race/ethnicity
 * cell only through the candidate's name (name-based correspondence testing);
 * nothing else demographic enters the prompt.
 *
 * Sources and thresholds:
 *
 *  - First names: Tzioumis, K. (2018), "Demographic aspects of first names",
 *    Scientific Data 5:180025 (Harvard Dataverse doi:10.7910/DVN/TYJKEZ).
 *    A name is listed for a race/ethnicity when at least 75% of its
 *    occurrences fall in that category and it has at least 50 occurrences.
 *    The source carries no sex, so sex comes from the US Census Bureau 1990
 *    first-name files (dist.male.first, dist.female.first): a name is listed
 *    for a sex when it appears in that file and at least 95% of its combined
 *    frequency is in it. Each list keeps the 24 most frequent qualifying names.
 *
 *  - Surnames: US Census Bureau 2010 surname file (Names_2010Census.csv). A
 *    surname is listed for a race/ethnicity when at least 75% of its bearers
 *    fall in that category and it has at least 1,000 occurrences. Each list
 *    keeps the 24 most frequent qualifying surnames.
 *
 * Where the data is thin, the lists are shorter than 24 and are NOT padded
 * with weaker names (open item in the ledger, for review):
 *
 *  - Black or African American first names: 3 male and 5 female qualify. The
 *    mortgage records behind the source under-represent younger Black names,
 *    and the 1990 sex files list only 1,219 male names.
 *  - Asian male first names: 4 qualify.
 *  - Asian female first names: the 1990 male file is truncated, so absence
 *    there is weak evidence of sex. Given names used for both sexes (Wei, Li,
 *    Jin, Yan, Ming, Yu, Min, Yi, Kyung, Jung, Hui, Wai, Tam, Xiao, Anh, Dung,
 *    Linh, Hoa, Phuong and similar) are REMOVED by hand, leaving 19.
 *  - Native American or Alaska Native: no first name reaches even 7% in the
 *    source, and 7 surnames qualify. First names come from a separate list of
 *    common names with low race concentration (Tzioumis: at least 300
 *    occurrences, no category above 65%; names with a religious signal left
 *    out), so the surname carries the race/ethnicity signal in that cell.
 *  - Native Hawaiian or Pacific Islander: both sources merge the group with
 *    Asian. The names below are HAND-SELECTED as specific to Hawaiian, Samoan
 *    and Tongan naming; each surname is present in the 2010 file with at
 *    least 100 occurrences.
 *  - Two or more races: first names and surnames are drawn from every list
 *    combined, so the name carries a sex signal only.
 */

export const NAME_METHOD =
  "Each generated record signals its sex and race/ethnicity only through the candidate's name: a first name typical of the cell (Tzioumis 2018, with sex from the US Census 1990 first-name files) and a surname typical of the race/ethnicity (US Census 2010), drawn deterministically per candidate. " +
  "Native Hawaiian or Pacific Islander names are hand-selected because both sources merge that group with Asian. Native American or Alaska Native first names are common names with no strong race/ethnicity association, so the surname carries the race/ethnicity signal in that cell; Two or more races names are drawn from all groups combined and carry a sex signal only. " +
  "The generator is instructed to state no other group detail and to name no one else; records that do so in unambiguous terms are rejected and generated again.";

type FirstNames = { Male: readonly string[]; Female: readonly string[] };

// prettier-ignore
const HISPANIC_FIRST: FirstNames = {
  Male: [
    "Jose", "Juan", "Carlos", "Luis", "Manuel", "Jorge", "Francisco", "Jesus",
    "Miguel", "Roberto", "Ricardo", "Pedro", "Oscar", "Rafael", "Hector", "Raul",
    "Javier", "Ramon", "Fernando", "Ruben", "Sergio", "Eduardo", "Alejandro", "Armando",
  ],
  Female: [
    "Leticia", "Luz", "Blanca", "Juana", "Beatriz", "Maribel", "Graciela", "Mayra",
    "Esperanza", "Francisca", "Araceli", "Marisol", "Alejandra", "Consuelo", "Socorro", "Maricela",
    "Maritza", "Estela", "Rocio", "Elvia", "Esmeralda", "Concepcion", "Yesenia", "Guillermina",
  ],
};

// prettier-ignore
const WHITE_FIRST: FirstNames = {
  Male: [
    "Michael", "John", "David", "Robert", "James", "William", "Richard", "Thomas",
    "Mark", "Joseph", "Daniel", "Christopher", "Steven", "Jeffrey", "Brian", "Paul",
    "Charles", "Matthew", "Scott", "Kevin", "Timothy", "Stephen", "Kenneth", "Gary",
  ],
  Female: [
    "Mary", "Susan", "Jennifer", "Patricia", "Linda", "Karen", "Lisa", "Barbara",
    "Elizabeth", "Nancy", "Kathleen", "Deborah", "Michelle", "Sandra", "Amy", "Kimberly",
    "Laura", "Cynthia", "Carol", "Donna", "Julie", "Christine", "Sharon", "Pamela",
  ],
};

// Short lists: only these reach the thresholds (see the header).
// prettier-ignore
const BLACK_FIRST: FirstNames = {
  Male: ["Jermaine", "Roosevelt", "Alphonso"],
  Female: ["Latoya", "Tamika", "Latasha", "Latonya", "Ebony"],
};

// prettier-ignore
const ASIAN_FIRST: FirstNames = {
  Male: ["Hung", "Tuan", "Hai", "Long"],
  // Sex-ambiguous names removed by hand (see the header).
  Female: [
    "Thuy", "Ying", "Mei", "Mai", "Lan", "Erlinda", "Huong", "Trang",
    "Thao", "Thu", "Ling", "Yen", "Nga", "Hang", "Hanh", "Loan",
    "Lien", "Hue", "Nenita",
  ],
};

// Low race concentration (see the header); the surname carries the signal.
// prettier-ignore
const NAAN_FIRST: FirstNames = {
  Male: [
    "Victor", "Antonio", "Mario", "Tony", "Alex", "Johnny", "Gabriel", "Edgar",
    "Gilbert", "Calvin", "Ivan", "Nelson", "Marco", "Andre", "Derrick", "Alvin",
    "Andy", "Maurice", "Milton", "Felix", "Reginald", "Julian", "Omar", "Isaac",
  ],
  Female: [
    "Maria", "Gloria", "Claudia", "Veronica", "Norma", "Sylvia", "Grace", "Vanessa",
    "Yolanda", "Esther", "Sonia", "Olga", "Vivian", "Cecilia", "Miriam", "Annie",
    "Juanita", "Gwendolyn", "Alma", "Cristina", "Emma", "Ramona", "Ruby", "Adriana",
  ],
};

// HAND-SELECTED (Hawaiian, Samoan, Tongan); not from the threshold rule.
// prettier-ignore
const NHPI_FIRST: FirstNames = {
  Male: [
    "Sione", "Tevita", "Viliami", "Semisi", "Siosaia", "Sitani", "Tomasi", "Iosefa",
    "Tavita", "Malakai", "Keoni", "Kekoa", "Kainoa", "Makoa", "Ikaika", "Kawika",
    "Kanoa", "Pita", "Koa", "Mosese",
  ],
  Female: [
    "Leilani", "Noelani", "Malia", "Healani", "Mahina", "Lokelani", "Pualani", "Haunani",
    "Iolana", "Kehaulani", "Kanani", "Mele", "Seini", "Losana", "Salote", "Lesieli",
    "Sela", "Moana", "Lupe", "Sina",
  ],
};

// prettier-ignore
const HISPANIC_SURNAMES = [
  "Garcia", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Perez", "Sanchez",
  "Ramirez", "Torres", "Flores", "Rivera", "Gomez", "Diaz", "Cruz", "Reyes",
  "Morales", "Gutierrez", "Ortiz", "Ramos", "Chavez", "Mendoza", "Ruiz", "Alvarez",
];

// prettier-ignore
const WHITE_SURNAMES = [
  "Miller", "Anderson", "Nelson", "Baker", "Roberts", "Phillips", "Murphy", "Cook",
  "Rogers", "Morgan", "Peterson", "Kelly", "Cox", "Ward", "Wood", "Bennett",
  "Hughes", "Myers", "Long", "Russell", "Sullivan", "Fisher", "Reynolds", "West",
];

// prettier-ignore
const BLACK_SURNAMES = [
  "Washington", "Pierre", "Alston", "Battle", "Muhammad", "Ruffin", "Hairston", "Chatman",
  "Francois", "Smalls", "Artis", "Antoine", "Bowens", "Faison", "Stallworth", "Armstead",
  "Jeanbaptiste", "Etienne", "McKoy", "Drayton", "Diallo", "Abdi", "Alexis", "Batiste",
];

// prettier-ignore
const ASIAN_SURNAMES = [
  "Nguyen", "Kim", "Patel", "Tran", "Chen", "Singh", "Li", "Wong",
  "Le", "Wang", "Yang", "Pham", "Chang", "Lin", "Liu", "Chan",
  "Khan", "Huang", "Wu", "Zhang", "Shah", "Lam", "Huynh", "Yu",
];

// Short list: only these reach the thresholds (see the header).
// prettier-ignore
const NAAN_SURNAMES = ["Begay", "Yazzie", "Benally", "Tsosie", "Nez", "Harjo", "Begaye"];

// HAND-SELECTED (Tongan, Samoan, Hawaiian); each in the 2010 file with >= 100 occurrences.
// prettier-ignore
const NHPI_SURNAMES = [
  "Fifita", "Tupou", "Taufa", "Latu", "Fonua", "Havili", "Tavake", "Faamausili",
  "Leota", "Mataafa", "Aumua", "Fonoti", "Tuitele", "Tuiasosopo", "Kaawa", "Kanahele",
  "Kahananui", "Mahoe", "Kealoha", "Kamaka", "Nakoa", "Kauhane",
];

// prettier-ignore
const ALL_FIRST: FirstNames = {
  Male: [
    ...HISPANIC_FIRST.Male, ...WHITE_FIRST.Male, ...BLACK_FIRST.Male,
    ...ASIAN_FIRST.Male, ...NHPI_FIRST.Male, ...NAAN_FIRST.Male,
  ],
  Female: [
    ...HISPANIC_FIRST.Female, ...WHITE_FIRST.Female, ...BLACK_FIRST.Female,
    ...ASIAN_FIRST.Female, ...NHPI_FIRST.Female, ...NAAN_FIRST.Female,
  ],
};

// prettier-ignore
const ALL_SURNAMES = [
  ...HISPANIC_SURNAMES, ...WHITE_SURNAMES, ...BLACK_SURNAMES,
  ...ASIAN_SURNAMES, ...NAAN_SURNAMES, ...NHPI_SURNAMES,
];

// Given names removed from the sex-specific lists as sex-ambiguous (see the
// header). They are not drawn for candidates, but they are still names, so a
// record that names someone with one ("Wei Zhang") names a third party.
// prettier-ignore
const REMOVED_AMBIGUOUS_FIRST = [
  "Wei", "Li", "Jin", "Yan", "Ming", "Yu", "Min", "Yi", "Kyung", "Jung", "Hui",
  "Wai", "Tam", "Xiao", "Anh", "Dung", "Linh", "Hoa", "Phuong", "Keola", "Fetu",
];

/**
 * First names and surnames from the tables. A record names no one but the
 * candidate: a first name here followed directly by a surname here
 * ("Wei Zhang", "Patricia Miller") is a third party, unless it is the
 * candidate's own name. A first name alone is not, so places, brands and
 * schools built on one ("Gary, IN", "Papa John's", "Roosevelt High") pass.
 */
export const THIRD_PARTY_FIRST_NAMES: ReadonlySet<string> = new Set([
  ...ALL_FIRST.Male,
  ...ALL_FIRST.Female,
  ...REMOVED_AMBIGUOUS_FIRST,
]);
export const TABLE_SURNAMES: ReadonlySet<string> = new Set(ALL_SURNAMES);

/** Keyed by the LL144_RACE labels in allocation.ts. */
const BY_RACE: Record<string, { first: FirstNames; surnames: readonly string[] }> = {
  "Hispanic or Latino": { first: HISPANIC_FIRST, surnames: HISPANIC_SURNAMES },
  White: { first: WHITE_FIRST, surnames: WHITE_SURNAMES },
  "Black or African American": { first: BLACK_FIRST, surnames: BLACK_SURNAMES },
  "Native Hawaiian or Pacific Islander": { first: NHPI_FIRST, surnames: NHPI_SURNAMES },
  Asian: { first: ASIAN_FIRST, surnames: ASIAN_SURNAMES },
  "Native American or Alaska Native": { first: NAAN_FIRST, surnames: NAAN_SURNAMES },
  "Two or more races": { first: ALL_FIRST, surnames: ALL_SURNAMES },
};

/** FNV-1a, 32-bit: a small deterministic string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A plausible name for the cell, the same for a candidate and seed on every
 * call, so a resumed run sends the same prompt.
 */
export function nameFor(d: Demographics, candidateId: string, seed: number): string {
  if (!LL144_SEX.includes(d.sex) || !LL144_RACE.includes(d.raceEthnicity)) {
    throw new Error(`No names for the cell "${d.sex}|${d.raceEthnicity}".`);
  }
  if (!Number.isInteger(seed)) throw new Error("The seed must be an integer.");
  const lists = BY_RACE[d.raceEthnicity];
  const firsts = lists.first[d.sex as keyof FirstNames];
  const first = firsts[hash(`${seed}|${candidateId}|first`) % firsts.length];
  const surname = lists.surnames[hash(`${seed}|${candidateId}|surname`) % lists.surnames.length];
  return `${first} ${surname}`;
}
