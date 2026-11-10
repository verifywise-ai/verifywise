/**
 * The person rules of the list kit (kit/persons.ts): the tests that tell a natural person's name
 * from an organisation's, each ported from the profiler that measured it, each with its own word
 * lists. The names here are invented; they have the shapes of the names that the profilers read
 * (two to four words, "last, first", a title, an initial, an apostrophe, a hyphen, a legal form
 * after a comma, an organisation word), and none of them is anyone's.
 */
import { createHash } from "crypto";
import {
  CALIFORNIA_CREDENTIALS,
  CALIFORNIA_MIDDLE_INITIAL_NAME,
  EU_LEGAL_FORMS,
  EU_ORG_WORDS,
  GENERIC_LEGAL_FORMS,
  GENERIC_ORG_WORDS,
  SPANISH_ORG_PATTERN,
  californiaPracticeRule,
  euOrgEvidence,
  hasLegalForm,
  looksLikePerson,
  looksLikePersonEs,
} from "../persons";
import type { OrgEvidence, PracticeReason } from "../persons";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

/** U+2019, the apostrophe that the profilers' rules name apart from the plain one. */
const RIGHT_QUOTE = cp(0x2019);
const EN_DASH = cp(0x2013);

const digestOf = (words: ReadonlySet<string>): string =>
  createHash("sha256")
    .update([...words].sort().join("\n"))
    .digest("hex");

describe("the word lists", () => {
  // Size and digest are those of the sets that the profilers' python files hold (read as text, not
  // run): every list is copied verbatim, and none is merged with another.
  it.each([
    [
      "GENERIC_LEGAL_FORMS (p2_common.py LEGAL_FORM_TOKENS)",
      GENERIC_LEGAL_FORMS,
      92,
      "694e15fdc34498ae665d493917f5a4e7a1501d2c9e23ebc824b04694b50d34d2",
    ],
    [
      "GENERIC_ORG_WORDS (p2_common.py ORG_WORDS)",
      GENERIC_ORG_WORDS,
      170,
      "5b8d23be0c4ece20f77662f75918981851ad96b6f647e3ab273b230b54469181",
    ],
    [
      "EU_LEGAL_FORMS (eu_person_rule.py LEGAL)",
      EU_LEGAL_FORMS,
      86,
      "159c16b7f77ae50ba9ede1f4c91f83194c702883195dcfe4282656d670b89512",
    ],
    [
      "EU_ORG_WORDS (eu_person_rule.py WORDS)",
      EU_ORG_WORDS,
      207,
      "9a0d5474d2ce11970736d2e5773ca7e14c222c6464972a6361d34bd0643a35ca",
    ],
    [
      "CALIFORNIA_CREDENTIALS (ca_person_rule.py CREDENTIAL)",
      CALIFORNIA_CREDENTIALS,
      29,
      "2c503eea8aef3c6194d8230b1a183e51559c95693d0a630cef6ea7b2d6cc837a",
    ],
  ])(
    "%s has the members of the profiler's set, no more and no fewer",
    (_name, list, size, digest) => {
      expect(list.size).toBe(size);
      expect(digestOf(list)).toBe(digest);
    },
  );

  it("keeps the odd members as they are written: the dotted ltda., the ampersand, the slashes", () => {
    expect(GENERIC_LEGAL_FORMS.has("ltda.")).toBe(true);
    expect(GENERIC_ORG_WORDS.has("&")).toBe(true);
    expect(GENERIC_ORG_WORDS.has("d/b/a")).toBe(true);
    expect(GENERIC_ORG_WORDS.has("a/k/a")).toBe(true);
    expect(CALIFORNIA_CREDENTIALS.has("pa-c")).toBe(true);
    expect(EU_ORG_WORDS.has(`dr${cp(0xe1)}hy`)).toBe(true);
  });

  it("does not merge the lists: each holds what its own profiler measured", () => {
    // in the generic list only
    expect(GENERIC_LEGAL_FORMS.has("holdings")).toBe(true);
    expect(EU_LEGAL_FORMS.has("holdings")).toBe(false);
    // in the EU list only
    expect(EU_LEGAL_FORMS.has("sasu")).toBe(true);
    expect(GENERIC_LEGAL_FORMS.has("sasu")).toBe(false);
    expect(EU_ORG_WORDS.has("verlag")).toBe(true);
    expect(GENERIC_ORG_WORDS.has("verlag")).toBe(false);
    expect(GENERIC_ORG_WORDS.has("of")).toBe(true);
    expect(EU_ORG_WORDS.has("of")).toBe(false);
    // the credentials are California's alone
    expect(CALIFORNIA_CREDENTIALS.has("cpa")).toBe(true);
    expect(GENERIC_LEGAL_FORMS.has("cpa")).toBe(false);
    expect(EU_LEGAL_FORMS.has("cpa")).toBe(false);
  });
});

describe("hasLegalForm (p2_common.py has_legal_form)", () => {
  it.each([
    ["a legal form after a comma", "Tolbrek, Inc."],
    ["a legal form", "Tolbrek Inc"],
    ["a dotted legal form", "Tolbrek L.L.C."],
    ["a legal form with its dot", "Tolbrek Ltd."],
    ["a German legal form", "Tolbrek GmbH"],
    ["a dotted Romance legal form", "Tolbrek S.A."],
    ["a Spanish legal form with its dot", "Tolbrek Ltda."],
    ["a word of the list in the middle", "Tolbrek Group Ombrel"],
    ["a word that stands for a form: group", "Tolbrek Group"],
    ["a word that stands for a form: holdings", "Tolbrek Holdings"],
    ["a form inside parentheses", "Tolbrek (Inc)"],
    ["a form that is the only word", "Inc"],
    ["a dotted form that is the only word (the dots are taken out)", "L.T.D."],
    ["the Spanish y between two names", "Ysmara y Tolbrek"],
  ])("finds %s", (_name, name) => {
    expect(hasLegalForm(name)).toBe(true);
  });

  it.each([
    ["an organisation word that is not a form", "Tolbrek Bank"],
    ["a form that is the first word of several", "Inc Tolbrek"],
    ["a single name", "Tolbrek"],
    ["two names", "Ysmara Tolbrek"],
    ["a form in square brackets (only . , ; ( ) are taken off)", "Tolbrek [Inc]"],
    ["a form with a colon", "Tolbrek Inc:"],
    ["an empty name", ""],
    ["a name of blanks", "   "],
    ["a name of punctuation", "..."],
  ])("does not find one in %s", (_name, name) => {
    expect(hasLegalForm(name)).toBe(false);
  });
});

describe("looksLikePerson (p2_common.py looks_like_person)", () => {
  it.each([
    ["first and last", "Ysmara Tolbrek"],
    ["first, middle and last", "Ysmara Falquor Tolbrek"],
    ["four words", "Ysmara Falquor Drennic Tolbrek"],
    ["an initial", "Ysmara F. Tolbrek"],
    ["last, first", "Tolbrek, Ysmara"],
    ["a title", "Dr. Ysmara Tolbrek"],
    ["a hyphen and an apostrophe", "Ysmara-Falquor O'Tolbrek"],
    ["the typographic apostrophe", `Ysmara O${RIGHT_QUOTE}Tolbrek`],
    ["an et al that the profile read as a person", "Tolbrek et al"],
  ])("keeps %s as a person", (_name, name) => {
    expect(looksLikePerson(name)).toBe(true);
  });

  it.each([
    ["a legal form after a comma", "Tolbrek, Inc."],
    ["a legal form that stands for one", "Tolbrek Holdings"],
    ["an organisation word", "Tolbrek Bank"],
    ["a single word", "Ysmara"],
    ["five words", "Ysmara Falquor Drennic Ombrel Tolbrek"],
    ["a digit", "Ysmara Tolbrek 3rd"],
    ["an ampersand", "Ysmara & Tolbrek"],
    ["a slash", "Ysmara/Tolbrek"],
    ["an at sign", "Ysmara Tolbrek@Ombrel"],
    [
      "Spanish particles, which the generic list holds as organisation words",
      "Ysmara de la Tolbrek",
    ],
    ["a word that is a legal form", "Ysmara Tolbrek Co"],
    ["an empty name", ""],
    ["a name of blanks", "   "],
  ])("drops %s", (_name, name) => {
    expect(looksLikePerson(name)).toBe(false);
  });
});

