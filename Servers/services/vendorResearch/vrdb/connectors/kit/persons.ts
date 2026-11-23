/**
 * The person rules of the list kit: the tests that tell a natural person's name from an
 * organisation's. The connectors of the lists that name parties (the FTC penalties, the EU
 * competition cases, the Colombian SIC sanctions, the California breach notices) drop a row whose
 * party is a person before anything is stored, and these are the rules that decide it.
 *
 * Each rule is the one that a profiler measured on its own list, ported as it is, with its own word
 * lists copied verbatim. The lists are NOT merged: a merged list would change the precision and the
 * recall that were measured. Two person rules stay inside their connectors, because only one list
 * needs each: the person shape of the OFSI notices and the honorifics of the CMA cases.
 *
 * A name is expected as `lineOf` (kit/clean.ts) gives it: one clean line, composed (NFKC), with no
 * hidden character. The rules do not normalise, as the profilers' rules did not: a name in
 * decomposed form (a letter and a combining mark) is not read as letters. No rule throws, whatever
 * the text holds; a value that is not a string is an empty name.
 *
 * Porting notes (Python to JavaScript):
 * - `str.isalpha()` is `/^\p{L}+$/u`, and `str.isdigit()` on a character is `/\p{Nd}/u`. The
 *   digits that `isdigit` takes and `\p{Nd}` does not (the superscripts, the circled digits) are no
 *   letters either, and every rule refuses a name for a character that is not a letter, so no
 *   result depends on the difference.
 * - `re.split(r"\s+")` is `.split(/\s+/u)`, `str.strip()` is `.trim()`, and `str.lower()` is
 *   `.toLowerCase()` (the full case mapping, in no locale: the Turkish dotted capital I becomes an
 *   i and a combining dot, as in Python).
 * - `str.replace(".", "")` takes out EVERY dot; the string form of `replace` in JavaScript takes
 *   out the first only, so the dots are taken out by `split(".").join("")`.
 * - `str.strip(chars)` is a scan from both ends (`stripChars`), not the regular expression
 *   `^[chars]+|[chars]+$` that a one-line port would be: on a word with a long run of those
 *   characters inside it that expression takes time in the square of the length (measured: 3.9 s
 *   for 80,000 characters). The scan takes the same characters in one pass.
 * - Python's `$` also matches before a final line feed, and its `\s` and `strip()` take the
 *   controls U+001C to U+001F and U+0085 for white space where JavaScript's do not (and
 *   JavaScript's take U+FEFF); `lineOf` has made all of them blanks or taken them out before a name
 *   gets here. Python's `re.I` also folds the Turkish dotted capital I and the dotless small i to
 *   i, which `/iu` does not.
 */

/** Why a name is taken for an organisation's (eu_person_rule.py `org_evidence`). */
export type OrgEvidence = "digit_or_symbol" | "legal_form" | "org_word" | "acronym";

/** Why a name is taken for a person-named practice (ca_person_rule.py `practice_rule`). */
export type PracticeReason =
  "dr_prefix" | "law_office_of" | "credential_suffix" | "credential_suffix_nocomma";

/** The words of a list, written as lines of words that are one blank apart. */
function wordSet(...lines: string[]): ReadonlySet<string> {
  return new Set(lines.join(" ").split(" "));
}

/** A name as the rules read it: `str.strip()`; a value that is not a string is an empty name. */
function trimmed(name: string): string {
  return typeof name === "string" ? name.trim() : "";
}