describe("euOrgEvidence (eu_person_rule.py org_evidence)", () => {
  it.each<[string, string, OrgEvidence]>([
    ["a digit", "Tolbrek 2000", "digit_or_symbol"],
    ["an ampersand", "Tolbrek & Ombrel", "digit_or_symbol"],
    ["a slash", "Tolbrek/Ombrel", "digit_or_symbol"],
    ["an at sign", "tolbrek@ombrel", "digit_or_symbol"],
    ["a legal form", "Tolbrek Verlag GmbH", "legal_form"],
    ["a dotted legal form", "Tolbrek S.A.", "legal_form"],
    ["a legal form whose dots are all taken out", "Tolbrek G.m.b.H.", "legal_form"],
    ["a legal form before an organisation word", "Tolbrek Bank GmbH", "legal_form"],
    ["an organisation word", "Tolbrek Bank", "org_word"],
    ["another organisation word", "Tolbrek Brewery", "org_word"],
    ["an organisation word before an acronym", "QTVX Bank", "org_word"],
    ["an acronym of four capitals", "Ysmara QTVX", "acronym"],
    ["an acronym of six capitals", "Ysmara QTVXZW", "acronym"],
    ["an acronym after a comma", "Ysmara, QTVX", "acronym"],
  ])("takes %s for an organisation: %s", (_name, name, evidence) => {
    expect(euOrgEvidence(name)).toBe(evidence);
  });

  it.each([
    ["first and last", "Ysmara Tolbrek"],
    ["one word", "Tolbrek"],
    ["last, first", "Tolbrek, Ysmara"],
    ["a word that only the California list holds: banks", "Ysmara Banks"],
    ["seven capitals", "Ysmara QTVXZWK"],
    ["a capital word of one letter", "Ysmara Q"],
    ["capitals with a dot after them", "Ysmara QTVX."],
    ["an empty name", ""],
    ["a name of blanks", "   "],
  ])("shows no organisation in %s", (_name, name) => {
    expect(euOrgEvidence(name)).toBeNull();
  });
});

describe("SPANISH_ORG_PATTERN and looksLikePersonEs (co_person_rule.py)", () => {
  it("is one pattern with the flags i and u, and no flag that keeps a position", () => {
    expect(SPANISH_ORG_PATTERN.flags).toBe("iu");
    expect(SPANISH_ORG_PATTERN.global).toBe(false);
    expect(SPANISH_ORG_PATTERN.sticky).toBe(false);
  });

  it.each([
    "SERVICIOS",
    "Servicios Tolbrek",
    "Tolbrek LTDA.",
    "Tolbrek ltda",
    "Tolbrek S.A.S",
    "Tolbrek S en C",
    "Corporaci" + cp(0xf3) + "n Tolbrek",
    "CORPORACION TOLBREK",
    "Instituci" + cp(0xd3) + "N Tolbrek",
    "Cl" + cp(0xed) + "nica Tolbrek",
    "Compa" + cp(0xf1) + cp(0xed) + "a Tolbrek",
    "Droguer" + cp(0xed) + "a Tolbrek",
    "Tolbrek Tours",
    "Tolbrek Tour",
  ])("finds the organisation word of %s", (name) => {
    expect(SPANISH_ORG_PATTERN.test(name)).toBe(true);
  });

  it.each([
    ["a name that holds SA inside a word", "Sandrovik Tolbrek"],
    ["a name that holds CIA after a letter", "Ysmara Tolbrecia"],
    ["two names", "Ysmara Tolbrek"],
  ])("finds none in %s", (_name, name) => {
    expect(SPANISH_ORG_PATTERN.test(name)).toBe(false);
  });

  it.each([
    ["first and last, with accents", `Ysmar${cp(0xe1)} Tolbr${cp(0xe9)}${cp(0xf1)}`],
    ["the same in capitals", `YSMAR${cp(0xc1)} TOLBR${cp(0xc9)}${cp(0xd1)}`],
    [
      "particles between the names",
      `Ysmar${cp(0xe1)} de los Falqu${cp(0xf3)}r Tolbr${cp(0xe9)}${cp(0xf1)}`,
    ],
    [
      "six words",
      `Ysmar${cp(0xe1)} Falqu${cp(0xf3)}r Drennic Ombrel Quendrel Tolbr${cp(0xe9)}${cp(0xf1)}`,
    ],
    [
      "a hyphen in a name of two words",
      `Ysmar${cp(0xe1)}-Falqu${cp(0xf3)}r Tolbr${cp(0xe9)}${cp(0xf1)}`,
    ],
    ["an apostrophe", "Ysmara D'Tolbrek"],
    ["a trailing dot, which is taken off", "Ysmara Tolbrek."],
  ])("keeps %s as a person", (_name, name) => {
    expect(looksLikePersonEs(name)).toBe(true);
  });

  it.each([
    ["an organisation word", "Inversiones Tolbrek"],
    ["a legal form", "Ysmara Tolbrek Ltda"],
    ["a trade word", `Droguer${cp(0xed)}a Tolbrek`],
    ["one word", "Tolbrek"],
    ["one word and a particle", "Tolbrek y"],
    ["particles alone", "de la"],
    ["a digit", "Ysmara Tolbrek 2"],
    ["an ampersand", "Ysmara & Tolbrek"],
    ["a slash", "Ysmara/Tolbrek"],
    ["seven words", "Ysmara Falquor Drennic Ombrel Quendrel Marnovik Tolbrek"],
    ["a hyphenated word alone", "Ysmara-Tolbrek"],
    ["an en dash, which the class of letters does not take", `Ysmara${EN_DASH}Falquor Tolbrek`],
    ["a semicolon, which is not taken off", "Ysmara Tolbrek;"],
    ["parentheses", "Ysmara (Tolbrek)"],
    ["the typographic apostrophe", `Ysmara D${RIGHT_QUOTE}Tolbrek`],
    ["an empty name", ""],
    ["a name of blanks", "   "],
  ])("drops %s", (_name, name) => {
    expect(looksLikePersonEs(name)).toBe(false);
  });

  it("refuses a hyphen only for a name of fewer than two words, never for two (the Python precedence)", () => {
    // `"-" in n and len(n.split()) < 2` is one clause: a hyphen alone does not refuse a name.
    expect(looksLikePersonEs("Ysmara-Falquor Tolbrek")).toBe(true);
    // ...and the other refusals are not tied to the number of words.
    expect(looksLikePersonEs("Servicios Tolbrek")).toBe(false);
    expect(looksLikePersonEs("Ysmara Tolbrek 2")).toBe(false);
    expect(looksLikePersonEs("Ysmara & Tolbrek")).toBe(false);
  });
});

describe("californiaPracticeRule (ca_person_rule.py practice_rule)", () => {
  it.each<[string, string, PracticeReason]>([
    ["Dr. and a name", "Dr. Ysmara Tolbrek", "dr_prefix"],
    ["DR in capitals", "DR YSMARA TOLBREK", "dr_prefix"],
    ["Doctor", "Doctor Ysmara Tolbrek", "dr_prefix"],
    ["Dr without a dot", "Dr Tolbrek", "dr_prefix"],
    ["Law Offices of", "Law Offices of Ysmara Tolbrek", "law_office_of"],
    ["Law Office of", "Law Office of Ysmara Tolbrek", "law_office_of"],
    ["Law Firm of", "Law Firm of Ysmara Tolbrek", "law_office_of"],
    ["Office of", "Office of Ysmara Tolbrek", "law_office_of"],
    ["Offices of", "Offices of Ysmara Tolbrek", "law_office_of"],
    ["Law Offices of in capitals", "LAW OFFICES OF TOLBREK", "law_office_of"],
    ["a credential after a comma", "Ysmara Tolbrek, CPA", "credential_suffix"],
    ["a dotted credential after a comma", "Ysmara Tolbrek, D.D.S.", "credential_suffix"],
    ["a credential after a surname alone", "Tolbrek, MD", "credential_suffix"],
    ["a credential with a dot inside", "Ysmara Tolbrek, Ph.D.", "credential_suffix"],
    ["a credential with a hyphen", "Ysmara Tolbrek, PA-C", "credential_suffix"],
    ["a credential after two commas", "Ysmara Tolbrek, Jr., MD", "credential_suffix"],
    ["a credential with no comma, three words", "Ysmara Tolbrek DDS", "credential_suffix_nocomma"],
    ["a dotted credential with no comma", "Ysmara Tolbrek D.D.S.", "credential_suffix_nocomma"],
    [
      "a credential with no comma, four words",
      "Ysmara Falquor Tolbrek MD",
      "credential_suffix_nocomma",
    ],
  ])("gives the reason for %s", (_name, name, reason) => {
    expect(californiaPracticeRule(name)).toBe(reason);
  });

  it.each([
    ["a name alone", "Ysmara Tolbrek"],
    ["a credential after only one other word and no comma", "Tolbrek DDS"],
    ["a word that begins like Dr", "Drevik Tolbrek"],
    ["The before Law Offices of", "The Law Offices of Tolbrek"],
    ["Law Office of with nothing after it", "Law Office of"],
    ["a word that is not a credential after a comma", "Ysmara Tolbrek, Incorporated"],
    ["a trailing comma", "Ysmara Tolbrek,"],
    ["an empty name", ""],
    ["a name of blanks", "   "],
  ])("gives no reason for %s", (_name, name) => {
    expect(californiaPracticeRule(name)).toBeNull();
  });

  it("gives the first reason that holds: Dr. before Law Offices of before a comma before no comma", () => {
    expect(californiaPracticeRule("Dr. Ysmara Tolbrek, DDS")).toBe("dr_prefix");
    expect(californiaPracticeRule("Law Offices of Ysmara Tolbrek, CPA")).toBe("law_office_of");
    expect(californiaPracticeRule("Ysmara Tolbrek, DDS")).toBe("credential_suffix");
  });
});