/** `str.strip(chars)`: the characters of `chars` taken off both ends of `text`, in one pass. */
function stripChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start += 1;
  while (end > start && chars.includes(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/** `str.replace(".", "")` of Python: every dot out. */
function withoutDots(text: string): string {
  return text.split(".").join("");
}

/** `any(ch.isdigit() ...)`: a decimal digit of any script. */
const DIGIT = /\p{Nd}/u;

/** `all(ch.isalpha() ...)` on a text that is not empty. */
const LETTERS = /^\p{L}+$/u;

/** p2_common.py `looks_like_person` and `has_legal_form`: what `strip` takes off a word. */
const GENERIC_STRIP = ".,;()";

/**
 * eu_person_rule.py `tokens`: what `strip` takes off a word (U+2019 is the typographic apostrophe).
 */
const EU_STRIP = ".,;:()'’";

/**
 * ca_person_rule.py `toks`: what `strip` takes off a word (U+2019 is the typographic apostrophe,
 * U+201C and U+201D the curly double quotation marks).
 */
const CALIFORNIA_STRIP = `.,;:()'’"“”`;

/** p2_common.py LEGAL_FORM_TOKENS, verbatim. */
export const GENERIC_LEGAL_FORMS: ReadonlySet<string> = wordSet(
  // English / international
  "inc incorporated llc l.l.c llp lp ltd limited plc corp corporation co company pllc pc",
  "p.c lc llp lllp na n.a holdings holding group trust partners partnership",
  // German / Dutch / Nordic
  "gmbh ag kg ohg ug se bv b.v nv n.v sarl s.a.r.l a/s as ab oy oyj aps",
  // Romance
  "sa s.a sas s.a.s spa s.p.a srl s.r.l sl s.l slu ltda ltda. eirl e.i.r.l sau cia cía y",
  "e.u eu s.c.a sca sc scs sce ese e.s.e eps e.p.s ips i.p.s",
  // Other
  "bhd sdn pte pty kk k.k oü ou zoo z.o.o sp jsc ooo pjsc ojsc cjsc",
);

/** p2_common.py ORG_WORDS, verbatim. */
export const GENERIC_ORG_WORDS: ReadonlySet<string> = wordSet(
  "bank banco university universidad college hospital clinic clínica clinica foundation",
  "fundación fundacion association asociación asociacion institute instituto ministry",
  "ministerio department agency authority council committee commission services servicios",
  "systems sistemas solutions technologies technology tecnologia tecnología industries",
  "industrias international internacional enterprises enterprise network networks media",
  "communications comunicaciones telecom energy energia energía oil gas petroleum mining",
  "minera construction construcciones constructora logistics transport transportes",
  "airlines airways shipping marine capital financial finance financiera insurance",
  "seguros assurance pharma pharmaceutical pharmaceuticals laboratorios laboratories labs",
  "foods alimentos restaurant restaurante hotel hoteles store stores market supermercados",
  "shop center centre centro club league federation federación union unión cooperative",
  "cooperativa coop corporación corporacion empresa empresas compañía compañia sociedad",
  "comercializadora distribuidora inversiones importadora exportadora operadora agencia",
  "colegio universidad escuela school academy church ministries lines line motors auto",
  "autos software digital data cloud online web labs studio studios games entertainment",
  "partners capital ventures consulting consultants advisors associates realty properties",
  "development developers homes builders supply products brands wireless mobile",
  "communications of the and for de del la las los el en para por & dba d/b/a a/k/a aka",
);

/** The dotless forms of GENERIC_LEGAL_FORMS: `{t.replace(".", "") for t in LEGAL_FORM_TOKENS}`. */
const GENERIC_LEGAL_FORMS_WITHOUT_DOTS: ReadonlySet<string> = new Set(
  [...GENERIC_LEGAL_FORMS].map(withoutDots),
);

/**
 * p2_common.py `has_legal_form` (ftc_penalties): a word after the first is a legal form of the
 * list, or the last word is one once its dots are out. The first word counts only when it is the
 * only one.
 */
export function hasLegalForm(name: string): boolean {
  const words = trimmed(name)
    .split(/\s+/u)
    .map((word) => stripChars(word, GENERIC_STRIP).toLowerCase())
    .filter((word) => word !== "");
  if (words.length === 0) return false;
  for (let index = 1; index < words.length; index += 1) {
    if (GENERIC_LEGAL_FORMS.has(words[index])) return true;
  }
  return GENERIC_LEGAL_FORMS_WITHOUT_DOTS.has(withoutDots(words[words.length - 1]));
}

/** The characters that p2_common.py `looks_like_person` lets a word hold besides letters. */
const NAME_PUNCTUATION = /[.'’-]/gu;

/**
 * p2_common.py `looks_like_person` (ftc_penalties): a natural person's name written "First [Middle]
 * Last" or "LAST, FIRST": two to four words, all letters (with apostrophes, hyphens and periods),
 * none an organisation word or a legal form, no digit, no "&", "/" or "@".
 */
export function looksLikePerson(name: string): boolean {
  const n = trimmed(name);
  if (n === "" || DIGIT.test(n) || n.includes("&") || n.includes("/") || n.includes("@")) {
    return false;
  }
  const words = n.split(/[\s,;]+/u).filter((word) => word !== "");
  if (words.length < 2 || words.length > 4) return false;
  for (const word of words) {
    const low = stripChars(word, GENERIC_STRIP).toLowerCase();
    if (GENERIC_ORG_WORDS.has(low) || GENERIC_LEGAL_FORMS.has(low)) return false;
  }
  for (const word of words) {
    const core = word.replace(NAME_PUNCTUATION, "");
    if (core === "" || !LETTERS.test(core)) return false;
  }
  return true;
}

/** eu_person_rule.py LEGAL, verbatim. */
export const EU_LEGAL_FORMS: ReadonlySet<string> = wordSet(
  "inc incorporated llc llp lp ltd limited plc corp corporation co company gmbh ag kg ohg",
  "ug se bv nv sarl sa sas spa srl sl slu sau sasu ab as asa oy oyj aps kft zrt nyrt sro",
  "spol zoo doo dd ad eg ev eeig gie aie aeie sicav sif kgaa cv vof eurl scs sca sce snc",
  "ky pte pty kk ooo pjsc jsc bhd sdn nyrt epe ape ae saic ltda cia kommanditgesellschaft",
  "aktiengesellschaft aktiebolaget societe société anonyme gesellschaft gesellschaften",
  "mbh gesmbh aktieselskab",
);

/** eu_person_rule.py WORDS, verbatim. */
export const EU_ORG_WORDS: ReadonlySet<string> = wordSet(
  "group groupe gruppe grupo gruppo holding holdings bank banque banco banca bancaire",
  "bancaria airlines airways air lines line shipping maritime marine navigation",
  "navigazione navegacao naviera reederei linien transport transportes telecom telekom",
  "telecommunications telekommunikation telecomunicazioni communications communication",
  "kommunikation post posten postal poste electric electrical elektro energie energy",
  "energia energi oil petroleum chemical chemicals chemie pharma pharmaceutical steel",
  "stahl aluminium metal paper sugar glass cement music records publishing verlag media",
  "television television tv film sport sports football club association associazione",
  "federation fédération federazione verband verein vereniging bund union unie consortium",
  "consorzio cooperative coop genossenschaft stichting fondation foundation institute",
  "institut ministry authority board council commission assurance versicherung insurance",
  "finance financial capital invest investment industries industrie industrial industrias",
  "technologies technology tech systems solutions services service international",
  "internationale europe european europa deutschland france uk nederland belgium spain",
  "italia hellenic royal koninklijke national nazionale nationale societe société",
  "sociedade sociedad compagnie compagnia compania company kassen brasserie brewery",
  "brauerei motors automobiles auto cars trucks rail railways bahn dzelzcels dráhy port",
  "airport havn hamn haven recycling verpackung verpackungsverwertung organisation",
  "organization organisme bureau society gesellschaft stiftung fonds fund trust partners",
  "software systems networks network online digital labs laboratoires laboratories",
  "pharmaceuticals water eaux environnement environment restaurants hotels hotel stores",
  "shops retail supermarkets agency agence agentur management consulting engineering",
  "construction bau",
);

/** An abbreviation of a company: two to six capitals (U+00C0 to U+00DE as well as A to Z). */
const ACRONYM = /^[A-ZÀ-Þ]{2,6}$/u;

/**
 * eu_person_rule.py `org_evidence` (eu_dg_comp): the evidence that a name is an organisation's, in
 * the order the profiler tests it: a digit, "&", "@" or "/" (ASCII digits only), a legal form, an
 * organisation word, an acronym. `null` when the name shows none.
 */
export function euOrgEvidence(name: string): OrgEvidence | null {
  const n = trimmed(name);
  if (n === "") return null;
  if (/[0-9&@/]/u.test(n)) return "digit_or_symbol";
  const words: string[] = [];
  for (const piece of n.split(/[\s/,]+/u)) {
    const word = stripChars(piece, EU_STRIP);
    if (word !== "") words.push(word.toLowerCase());
  }
  if (words.some((word) => EU_LEGAL_FORMS.has(withoutDots(word)))) return "legal_form";
  if (words.some((word) => EU_ORG_WORDS.has(word))) return "org_word";
  if (n.split(/[\s,]+/u).some((piece) => ACRONYM.test(piece))) return "acronym";
  return null;
}

/**
 * co_person_rule.py ORG_WORDS_ES, verbatim: one raw string for each line of the profiler's file,
 * each ending in a bar, so that the lines join into one alternation.
 */
const SPANISH_ORG_WORDS =
  String.raw`S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|LTDA\.?|LIMITADA|S\.?\s?EN\s?C\.?|E\.?\s?U\.?|E\.?\s?S\.?\s?P\.?|S\.?\s?C\.?\s?A\.?|CIA|COOPERATIVA|CORPORACI[OÓ]N|FUNDACI[OÓ]N|` +
  String.raw`ASOCIACI[OÓ]N|UNIVERSIDAD|INSTITUCI[OÓ]N|INSTITUTO|E\.?P\.?S\.?|I\.?P\.?S\.?|CLINICA|CL[IÍ]NICA|HOSPITAL|BANCO|COMPA[NÑ][IÍ]A|EMPRESA|SOCIEDAD|COLEGIO|CENTRO|GRUPO|` +
  String.raw`FINANCIERA|SERVICIOS|INVERSIONES|COMERCIALIZADORA|DISTRIBUIDORA|CONSTRUCTORA|TRANSPORTES?|ASOCIADOS|HOLDING|INC|LLC|CORP|S\.?\s?R\.?\s?L|SUCURSAL|LIQUIDACI[OÓ]N|SIGLA|` +
  String.raw`HOTEL|HOTELES|RESTAURANTE|SUPERMERCADO|ALMAC[EÉ]N|ALMACENES|DROGUER[IÍ]A|TIENDA|COMERCIAL|AGENCIA|VIAJES|TOURS?|TURISMO|CLUB|PARQUEADERO|LAVADERO|FERRETER[IÍ]A|` +
  String.raw`PANADER[IÍ]A|DISCOTECA|GIMNASIO|TALLER|LIBRER[IÍ]A|PAPELER[IÍ]A|HERMANOS|HNOS|EDITORIAL|INDUSTRIAS?|COLOMBIA|NACIONAL|INTERNACIONAL|LABORATORIO|CONSTRUCCIONES|INGENIER[IÍ]A|` +
  String.raw`MOTORS|AUTOS|AUTOMOTORES|CARROCERIAS|SUPERMAYORISTA|SOLUCIONES|TECNOLOG[IÍ]A|SISTEMAS|NEGOCIOS|PROPIEDAD|HORIZONTAL|CONJUNTO|EDIFICIO|PH|ASESORES|CONSULTORES`;

/** The letters of co_person_rule.py ORG_RE's lookarounds: a word is a word between them. */
const SPANISH_LETTER = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";

/**
 * co_person_rule.py ORG_WORDS_ES as one pattern, flags "iu", with the letter lookarounds: a word of
 * the list counts only between two non-letters, so that CIA is not found inside a longer word.
 */
export const SPANISH_ORG_PATTERN: RegExp = new RegExp(
  `(?<![${SPANISH_LETTER}])(?:${SPANISH_ORG_WORDS})(?![${SPANISH_LETTER}])`,
  "iu",
);

/** co_person_rule.py STOP: the particles between the names of a Spanish person. */
const SPANISH_STOP_WORDS: ReadonlySet<string> = wordSet("de del la las los y e el");

/** What co_person_rule.py lets a word be, once it is lower case: letters of Spanish, ' - and . */
const SPANISH_WORD = /^[a-záéíóúüñ'\-.]+$/u;

/** U+2013. */
const EN_DASH = "–";

/**
 * co_person_rule.py `looks_person_es` (co_sic_penalties): a Spanish natural person's name. No
 * organisation word, digit, "&" or "/"; two to six words, at least two of them not particles; every
 * word of Spanish letters. A hyphen refuses a name only when it has fewer than two words: Python
 * binds `and` before `or`, so the fourth test is one clause,
 * `("-" in n.replace("–", "-") and len(n.split()) < 2)`. (That clause never changes a result, for a
 * name of one word fails the count of words anyway; it is kept as the profiler wrote it.)
 */
export function looksLikePersonEs(name: string): boolean {
  const n = trimmed(name);
  if (
    n === "" ||
    SPANISH_ORG_PATTERN.test(n) ||
    DIGIT.test(n) ||
    n.includes("&") ||
    n.includes("/")
  ) {
    return false;
  }
  const words = n.split(/\s+/u).filter((word) => word !== "");
  if ((n.includes("-") || n.includes(EN_DASH)) && words.length < 2) return false;
  if (words.length < 2 || words.length > 6) return false;
  const low = words.map((word) => stripChars(word, ".,").toLowerCase());
  if (low.filter((word) => !SPANISH_STOP_WORDS.has(word)).length < 2) return false;
  return low.every((word) => SPANISH_WORD.test(word));
}

/** ca_person_rule.py CREDENTIAL, verbatim. */
export const CALIFORNIA_CREDENTIALS: ReadonlySet<string> = wordSet(
  "cpa md dds dmd dvm dc od dpm phd psyd esq do np rn lcsw mft lmft cfp pt dpt ot aud",
  "pa-c mba jd lmhc lpc cfa ea",
);

/** ca_person_rule.py `practice_rule`, the Dr. test: Dr or Doctor, a dot or not, blanks, a letter */
const DR_PREFIX = /^(?:dr|doctor)\.?\s+[A-Za-z]/iu;

/**
 * ca_person_rule.py `practice_rule`, the office test: Law Office(s) of, Law Firm of, Office(s) of.
 */
const LAW_OFFICE_PREFIX = /^(?:law\s+offices?\s+of|law\s+firm\s+of|office\s+of|offices\s+of)\s+/iu;

/** ca_person_rule.py `toks`: how many words a name has, once the punctuation round them is off. */
function californiaWordCount(name: string): number {
  let count = 0;
  for (const piece of name.split(/[\s/,]+/u)) {
    if (stripChars(piece, CALIFORNIA_STRIP) !== "") count += 1;
  }
  return count;
}

/**
 * ca_person_rule.py `practice_rule`, rule P (california_breaches): a person-named practice or firm.
 * A leading Dr., a leading Law Office(s) of / Law Firm of / Office(s) of, a credential after the
 * last comma, or a credential as the last word of a name of three words or more. The reason, or
 * `null`.
 */
export function californiaPracticeRule(name: string): PracticeReason | null {
  const n = trimmed(name);
  if (DR_PREFIX.test(n)) return "dr_prefix";
  if (LAW_OFFICE_PREFIX.test(n)) return "law_office_of";
  const parts = n.split(/,+/u);
  if (parts.length >= 2) {
    const tail = withoutDots(stripChars(parts[parts.length - 1].trim(), ".").toLowerCase());
    if (CALIFORNIA_CREDENTIALS.has(tail)) return "credential_suffix";
  }
  const words = n.split(/\s+/u);
  const last = withoutDots(stripChars(words[words.length - 1], ".,")).toLowerCase();
  if (CALIFORNIA_CREDENTIALS.has(last) && californiaWordCount(n) >= 3) {
    return "credential_suffix_nocomma";
  }
  return null;
}

/**
 * an_california_breaches3.py M, rule M (california_breaches): "First M. Last", with an optional Dr.
 * before it and one short suffix after it (U+2019 is the typographic apostrophe).
 */
export const CALIFORNIA_MIDDLE_INITIAL_NAME: RegExp =
  /^(?:Dr\.?\s+)?[A-Z][A-Za-z'’\-]+\s+[A-Z]\.?\s+[A-Z][A-Za-z'’\-]+(?:,?\s+[A-Za-z.]{2,6})?$/u;