describe("CALIFORNIA_MIDDLE_INITIAL_NAME (rule M)", () => {
  it("is a pattern with the flag u alone, so that it keeps no position", () => {
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.flags).toBe("u");
  });

  it.each([
    ["a middle initial without a dot", "Ysmara F Tolbrek"],
    ["a middle initial with a dot", "Ysmara F. Tolbrek"],
    ["Dr. and a middle initial", "Dr. Ysmara F. Tolbrek"],
    ["a suffix after a comma", "Ysmara F. Tolbrek, Esq"],
    ["a suffix of letters", "Ysmara F. Tolbrek Jr"],
    ["a hyphen in the last name", "Ysmara F. Tolbrek-Ombrel"],
    ["a plain apostrophe in the last name", "Ysmara F. O'Tolbrek"],
    ["the typographic apostrophe (U+2019) in the last name", `Ysmara F. O${RIGHT_QUOTE}Tolbrek`],
    ["an organisation with a single capital (measured: the rule takes it)", "Velkora K Marnovik"],
    ["the same with Inc after it", "Velkora K Marnovik Inc"],
  ])("matches %s", (_name, name) => {
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test(name)).toBe(true);
  });

  it.each([
    ["no middle initial", "Ysmara Tolbrek"],
    ["two capitals in the middle", "Ysmara FF Tolbrek"],
    ["a lower-case first name", "ysmara F Tolbrek"],
    ["a suffix of more than six letters", "Ysmara F. Tolbrek, Incorporated"],
    ["a left single quotation mark (U+2018) in the last name", `Ysmara F. O${cp(0x2018)}Tolbrek`],
    ["a modifier letter apostrophe (U+02BC) in the last name", `Ysmara F. O${cp(0x2bc)}Tolbrek`],
    ["a digit in the last name", "Ysmara F. Tolbrek2"],
    ["an empty name", ""],
  ])("does not match %s", (_name, name) => {
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test(name)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The porting rules: each place where the python is another form in JavaScript.
// ---------------------------------------------------------------------------------------------

/** Every string of up to two characters of `alphabet`, the empty one first. */
const edges = (alphabet: readonly string[]): string[] => [
  "",
  ...alphabet,
  ...alphabet.flatMap((first) => alphabet.map((second) => first + second)),
];

/**
 * The one-line port of `str.strip(chars)` that the specification names, `^[chars]+|[chars]+$`: the
 * reference for the scan that persons.ts uses instead. It takes time in the square of the length on
 * a long run of those characters inside a word (see "hostile input"), so only short words go
 * through it here.
 */
const specStrip = (word: string, chars: string): string => {
  const set = chars.replace(/[\\\]^-]/gu, "\\$&");
  return word.replace(new RegExp(`^[${set}]+|[${set}]+$`, "gu"), "");
};

/** `str.replace(".", "")` of Python: every dot out. */
const dotless = (text: string): string => text.split(".").join("");

describe("str.strip(chars): the scan takes what the one-line regular expression takes", () => {
  it("hasLegalForm: . , ; ( ) come off both ends of a word, and no other character does", () => {
    const ends = edges([".", ",", ";", "(", ")", "[", "'", "!", ":", RIGHT_QUOTE]);
    const dotlessForms = new Set([...GENERIC_LEGAL_FORMS].map(dotless));
    const wrong: string[] = [];
    for (const before of ends) {
      for (const after of ends) {
        const word = `${before}ltd${after}`;
        const stripped = specStrip(word, ".,;()").toLowerCase();
        const expected = GENERIC_LEGAL_FORMS.has(stripped) || dotlessForms.has(dotless(stripped));
        if (hasLegalForm(`Tolbrek ${word}`) !== expected) wrong.push(word);
      }
    }
    expect(ends).toHaveLength(111);
    expect(wrong).toEqual([]);
  });

  it("euOrgEvidence: . , ; : ( ) ' and U+2019 come off both ends of a word, and no other character does", () => {
    const ends = edges([".", ";", ":", "(", ")", "'", RIGHT_QUOTE, "[", "!", cp(0x2018)]);
    const wrong: string[] = [];
    for (const before of ends) {
      for (const after of ends) {
        const word = `${before}ltd${after}`;
        const stripped = specStrip(word, ".,;:()'" + RIGHT_QUOTE).toLowerCase();
        let expected: OrgEvidence | null = null;
        if (EU_LEGAL_FORMS.has(dotless(stripped))) expected = "legal_form";
        else if (EU_ORG_WORDS.has(stripped)) expected = "org_word";
        if (euOrgEvidence(`Tolbrek ${word}`) !== expected) wrong.push(word);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("euOrgEvidence takes the plain and the typographic apostrophe off, and not the left single quotation mark", () => {
    expect(euOrgEvidence("Tolbrek 'Bank'")).toBe("org_word");
    expect(euOrgEvidence(`Tolbrek ${RIGHT_QUOTE}Bank${RIGHT_QUOTE}`)).toBe("org_word");
    expect(euOrgEvidence(`Tolbrek ${cp(0x2018)}Bank${cp(0x2019)}`)).toBeNull();
    expect(euOrgEvidence("Tolbrek Inc:")).toBe("legal_form");
    expect(hasLegalForm("Tolbrek Inc:")).toBe(false);
    expect(hasLegalForm("Tolbrek 'Inc'")).toBe(false);
  });

  it("looksLikePerson takes a dot off a word before it asks for a legal form, and not an apostrophe", () => {
    expect(looksLikePerson("Tolbrek Ltd.")).toBe(false);
    expect(looksLikePerson("Tolbrek .Ltd")).toBe(false);
    expect(looksLikePerson("Tolbrek Ltd")).toBe(false);
    // an apostrophe is no strip character: the word is not a form, and its letters are letters
    expect(looksLikePerson("Tolbrek 'Ltd'")).toBe(true);
    // parentheses are taken off for the form test (the word is then "ltd"), and the word is no letters
    expect(looksLikePerson("Tolbrek (Ltd)")).toBe(false);
  });

  it("looksLikePersonEs takes . and , off a word before it asks for a particle, and no other character", () => {
    expect(looksLikePersonEs("Tolbrek de.")).toBe(false);
    expect(looksLikePersonEs("Tolbrek de,")).toBe(false);
    expect(looksLikePersonEs("Tolbrek .de")).toBe(false);
    expect(looksLikePersonEs("Tolbrek ..,de.,.")).toBe(false);
    // a hyphen, an apostrophe or an inner dot are no strip characters: "de" is then not a particle
    expect(looksLikePersonEs("Tolbrek -de")).toBe(true);
    expect(looksLikePersonEs("Tolbrek 'de'")).toBe(true);
    expect(looksLikePersonEs("Tolbrek d.e")).toBe(true);
  });

  it.each(["de", "del", "la", "las", "los", "y", "e", "el"])(
    "looksLikePersonEs takes %s for a particle: it does not count as a word of the name",
    (particle) => {
      expect(looksLikePersonEs(`Tolbrek ${particle}`)).toBe(false);
      expect(looksLikePersonEs(`Ysmara ${particle} Tolbrek`)).toBe(true);
    },
  );

  it("looksLikePersonEs counts a word that only looks like a particle: da is a word of the name", () => {
    expect(looksLikePersonEs("Tolbrek da")).toBe(true);
    expect(looksLikePersonEs("Tolbrek dell")).toBe(true);
  });

  it("californiaPracticeRule: the credential after a comma has its dots taken off at both ends, and only dots", () => {
    expect(californiaPracticeRule("Ysmara Tolbrek, .CPA.")).toBe("credential_suffix");
    expect(californiaPracticeRule("Ysmara Tolbrek, CPA;")).toBeNull();
    expect(californiaPracticeRule("Ysmara Tolbrek, (CPA)")).toBeNull();
    expect(californiaPracticeRule("Ysmara Tolbrek, CPA .")).toBeNull();
  });

  it("californiaPracticeRule: the last word has . and , taken off, and no other character", () => {
    expect(californiaPracticeRule("Ysmara Tolbrek DDS.")).toBe("credential_suffix_nocomma");
    expect(californiaPracticeRule("Ysmara Tolbrek DDS,")).toBe("credential_suffix_nocomma");
    expect(californiaPracticeRule("Ysmara Tolbrek DDS;")).toBeNull();
    expect(californiaPracticeRule("Ysmara Tolbrek (DDS)")).toBeNull();
    expect(californiaPracticeRule(`Ysmara Tolbrek ${cp(0x201c)}DDS${cp(0x201d)}`)).toBeNull();
  });

  it("californiaPracticeRule counts the words of a name without the quotes and brackets round them: . , ; : ( ) ' U+2019 \" U+201C U+201D", () => {
    // a mark that is all strip characters is no word, so three words of the rule are two here
    for (const mark of [
      ".",
      ";",
      ":",
      "(",
      ")",
      "'",
      RIGHT_QUOTE,
      '"',
      cp(0x201c),
      cp(0x201d),
      "()",
      "...",
    ]) {
      expect(californiaPracticeRule(`Ysmara ${mark} ${mark} DDS`)).toBeNull();
    }
    // a mark that is not one of them is a word
    for (const mark of ["[", "]", "!", "*", "-", cp(0x2018), cp(0x2013)]) {
      expect(californiaPracticeRule(`Ysmara ${mark} DDS`)).toBe("credential_suffix_nocomma");
    }
  });

  it("californiaPracticeRule counts the words of a name that the slash and the comma divide, as toks() does", () => {
    expect(californiaPracticeRule("Tolbrek/Ombrel DDS")).toBe("credential_suffix_nocomma");
    expect(californiaPracticeRule("Tolbrek DDS")).toBeNull();
    expect(californiaPracticeRule("Ysmara Tolbrek DDS,")).toBe("credential_suffix_nocomma");
  });
});

describe('str.replace(".", "") takes out every dot, not the first alone', () => {
  it("hasLegalForm reads L.T.D. as ltd, alone and after a name", () => {
    expect(hasLegalForm("L.T.D.")).toBe(true);
    expect(hasLegalForm("Tolbrek L.T.D.")).toBe(true);
    expect(hasLegalForm("Tolbrek L.T.D")).toBe(true);
  });

  it("euOrgEvidence reads every dotted form with all its dots out", () => {
    expect(euOrgEvidence("Tolbrek G.m.b.H.")).toBe("legal_form");
    expect(euOrgEvidence("Tolbrek S.A.R.L.")).toBe("legal_form");
    expect(euOrgEvidence("Tolbrek e.V.")).toBe("legal_form");
    expect(euOrgEvidence("Tolbrek Ltd.")).toBe("legal_form");
  });

  it("californiaPracticeRule reads every dotted credential with all its dots out", () => {
    expect(californiaPracticeRule("Ysmara Tolbrek, D.D.S.")).toBe("credential_suffix");
    expect(californiaPracticeRule("Ysmara Tolbrek, M.F.T.")).toBe("credential_suffix");
    expect(californiaPracticeRule("Ysmara Tolbrek L.C.S.W.")).toBe("credential_suffix_nocomma");
  });
});

describe('re.split(r"\\s+"): a run of white space is one break, and only white space', () => {
  it.each([
    ["a tab", "\t"],
    ["a line feed", "\n"],
    ["a carriage return and a line feed", "\r\n"],
    ["a form feed", "\f"],
    ["a vertical tab", "\v"],
    ["a no-break space", cp(0xa0)],
    ["an em space", cp(0x2003)],
    ["a line separator", cp(0x2028)],
    ["an ideographic space", cp(0x3000)],
    ["a run of mixed white space", ` \t\n${cp(0xa0)}${cp(0x3000)} `],
  ])("hasLegalForm and the others divide the words at %s", (_name, space) => {
    expect(hasLegalForm(`Tolbrek${space}Inc`)).toBe(true);
    expect(looksLikePerson(`Ysmara${space}Tolbrek`)).toBe(true);
    expect(looksLikePersonEs(`Ysmara${space}Tolbrek`)).toBe(true);
    expect(californiaPracticeRule(`Ysmara${space}Tolbrek${space}DDS`)).toBe(
      "credential_suffix_nocomma",
    );
    expect(euOrgEvidence(`Tolbrek${space}Bank`)).toBe("org_word");
  });

  it("does not divide at a character that is no white space: the zero-width space is a letter of the word", () => {
    expect(hasLegalForm(`Tolbrek${cp(0x200b)}Inc`)).toBe(false);
    expect(looksLikePersonEs(`Ysmara${cp(0x200b)}Tolbrek`)).toBe(false);
    expect(euOrgEvidence(`Tolbrek${cp(0x200b)}Bank`)).toBeNull();
  });
});

describe("str.strip(): the white space round a name is taken off first", () => {
  it.each([
    ["blanks", "   "],
    ["a tab and a line feed", "\t\n"],
    ["a no-break space and an ideographic space", `${cp(0xa0)}${cp(0x3000)}`],
  ])("californiaPracticeRule reads a name with %s round it as the name alone", (_name, space) => {
    // the two prefix tests are anchored at the start, and the last word is the last of the text
    expect(californiaPracticeRule(`${space}Dr. Ysmara Tolbrek${space}`)).toBe("dr_prefix");
    expect(californiaPracticeRule(`${space}Law Offices of Ysmara Tolbrek${space}`)).toBe(
      "law_office_of",
    );
    expect(californiaPracticeRule(`${space}Ysmara Tolbrek, CPA${space}`)).toBe("credential_suffix");
    expect(californiaPracticeRule(`${space}Ysmara Tolbrek DDS${space}`)).toBe(
      "credential_suffix_nocomma",
    );
  });

  it("gives the same answer for a name with white space round it as for the name alone", () => {
    const framed = (name: string): string => `  \t${name}\n  `;
    for (const name of ["Tolbrek, Inc.", "Ysmara Tolbrek", "Tolbrek Bank", "Inc", "Ysmara QTVX"]) {
      expect(hasLegalForm(framed(name))).toBe(hasLegalForm(name));
      expect(looksLikePerson(framed(name))).toBe(looksLikePerson(name));
      expect(euOrgEvidence(framed(name))).toBe(euOrgEvidence(name));
      expect(looksLikePersonEs(framed(name))).toBe(looksLikePersonEs(name));
      expect(californiaPracticeRule(framed(name))).toBe(californiaPracticeRule(name));
    }
  });
});

describe("str.isalpha() is a letter of any script, str.isdigit() a decimal digit of any script", () => {
  it.each([
    ["Greek", cp(0x391, 0x3bb, 0x3c6, 0x3b1), cp(0x392, 0x3b7, 0x3c4, 0x3b1)],
    ["Cyrillic", cp(0x416, 0x443, 0x43a), cp(0x41f, 0x435, 0x440, 0x43e)],
    ["Han", cp(0x7532, 0x4e59), cp(0x4e19, 0x4e01)],
    ["Hebrew, which is written from right to left", cp(0x5d0, 0x5d1), cp(0x5d2, 0x5d3)],
    ["Arabic, which is written from right to left", cp(0x627, 0x628), cp(0x62a, 0x62b)],
    ["Latin letters outside the Spanish class", `Ysm${cp(0xe7)}ra`, `Tolbr${cp(0xf6)}k`],
    ["letters beyond U+FFFF", cp(0x1d49c) + "lbrek", cp(0x20000, 0x20001)],
  ])("looksLikePerson keeps two words of %s letters as a person", (_script, first, second) => {
    expect(looksLikePerson(`${first} ${second}`)).toBe(true);
  });

  it.each([
    ["a combining acute accent (a mark is no letter)", `Tolbre${cp(0x301)}k`],
    ["an Arabic-Indic digit", `Tolbrek${cp(0x663)}`],
    ["a full-width digit", `Tolbrek${cp(0xff13)}`],
    ["a superscript two", `Tolbrek${cp(0xb2)}`],
    ["a Roman numeral eight", `Tolbrek${cp(0x2167)}`],
    ["an underscore", "Tolbrek_"],
    ["a zero-width space", `Tolbrek${cp(0x200b)}`],
    ["a lone high surrogate", `Tolbrek${cp(0xd800)}`],
    ["an emoji", `Tolbrek${cp(0x1f600)}`],
  ])("looksLikePerson refuses a name with %s", (_what, second) => {
    expect(looksLikePerson(`Ysmara ${second}`)).toBe(false);
  });

  it("looksLikePerson refuses a word of marks and punctuation only, which has no letter", () => {
    expect(looksLikePerson("Ysmara -")).toBe(false);
    expect(looksLikePerson("Ysmara ...")).toBe(false);
    expect(looksLikePerson("Ysmara '")).toBe(false);
    expect(looksLikePerson(`Ysmara ${RIGHT_QUOTE}`)).toBe(false);
  });

  it("refuses a decimal digit of any script in the person rules", () => {
    for (const digit of [cp(0x663), cp(0xff13), cp(0x966), cp(0x1d7d8)]) {
      expect(looksLikePerson(`Ysmara Tolbrek${digit}`)).toBe(false);
      expect(looksLikePersonEs(`Ysmara Tolbrek${digit}`)).toBe(false);
    }
  });

  it("euOrgEvidence looks for the ASCII digits 0 to 9 alone, as [0-9&@/] does", () => {
    expect(euOrgEvidence("Tolbrek 7")).toBe("digit_or_symbol");
    expect(euOrgEvidence(`Tolbrek ${cp(0x663)}`)).toBeNull();
    expect(euOrgEvidence(`Tolbrek ${cp(0xff17)}`)).toBeNull();
  });
});

describe("the Python precedence of the fourth test of looks_person_es", () => {
  it("keeps a hyphenated name of two words, which a misreading of the precedence would refuse", () => {
    expect(looksLikePersonEs("Ysmara-Falquor Tolbrek")).toBe(true);
    expect(looksLikePersonEs("Ysmara Falquor-Tolbrek")).toBe(true);
    expect(looksLikePersonEs("Ysmara Falquor Tolbrek-Ombrel")).toBe(true);
  });

  it("refuses a name of two words for an organisation word, a digit or an ampersand, hyphen or not", () => {
    // `(…) and len(n.split()) < 2` must not swallow the earlier tests: it is the last clause alone
    for (const name of [
      "Servicios Tolbrek",
      "Ysmara-Servicios Tolbrek",
      "Ysmara Tolbrek2",
      "Ysmara-Falquor 2",
      "Ysmara & Tolbrek",
      "Ysmara-Falquor & Tolbrek",
      "Ysmara/Tolbrek",
    ]) {
      expect(looksLikePersonEs(name)).toBe(false);
    }
  });

  it("refuses a hyphenated word alone, written with a hyphen or an en dash", () => {
    expect(looksLikePersonEs("Ysmara-Tolbrek")).toBe(false);
    expect(looksLikePersonEs(`Ysmara${EN_DASH}Tolbrek`)).toBe(false);
  });

  it("does not take an en dash for a hyphen in a word: the class of letters has no en dash", () => {
    expect(looksLikePersonEs(`Ysmara${EN_DASH}Falquor Tolbrek`)).toBe(false);
  });
});

describe("the letters of SPANISH_ORG_PATTERN's lookarounds, and its words", () => {
  const LETTERS = `A-Za-z${cp(0xc1, 0xc9, 0xcd, 0xd3, 0xda, 0xdc, 0xd1, 0xe1, 0xe9, 0xed, 0xf3, 0xfa, 0xfc, 0xf1)}`;

  it("is the profiler's alternation, byte for byte, between the lookarounds", () => {
    const head = `(?<![${LETTERS}])(?:`;
    const tail = `)(?![${LETTERS}])`;
    const { source } = SPANISH_ORG_PATTERN;
    expect(source.startsWith(head)).toBe(true);
    expect(source.endsWith(tail)).toBe(true);
    const words = source.slice(head.length, source.length - tail.length);
    expect(words).toHaveLength(980);
    expect(createHash("sha256").update(words).digest("hex")).toBe(
      "cfe57263d931e6796cadd5ff7ff7e257c58e2388736e01d4a2efb0eabb5e48f6",
    );
  });

  const SAMPLES = [
    "S.A.S",
    "SAS",
    "S A S",
    "S.A.",
    "SA",
    "S A",
    "LTDA",
    "LTDA.",
    "LIMITADA",
    "S EN C",
    "S.EN C.",
    "E.U.",
    "EU",
    "E U",
    "E.S.P.",
    "ESP",
    "S.C.A.",
    "SCA",
    "CIA",
    "COOPERATIVA",
    "CORPORACION",
    `CORPORACI${cp(0xd3)}N`,
    "FUNDACION",
    `FUNDACI${cp(0xd3)}N`,
    "ASOCIACION",
    `ASOCIACI${cp(0xd3)}N`,
    "UNIVERSIDAD",
    "INSTITUCION",
    `INSTITUCI${cp(0xd3)}N`,
    "INSTITUTO",
    "EPS",
    "E.P.S.",
    "IPS",
    "I.P.S.",
    "CLINICA",
    `CL${cp(0xcd)}NICA`,
    "HOSPITAL",
    "BANCO",
    "COMPANIA",
    `COMPA${cp(0xd1)}${cp(0xcd)}A`,
    `COMPA${cp(0xd1)}IA`,
    `COMPAN${cp(0xcd)}A`,
    "EMPRESA",
    "SOCIEDAD",
    "COLEGIO",
    "CENTRO",
    "GRUPO",
    "FINANCIERA",
    "SERVICIOS",
    "INVERSIONES",
    "COMERCIALIZADORA",
    "DISTRIBUIDORA",
    "CONSTRUCTORA",
    "TRANSPORTE",
    "TRANSPORTES",
    "ASOCIADOS",
    "HOLDING",
    "INC",
    "LLC",
    "CORP",
    "SRL",
    "S.R.L",
    "S R L",
    "SUCURSAL",
    `LIQUIDACI${cp(0xd3)}N`,
    "SIGLA",
    "HOTEL",
    "HOTELES",
    "RESTAURANTE",
    "SUPERMERCADO",
    "ALMACEN",
    `ALMAC${cp(0xc9)}N`,
    "ALMACENES",
    `DROGUER${cp(0xcd)}A`,
    "TIENDA",
    "COMERCIAL",
    "AGENCIA",
    "VIAJES",
    "TOUR",
    "TOURS",
    "TURISMO",
    "CLUB",
    "PARQUEADERO",
    "LAVADERO",
    `FERRETER${cp(0xcd)}A`,
    `PANADER${cp(0xcd)}A`,
    "DISCOTECA",
    "GIMNASIO",
    "TALLER",
    `LIBRER${cp(0xcd)}A`,
    `PAPELER${cp(0xcd)}A`,
    "HERMANOS",
    "HNOS",
    "EDITORIAL",
    "INDUSTRIA",
    "INDUSTRIAS",
    "COLOMBIA",
    "NACIONAL",
    "INTERNACIONAL",
    "LABORATORIO",
    "CONSTRUCCIONES",
    `INGENIER${cp(0xcd)}A`,
    "MOTORS",
    "AUTOS",
    "AUTOMOTORES",
    "CARROCERIAS",
    "SUPERMAYORISTA",
    "SOLUCIONES",
    `TECNOLOG${cp(0xcd)}A`,
    "SISTEMAS",
    "NEGOCIOS",
    "PROPIEDAD",
    "HORIZONTAL",
    "CONJUNTO",
    "EDIFICIO",
    "PH",
    "ASESORES",
    "CONSULTORES",
  ];

  it.each(SAMPLES)(
    "finds %s between two names, in capitals and in lower case, and takes the name for no person",
    (word) => {
      expect(SPANISH_ORG_PATTERN.test(`Ysmara ${word} Tolbrek`)).toBe(true);
      expect(SPANISH_ORG_PATTERN.test(`Ysmara ${word.toLowerCase()} Tolbrek`)).toBe(true);
      expect(looksLikePersonEs(`Ysmara ${word} Tolbrek`)).toBe(false);
    },
  );

  it("finds a word that has a dot or a hyphen next to it, which are no letters", () => {
    expect(SPANISH_ORG_PATTERN.test("Ysmara.CLUB")).toBe(true);
    expect(SPANISH_ORG_PATTERN.test("Ysmara-CLUB")).toBe(true);
    expect(SPANISH_ORG_PATTERN.test("(CLUB)")).toBe(true);
  });

  it("does not find a word inside a longer word: a letter of Spanish on either side stops it", () => {
    for (const name of [
      "CLUBS",
      "XCLUB",
      "Tolbrecia",
      "Sandrovik",
      "Tolbrekph",
      "PHx",
      `${cp(0xf1)}CLUB`,
    ]) {
      expect(SPANISH_ORG_PATTERN.test(name)).toBe(false);
    }
  });

  it("counts only the Latin letters of Spanish as letters: a c with a cedilla is no letter, so a word after it is found", () => {
    expect(SPANISH_ORG_PATTERN.test(`Tolbrek${cp(0xe7)}club`)).toBe(true);
    expect(SPANISH_ORG_PATTERN.test(`${cp(0xe7)}HOTEL${cp(0xe7)}`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Unicode
// ---------------------------------------------------------------------------------------------

describe("accents, the sharp s, the Turkish i, and composed and decomposed forms", () => {
  const SPANISH_LOWER = [0xe1, 0xe9, 0xed, 0xf3, 0xfa, 0xfc, 0xf1];
  const SPANISH_UPPER = [0xc1, 0xc9, 0xcd, 0xd3, 0xda, 0xdc, 0xd1];

  it.each(
    [...SPANISH_LOWER, ...SPANISH_UPPER].map(
      (code) => [code.toString(16).toUpperCase().padStart(4, "0"), code] as const,
    ),
  )("looksLikePersonEs reads the Spanish letter U+%s as a letter of a name", (_hex, code) => {
    expect(looksLikePersonEs(`Ysm${cp(code)}ra Tolbrek`)).toBe(true);
  });

  it.each([
    ["c with a cedilla", 0xe7],
    ["o with a diaeresis", 0xf6],
    ["a with a tilde", 0xe3],
    ["e with a circumflex", 0xea],
    ["the sharp s", 0xdf],
    ["o with a stroke", 0xf8],
    ["s with a caron", 0x161],
    ["the dotless i", 0x131],
  ])(
    "looksLikePersonEs refuses %s, which the class of Spanish letters does not hold, and looksLikePerson keeps it",
    (_name, code) => {
      expect(looksLikePersonEs(`Ysm${cp(code)}ra Tolbrek`)).toBe(false);
      expect(looksLikePerson(`Ysm${cp(code)}ra Tolbrek`)).toBe(true);
    },
  );

  it("reads the sharp s as a letter in looksLikePerson, and not in looksLikePersonEs", () => {
    expect(looksLikePerson(`Ysmara Tolbre${cp(0xdf)}`)).toBe(true);
    expect(looksLikePersonEs(`Ysmara Tolbre${cp(0xdf)}`)).toBe(false);
    expect(euOrgEvidence(`Ysmara Tolbre${cp(0xdf)}`)).toBeNull();
  });

  it("lower-cases the Turkish dotted capital I to an i and a combining dot, as Python does, and not to a plain i", () => {
    expect(cp(0x130).toLowerCase()).toBe(`i${cp(0x307)}`);
    expect(hasLegalForm("Tolbrek INC")).toBe(true);
    expect(hasLegalForm(`Tolbrek ${cp(0x130)}NC`)).toBe(false);
    expect(hasLegalForm(`Tolbrek ${cp(0x131)}nc`)).toBe(false);
    expect(euOrgEvidence(`Tolbrek ${cp(0x130)}NC`)).toBeNull();
    expect(euOrgEvidence("Tolbrek INC")).toBe("legal_form");
  });

  it("keeps the Turkish i as a letter of a name in looksLikePerson, and refuses it in looksLikePersonEs", () => {
    expect(looksLikePerson(`Ysmara ${cp(0x130)}lkor`)).toBe(true);
    expect(looksLikePerson(`Ysmara ${cp(0x131)}lkor`)).toBe(true);
    expect(looksLikePersonEs(`Ysmara ${cp(0x130)}lkor`)).toBe(false);
    expect(looksLikePersonEs(`Ysmara ${cp(0x131)}lkor`)).toBe(false);
  });

  it("reads a name in composed form as letters, and the same name in decomposed form as letters and marks", () => {
    const composed = `Ysmar${cp(0xe1)} Tolbrek`;
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);
    expect(looksLikePerson(composed)).toBe(true);
    expect(looksLikePerson(decomposed)).toBe(false);
    expect(looksLikePersonEs(composed)).toBe(true);
    expect(looksLikePersonEs(decomposed)).toBe(false);
    const ntilde = `Ysmara Tolbre${cp(0xf1)}`;
    expect(looksLikePersonEs(ntilde)).toBe(true);
    expect(looksLikePersonEs(ntilde.normalize("NFD"))).toBe(false);
  });

  it("reads a word of the EU lists in composed form only: the profiler's words are composed", () => {
    const societe = `Soci${cp(0xe9)}t${cp(0xe9)}`;
    expect(euOrgEvidence(`Tolbrek ${societe}`)).toBe("legal_form");
    expect(euOrgEvidence(`Tolbrek ${societe.normalize("NFD")}`)).toBeNull();
    const federation = `F${cp(0xe9)}d${cp(0xe9)}ration`;
    expect(euOrgEvidence(`Tolbrek ${federation}`)).toBe("org_word");
    expect(euOrgEvidence(`Tolbrek ${federation.normalize("NFD")}`)).toBeNull();
  });

  it("matches the ASCII classes of rule M on ASCII letters alone: an accented name does not match", () => {
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test(`Ysmar${cp(0xe1)} F. Tolbrek`)).toBe(false);
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test(`Ysmara F. Tolbr${cp(0xe9)}k`)).toBe(false);
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test(`${cp(0xc9)}smara F. Tolbrek`)).toBe(false);
  });

  it("reads the capital letters of the acronym test from A to Z and from U+00C0 to U+00DE, as the profiler wrote it", () => {
    expect(euOrgEvidence(`Ysmara ${cp(0xc0, 0xc9)}`)).toBe("acronym");
    expect(euOrgEvidence(`Ysmara ${cp(0xde, 0xde)}`)).toBe("acronym");
    // the range holds the multiplication sign U+00D7, and stops before the sharp s U+00DF
    expect(euOrgEvidence(`Ysmara ${cp(0xd7, 0xd7)}`)).toBe("acronym");
    expect(euOrgEvidence(`Ysmara ${cp(0xdf, 0xdf)}`)).toBeNull();
    expect(euOrgEvidence(`Ysmara ${cp(0xe0, 0xe9)}`)).toBeNull();
    expect(euOrgEvidence(`Ysmara ${cp(0x391, 0x392)}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Empty input, odd input, and what JavaScript answers where Python's text differs
// ---------------------------------------------------------------------------------------------

const RULES: ReadonlyArray<readonly [string, (text: string) => unknown]> = [
  ["hasLegalForm", hasLegalForm],
  ["looksLikePerson", looksLikePerson],
  ["euOrgEvidence", euOrgEvidence],
  ["looksLikePersonEs", looksLikePersonEs],
  ["californiaPracticeRule", californiaPracticeRule],
  ["SPANISH_ORG_PATTERN", (text) => SPANISH_ORG_PATTERN.test(text)],
  ["CALIFORNIA_MIDDLE_INITIAL_NAME", (text) => CALIFORNIA_MIDDLE_INITIAL_NAME.test(text)],
];

describe("an empty name and a name of white space alone", () => {
  it.each([
    ["nothing", ""],
    ["a blank", " "],
    ["blanks", "      "],
    ["a tab and a line feed", "\t\n"],
    ["a no-break space", cp(0xa0)],
    ["an ideographic space", cp(0x3000)],
    ["an em space and a line separator", cp(0x2003, 0x2028)],
  ])("shows no person and no organisation in %s", (_name, text) => {
    expect(hasLegalForm(text)).toBe(false);
    expect(looksLikePerson(text)).toBe(false);
    expect(euOrgEvidence(text)).toBeNull();
    expect(looksLikePersonEs(text)).toBe(false);
    expect(californiaPracticeRule(text)).toBeNull();
    expect(SPANISH_ORG_PATTERN.test(text)).toBe(false);
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test(text)).toBe(false);
  });

  it("takes a value that is not a string for an empty name, and does not throw", () => {
    for (const value of [
      null,
      undefined,
      0,
      42,
      true,
      {},
      [],
      ["Ysmara Tolbrek"],
      Symbol("name"),
    ]) {
      const text = value as unknown as string;
      expect(hasLegalForm(text)).toBe(false);
      expect(looksLikePerson(text)).toBe(false);
      expect(euOrgEvidence(text)).toBeNull();
      expect(looksLikePersonEs(text)).toBe(false);
      expect(californiaPracticeRule(text)).toBeNull();
    }
  });
});

describe("a name with right-to-left marks, controls and other odd characters", () => {
  const ODD: ReadonlyArray<readonly [string, string]> = [
    ["a right-to-left override and its end", `${cp(0x202e)}Ysmara Tolbrek${cp(0x202c)}`],
    ["a right-to-left mark and a left-to-right mark", `Ysmara${cp(0x200f)} ${cp(0x200e)}Tolbrek`],
    ["the isolates", `${cp(0x2066, 0x2067, 0x2068)}Ysmara Tolbrek${cp(0x2069)}`],
    ["an Arabic letter mark", `${cp(0x627, 0x628)} ${cp(0x62a, 0x62b)}${cp(0x61c)}`],
    ["Hebrew names", `${cp(0x5d0, 0x5d1)} ${cp(0x5d2, 0x5d3)}`],
    ["the C0 controls", cp(0, 1, 2, 7, 8, 0x1b, 0x7f)],
    ["a name with a null", `Ysmara${cp(0)}Tolbrek`],
    ["the C1 controls and the next line", cp(0x80, 0x85, 0x9f)],
    ["a name with a next line", `Ysmara${cp(0x85)}Tolbrek`],
    ["an escape sequence", `${cp(0x1b)}[31mYsmara Tolbrek${cp(0x1b)}[0m`],
    ["a byte order mark", `${cp(0xfeff)}Ysmara Tolbrek`],
    ["a soft hyphen", `Ysm${cp(0xad)}ara Tolbrek`],
    ["a zero-width joiner", `Ysmara${cp(0x200d)}Tolbrek`],
    ["a lone high surrogate", `Ysmara${cp(0xd800)}Tolbrek`],
    ["a lone low surrogate", `${cp(0xdc00)}Ysmara Tolbrek`],
    ["a surrogate pair", `Ysmara ${cp(0x1f600)}`],
    ["emoji only", `${cp(0x1f600)} ${cp(0x1f601)}`],
    ["a variation selector", `Ysmara${cp(0xfe0f)} Tolbrek`],
    ["a tag character", `Ysmara ${cp(0xe0041)}Tolbrek`],
    ["a line feed inside", "Ysmara\nTolbrek\r\n"],
    ["a backslash and brackets", "Ysmara [\\ Tolbrek"],
    ["the syntax of a regular expression", "(?<!^$.*+?|[a-z]{2,6}\\p{L}"],
    ["a name that is a property of Object", "__proto__ constructor"],
    ["a name that is a property of Set", "size has"],
  ];

  it.each(ODD)("answers, and does not throw, for %s", (_name, text) => {
    for (const [rule, run] of RULES) {
      let answer: unknown;
      expect(() => {
        answer = run(text);
      }).not.toThrow();
      const kind = answer === null ? "null" : typeof answer;
      expect([rule, ["null", "boolean", "string"].includes(kind)]).toEqual([rule, true]);
    }
  });

  it("does not ignore a hidden character: a name that holds one is not read as letters (lineOf takes them out first)", () => {
    expect(looksLikePerson(`${cp(0x202e)}Ysmara Tolbrek${cp(0x202c)}`)).toBe(false);
    expect(looksLikePerson(`Ysmara${cp(0x200d)} Tolbrek`)).toBe(false);
    expect(hasLegalForm(`Tolbrek Inc${cp(0x200f)}`)).toBe(false);
    expect(looksLikePerson(`${cp(0x5d0, 0x5d1)} ${cp(0x5d2, 0x5d3)}`)).toBe(true);
  });

  it("does not take a property of Object or of Set for a word of a list: the lists are sets", () => {
    for (const word of ["constructor", "toString", "hasOwnProperty", "valueOf", "size", "has"]) {
      expect(hasLegalForm(`Tolbrek ${word}`)).toBe(false);
      expect(euOrgEvidence(`Tolbrek ${word}`)).toBeNull();
      expect(looksLikePerson(`Ysmara ${word}`)).toBe(true);
      expect(californiaPracticeRule(`Ysmara Tolbrek ${word}`)).toBeNull();
    }
    expect(hasLegalForm("Tolbrek __proto__")).toBe(false);
    expect(euOrgEvidence("Tolbrek __proto__")).toBeNull();
    expect(californiaPracticeRule("Ysmara Tolbrek __proto__")).toBeNull();
  });
});

describe("where JavaScript answers otherwise than Python's text does (pinned as the port answers)", () => {
  // What Python answers is by its documentation, not by a run: the kit does not run the profilers.
  // lineOf (kit/clean.ts) turns the controls into blanks and takes the byte order mark out before
  // a name gets to these rules, so the white space cases below do not reach them in the product;
  // the dotted and dotless i cases are the Turkish names that only /iu and re.I treat differently.

  it("takes U+0085 and U+001C for no white space (Python's \\s and strip() take them for white space)", () => {
    expect(hasLegalForm(`Tolbrek${cp(0x85)}Inc`)).toBe(false);
    expect(looksLikePerson(`Ysmara${cp(0x1c)}Tolbrek`)).toBe(false);
    expect(hasLegalForm(`Tolbrek Inc${cp(0x85)}`)).toBe(false);
  });

  it("takes U+FEFF for white space at the ends of a name (Python's strip() does not)", () => {
    expect(hasLegalForm(`${cp(0xfeff)}Inc`)).toBe(true);
    expect(looksLikePerson(`${cp(0xfeff)}Ysmara Tolbrek`)).toBe(true);
  });

  it("does not let $ match before a final line feed in rule M (Python's M.match does)", () => {
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test("Ysmara F Tolbrek")).toBe(true);
    expect(CALIFORNIA_MIDDLE_INITIAL_NAME.test("Ysmara F Tolbrek\n")).toBe(false);
  });

  it("does not fold the Turkish dotted capital I and the dotless small i to i with /iu (Python's re.I does)", () => {
    expect(SPANISH_ORG_PATTERN.test("Tolbrek INSTITUTO")).toBe(true);
    expect(SPANISH_ORG_PATTERN.test(`Tolbrek ${cp(0x130)}NST${cp(0x130)}TUTO`)).toBe(false);
    expect(SPANISH_ORG_PATTERN.test(`Tolbrek ${cp(0x131)}nst${cp(0x131)}tuto`)).toBe(false);
    expect(californiaPracticeRule("Law Offices of Ysmara Tolbrek")).toBe("law_office_of");
    expect(californiaPracticeRule(`Law Off${cp(0x130)}ces of Ysmara Tolbrek`)).toBeNull();
    expect(californiaPracticeRule(`Law Off${cp(0x131)}ces of Ysmara Tolbrek`)).toBeNull();
    // the letter after Dr. is [A-Za-z], a class that Python's re.I stretches to the dotted capital I
    expect(californiaPracticeRule("Dr. Ilkor Tolbrek")).toBe("dr_prefix");
    expect(californiaPracticeRule(`Dr. ${cp(0x130)}lkor Tolbrek`)).toBeNull();
  });

  it("folds the long s to s as /iu does, which is what Python's re.I does too", () => {
    expect(SPANISH_ORG_PATTERN.test(`Tolbrek SERVICIO${cp(0x17f)}`)).toBe(true);
    expect(SPANISH_ORG_PATTERN.test(`Tolbrek ${cp(0x17f)}ERVICIOS`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Hostile input
// ---------------------------------------------------------------------------------------------

/** About 200 KB of `unit`, repeated. */
const BIG = 200_000;
const filled = (unit: string): string => unit.repeat(Math.ceil(BIG / unit.length));
/** The time that one answer may take, far above what a linear rule needs, far below a quadratic one. */
const LIMIT_MS = 10_000;

describe("hostile input: every rule answers in linear time on 200 KB of what a feed could hold", () => {
  const HOSTILE: ReadonlyArray<readonly [string, () => string]> = [
    ["a run of stripped characters inside a word", () => "a" + ".".repeat(BIG) + "x"],
    [
      "a run of stripped characters at both ends of a word",
      () => ".".repeat(BIG / 2) + "x" + ".".repeat(BIG / 2),
    ],
    ["a run of parentheses inside a word", () => "a" + "(".repeat(BIG) + "x"],
    ["a run of apostrophes inside a word", () => "a" + "'".repeat(BIG) + "x"],
    ["a run of curly quotation marks inside a word", () => "a" + cp(0x201c).repeat(BIG) + "x"],
    ["only characters that are stripped", () => filled(".,;:()")],
    ["commas alone", () => ",".repeat(BIG)],
    ["semicolons alone", () => ";".repeat(BIG)],
    ["slashes alone", () => "/".repeat(BIG)],
    ["hyphens alone", () => "-".repeat(BIG)],
    ["blanks alone", () => " ".repeat(BIG)],
    ["tabs and line feeds", () => filled("\t\n")],
    ["no-break spaces", () => cp(0xa0).repeat(BIG)],
    ["a long run of blanks between two letters", () => "a" + " ".repeat(BIG) + "b"],
    ["a long run of commas between two letters", () => "a" + ",".repeat(BIG) + "b"],
    ["a long run of blanks and commas between two letters", () => "a" + filled(" ,") + "b"],
    ["very many one-letter words", () => filled("a ")],
    ["very many words with commas", () => filled("a,")],
    ["very many initials", () => filled("A. ")],
    ["very many names", () => filled("Ysmara Tolbrek, ")],
    ["one very long word", () => "a".repeat(BIG)],
    ["one very long word of capitals", () => "A".repeat(BIG)],
    ["a very long word that ends in a digit", () => "a".repeat(BIG) + "1"],
    ["a very long word of accented letters", () => cp(0xe9).repeat(BIG)],
    ["letters beyond U+FFFF", () => cp(0x1d49c).repeat(BIG / 2)],
    ["a letter with very many combining marks", () => "e" + cp(0x301).repeat(BIG)],
    ["lone surrogates", () => cp(0xd800).repeat(BIG)],
    ["a word of the Spanish alternation, dotted, again and again", () => filled("S.A.S")],
    ["a word of the Spanish alternation, spaced, again and again", () => filled("S A ")],
    ["one letter of the Spanish alternation", () => "S".repeat(BIG)],
    ["fragments with dots and blanks", () => filled("E.P.S ")],
    ["a word of the alternation cut short, again and again", () => filled("CORPORACI")],
    ["a word of the alternation with a letter after it, again and again", () => filled("CLUBX")],
    ["Dr and a long run of blanks", () => "Dr" + " ".repeat(BIG)],
    ["Dr., a long run of blanks and a digit", () => "Dr." + " ".repeat(BIG) + "1"],
    [
      "law and office with long runs of blanks",
      () => "law" + " ".repeat(BIG / 2) + "office" + " ".repeat(BIG / 2),
    ],
    [
      "Law Offices of, a long run of blanks and a mark",
      () => "law offices of" + " ".repeat(BIG) + "!",
    ],
    ["rule M with a very long first word", () => "A" + "a".repeat(BIG)],
    ["rule M with a long run of blanks after the first word", () => "Aa" + " ".repeat(BIG) + "B"],
    ["rule M with a long run of blanks after the initial", () => "Aa B" + " ".repeat(BIG) + "x"],
    ["rule M with a very long last word and a digit", () => "Aa B C" + "c".repeat(BIG) + "1"],
    ["rule M with a very long suffix", () => "Aa B Cc, " + "d".repeat(BIG)],
    ["rule M, the same shape again and again", () => filled("Aa B Cc ")],
  ];

  it.each(HOSTILE)("%s", (_label, build) => {
    const text = build();
    expect(text.length).toBeGreaterThanOrEqual(BIG);
    const slow: string[] = [];
    for (const [rule, run] of RULES) {
      const started = Date.now();
      const answer = run(text);
      const took = Date.now() - started;
      if (took >= LIMIT_MS) slow.push(`${rule}: ${took} ms`);
      expect(answer === null || ["boolean", "string"].includes(typeof answer)).toBe(true);
    }
    expect(slow).toEqual([]);
  });
});

describe("a name of 100 KB: the answer is right and comes at once", () => {
  const LIMIT_100_KB_MS = 10_000;

  it.each<[string, () => unknown, unknown]>([
    [
      "hasLegalForm, a legal form after 50,000 words",
      () => hasLegalForm("Tolbrek " + "x ".repeat(50_000) + "Inc"),
      true,
    ],
    ["hasLegalForm, one word", () => hasLegalForm("a".repeat(100_000)), false],
    ["looksLikePerson, 15,000 names", () => looksLikePerson("Ysmara ".repeat(15_000)), false],
    ["looksLikePerson, one word", () => looksLikePerson("a".repeat(100_000)), false],
    [
      "euOrgEvidence, an organisation word after 15,000 names",
      () => euOrgEvidence("Ysmara ".repeat(15_000) + "Bank"),
      "org_word",
    ],
    ["euOrgEvidence, one word", () => euOrgEvidence("a".repeat(100_000)), null],
    [
      "euOrgEvidence, a digit at the end",
      () => euOrgEvidence("a".repeat(100_000) + "1"),
      "digit_or_symbol",
    ],
    ["looksLikePersonEs, 15,000 names", () => looksLikePersonEs("Ysmara ".repeat(15_000)), false],
    ["looksLikePersonEs, one word", () => looksLikePersonEs("a".repeat(100_000)), false],
    [
      "californiaPracticeRule, a credential after 15,000 names",
      () => californiaPracticeRule("Ysmara ".repeat(15_000) + "DDS"),
      "credential_suffix_nocomma",
    ],
    [
      "californiaPracticeRule, a credential after a comma and one word",
      () => californiaPracticeRule("a".repeat(100_000) + ", CPA"),
      "credential_suffix",
    ],
    [
      "SPANISH_ORG_PATTERN, an organisation word after 15,000 names",
      () => SPANISH_ORG_PATTERN.test("Ysmara ".repeat(15_000) + "SERVICIOS"),
      true,
    ],
    [
      "SPANISH_ORG_PATTERN, no organisation word",
      () => SPANISH_ORG_PATTERN.test("Ysmara ".repeat(15_000)),
      false,
    ],
    [
      "CALIFORNIA_MIDDLE_INITIAL_NAME, a last name of 100,000 letters",
      () => CALIFORNIA_MIDDLE_INITIAL_NAME.test("Ysmara F. T" + "o".repeat(100_000)),
      true,
    ],
  ])("%s", (_name, run, expected) => {
    const started = Date.now();
    const answer = run();
    expect(Date.now() - started).toBeLessThan(LIMIT_100_KB_MS);
    expect(answer).toBe(expected);
  });
});
