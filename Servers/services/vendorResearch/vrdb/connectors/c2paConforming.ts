/**
 * The C2PA Conforming Products List (github.com/c2pa-org/conformance-public) as a mirrored list of
 * the vendor risk database: the conformance program's own canonical file, one JSON array of the
 * products that the Coalition for Content Provenance and Authenticity accepted as conformant. It is
 * licensed (CC BY 4.0), has no paging, query or limit (it parses only when whole), and holds no
 * personal-data field. A record is one APPLICANT, a state and
 * context only: it can support or contradict a vendor's claim of C2PA conformance, and it raises
 * no risk. The list is positive only: absence from it is no finding.
 *
 * The id of a record is the compact name of the applicant (as nhtsa.ts: `Acme Inc` and `Acme Inc `
 * are one, `Acme` and `Acme LLC` are two). Its keys are names only: the applicant as written
 * and without its legal form (record.ts does both), and, when it is another name, the
 * organisation of the product's certificate (`product.DN.O`, a second legal-entity name in a few
 * products). There is NO domain key: `product.infoURL` is a third-party address the applicant
 * wrote about itself, a strong match on it would drop the lookup note, and the cell is never read,
 * stored or fetched.
 *
 * A natural person is never a key. kit/persons.ts has no rule for this list; its own rule
 * (rule A) is applied here: a product whose applicant holds, in any
 * case, `sole propriet` (proprietor, proprietorship), `sole trader`, `einzelunternehm`
 * (Einzelunternehmen, Einzelunternehmer), `einzelkaufmann` or `einzelkauffrau`, `freelanc`
 * (freelance, freelancer), `self employed`, with nothing, or up to three blanks and dashes of any
 * kind in any mix, between the two words of sole proprietor, sole trader, self employed and free
 * lance, or holds as a word of its own (no letter and no digit touching it, and a full stop after
 * it only where it is written): `e.K`, `e. K`, `e.Kfm` or `e.Kfr` (the final full stop is
 * optional), `e.U.` or `e. U.` (the full stop is not), `Einzelfirma`, `eenmanszaak`, `entreprise
 * individuelle`, `EIRL`, `auto-entrepreneur`, `micro-entrepreneur`, `empresario individual`,
 * `autonomo` (with or without its acute accent), `ditta individuale`, `enskild firma` or
 * `enkeltpersonforetak` (those of two words with the separators above), or holds `Sole Prop.` or
 * `Inh.` (Inhaber; they end in a full stop), is the business of a person, and it is dropped as soon
 * as its applicant is read, whatever else is wrong with it (its id included): it counts nowhere,
 * not even as unreadable. `EI`, of two letters, is no term. The same terms keep an organisation
 * name out of the keys (the product stays: it is the applicant's). The residual (a sole trader that
 * does not say so, or says it in a form that is not listed, such as four separators between the
 * words, or a minus sign for a dash) is accepted: a sole trader who applied for
 * conformance is the vendor. A company whose name holds one of these words is dropped too: fail
 * closed, recall for privacy.
 *
 * A person who trades under a business name (as the California breaches list does). An
 * applicant `<name>, dba <business>` (also `d/b/a`, `doing business as`, `t/a` and `trading as`, in
 * any case, after a blank or a comma and before a blank or the end of the name) is the BUSINESS
 * when the part before the first mark holds a letter or a digit and holds no legal form and no
 * organisation word of the kit's lists (the words that join the parts of a name, `and`, `of`, `&`
 * and the particles of Spanish, are no organisation words: a person's name holds them). The part
 * before the mark is then cut out of EVERYTHING (the id, the keys, the names, the title, the text,
 * the identifiers and the body rows), and what follows is read in the same way, so that a chain of
 * marks leaves the last business that no organisation precedes. A mark with nothing that can be
 * read after it leaves a person's business, which is dropped like the others. A part before the
 * mark that holds a legal form or an organisation word (`Zorb Inc., dba Zorb Studio`) is a business
 * already, and the name is read as it is. Rule A is asked of the whole cell first, so a term of a
 * person anywhere in it drops the product before any mark cuts anything; the organisation of the
 * certificate (`DN.O`) is cut in the same way. Residual, as before: the other spellings of a mark
 * (`dba:`, `dba.`, `d.b.a.`, a mark inside brackets) cut nothing, and a person who names no
 * business and uses no term is a key like any other name.
 *
 * What a record holds, by applicant: the conformant products (those whose status is exactly
 * `conformant`; any other status is only counted), how many are generators and validators, the
 * newest conformance day, the names of the newest conformant products (at most 20, distinct, five
 * shown) and their ids (at most 20, in the identifiers), and how many listed products have another
 * status. Every sort has a full tie-break (the day, then the greater id; the spelling count, then
 * the order of the characters), so the order of the file decides nothing.
 *
 * What is never read or kept: `product.infoURL`, `containers`, `liveVideo`, `product.assurance`,
 * `product.disallowedSignals`, `supportsCompressedManifests`, `specVersion`, `minVersion`,
 * `conformanceProgramVersion`, `product.DN.OU`, `product.DN.C`, and the dates `creation` and
 * `earliestPublicDisclosure`. Nested keys are read defensively: a product with no `product`, `DN`
 * or `dates` is read for what it has.
 *
 * Readability. A product is unreadable when it is no object, its `recordId` is no UUID or occurs
 * twice (both are left out: the file's order must never decide which survives), its applicant is
 * empty, has no letter or digit, or is longer than 100 characters (a cut name would key two names
 * alike: no applicant is longer, the longest of the real file is 61), its `status` is no text, or
 * its `dates.conformance` is no day that exists. The last change (`dates.lastModification`) is a
 * day or none, and never makes a product unreadable. The unreadable ones are counted and left to
 * the kit's allowance. Not the list (null): a root that is no array, fewer than 150 conformant
 * products or fewer than 100 applicants that have one (today 322 and 199), which a bad publish
 * would break. More than 10,000 products is a file too large to read whole (`complete` is false
 * and the download fails as too large, never as a shorter list): no cap is given, and this
 * is thirty times the list today.
 */
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import { SHORTENED, compareText, dayText, isObject, lineOf } from "./kit/clean";
import {
  type Fetched,
  type ListSpec,
  type ReadResult,
  createFileConnector,
} from "./kit/fileConnector";
import { readJsonArray } from "./kit/json";
import { GENERIC_LEGAL_FORMS, GENERIC_ORG_WORDS } from "./kit/persons";
import { RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const C2PA_CONFORMING_RECORD_MARK = "C2PA Conforming Products List";

const FILE_URL =
  "https://raw.githubusercontent.com/c2pa-org/conformance-public/main/conforming-products/conforming-products-list.json";
/** The page of the list, which the address of every record is: the list is one file, so a record has no page of its own. */
const PAGE_URL =
  "https://github.com/c2pa-org/conformance-public/blob/main/conforming-products/conforming-products-list.json?applicant=";
/** The list is 429 KB today: the limit is twenty times that. */
const MAX_BYTES = 8_388_608;
const TIMEOUT_MS = 60_000;
/** More products than this is not read: the list has 322. */
const MAX_PRODUCTS = 10_000;
/** Fewer conformant products than this, or applicants that have one, is not the list. */
const MIN_CONFORMANT = 150;
const MIN_APPLICANTS = 100;

const APPLICANT_CHARS = 100;
const ORGANISATION_CHARS = 100;
const PRODUCT_NAME_CHARS = 60;
const STATUS_CHARS = 40;
/** What the title and the text of a record show of the applicant. */
const DISPLAY_CHARS = 80;
/** The shortest compact name that is a key (keys.ts: a shorter one matches no list). */
const MIN_KEY_CHARS = 4;
const SPELLINGS_MAX = 3;
const ORGANISATIONS_MAX = 2;
const PRODUCT_NAMES_MAX = 20;
const RECORD_IDS_MAX = 20;
const PRODUCT_NAMES_SHOWN = 5;

const CONFORMANT = "conformant";
const GENERATOR = "generatorProduct";
const VALIDATOR = "validatorProduct";
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What a cut line ends with (kit/clean.ts): a name that carries it was cut and is no name. */
const CUT_MARK = SHORTENED.trimStart();

/** Up to three separator characters, each a blank or a dash of any kind (the Pd category), in any mix, or none. */
const SEPARATOR = String.raw`[\s\p{Pd}]{0,3}`;
/** Where a word of its own begins: at the start of the name, or after a character that is neither a letter nor a digit. */
const WORD_START = String.raw`(?:^|[^\p{L}\p{N}])`;
/** Where it ends: at the end of the name, or before a character that is neither a letter nor a digit. */
const WORD_END = String.raw`(?![\p{L}\p{N}])`;

/**
 * Rule A: the words that make an applicant the business
 * of a person, tested in any case on the cleaned name, one alternative for each kind. The first
 * six are parts of words (a stem, so that the proprietor, the proprietorship, the Einzelunternehmer
 * and the freelancer are all caught). Of the terms that are two words (sole proprietor, sole
 * trader, self employed, free lance) the separator may be up to three characters, each a
 * blank or a dash of any kind (the Pd category, which a fold does not make one), in any mix, or
 * nothing: `sole - proprietor` and `free - lance` are read as the terms. The bound keeps the
 * pattern linear (a bounded quantifier, nothing to backtrack over); U+2212, the minus sign, is no
 * dash. Einzelkaufmann has its female form, Einzelkauffrau.
 *
 * The next is the German registered sole trader (e.K., e. K., e.Kfm., e.Kfr.) with its final full
 * stop optional, and the Austrian one (e.U., e. U.) with its full stop, each as a word of
 * its own: it follows the start or a character that is neither a letter nor a digit, and is
 * followed by the end, a blank or punctuation, never by a letter or a digit, so that a name that
 * merely holds the letters (a word that ends in e, then K) is kept. With no final full stop the
 * letters of e.K are followed by neither a letter, a digit nor a full stop, so that `e.K.Holding`
 * and `e.K.2` stay as they were.
 *
 * The last two are WHOLE words, the sole traders of other countries: Einzelfirma,
 * eenmanszaak, entreprise individuelle, EIRL, auto-entrepreneur, micro-entrepreneur, empresario
 * individual, autonomo (with or without its acute accent, which is written with a hex escape so
 * that the source stays ASCII), ditta individuale, enskild firma and enkeltpersonforetak; and the
 * abbreviations that end in a full stop, Sole Prop. and Inh. (Inhaber, followed by the name of the
 * owner). A whole word has no letter and no digit touching it on either side, so that Autonomous
 * Systems and Eirleen are kept; the full stop ends an abbreviation, so that nothing is asked of
 * what follows it. EI, two letters, is no term.
 */
const PERSON_TERMS = new RegExp(
  [
    String.raw`sole${SEPARATOR}propriet`,
    String.raw`sole${SEPARATOR}trader`,
    "einzelunternehm",
    "einzelkauf(?:mann|frau)",
    String.raw`free${SEPARATOR}lanc`,
    String.raw`self${SEPARATOR}employed`,
    String.raw`${WORD_START}e\.\s?(?:u\.${WORD_END}|k(?:fm|fr)?(?:\.${WORD_END}|(?![\p{L}\p{N}.])))`,
    `${WORD_START}(?:${[
      "einzelfirma",
      "eenmanszaak",
      "eirl",
      String.raw`entreprise${SEPARATOR}individuelle`,
      String.raw`auto${SEPARATOR}entrepreneur`,
      String.raw`micro${SEPARATOR}entrepreneur`,
      String.raw`empresario${SEPARATOR}individual`,
      String.raw`aut[o\xf3]nomo`,
      String.raw`ditta${SEPARATOR}individuale`,
      String.raw`enskild${SEPARATOR}firma`,
      "enkeltpersonforetak",
    ].join("|")})${WORD_END}`,
    String.raw`${WORD_START}(?:sole${SEPARATOR}prop|inh)\.`,
  ].join("|"),
  "iu",
);

/**
 * The marks of a trade name, as whole words: `dba`, `d/b/a`, `doing business as`, `t/a` and
 * `trading as`, in any case, after a blank or a comma (so that a name that begins with one is no
 * mark) and before a blank or the end of the name. The first one of a name is looked for. It is
 * looked for in a cleaned line (`lineOf`), in which a run of white space is one blank, so the words
 * of a mark are apart by one blank.
 */
const TRADING_MARK = /[\s,](?:dba|d\/b\/a|doing business as|t\/a|trading as)(?=\s|$)/i;
/** What makes a text readable as a name: a letter or a digit. */
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** What is taken off the ends of a word of a name before it is looked up in the lists of the kit. */
const WORD_MARKS = ".,;()";
/**
 * The words that the kit's list of organisation words holds at its end, which no organisation is
 * known by: what joins the parts of a name (of, the, and, for, `&`, the particles of Spanish) and
 * the marks of an alias. A person's name holds some of them, so they are no organisation words
 * here (the same reading as californiaBreaches.ts).
 */
const JOINING_WORDS: ReadonlySet<string> = new Set(
  "of the and for de del la las los el en para por & dba d/b/a a/k/a aka".split(" "),
);
/** The kit's organisation words that name an organisation, without the joining words. */
const ORGANISATION_WORDS: ReadonlySet<string> = new Set(
  [...GENERIC_ORG_WORDS].filter((word) => !JOINING_WORDS.has(word)),
);

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${C2PA_CONFORMING_RECORD_MARK} (github.com/c2pa-org), a register or status list.`;
/** The second: what a record is and is not. It comes early, so that no cut of a long text can reach it. */
const NOT_A_FINDING =
  "A record says that the C2PA accepted conformance applications from this applicant for the " +
  "products named; it says nothing about the applicant's other products, about the authenticity " +
  "of any content, or about the applicant's conduct, and the C2PA can revoke a listing.";
/** The last: the licence's credit and the C2PA's marks, which no cut of a long text may take. */
const SOURCE_SENTENCE =
  "Source: C2PA conformance-public repository, CC BY 4.0; adapted by VerifyWise. " +
  "The C2PA name and marks are the C2PA's.";

type Kind = "generator" | "validator" | "other";

/** What is kept of a product, transiently: no cell but these, and no cell as it was written. */
interface Product {
  /** The UUID of the product, in lower case. */
  recordId: string;
  /**
   * The applicant as the line of a cell, whole (at most 100 characters); of a person who trades under
   * a business name, the business, and nothing of the person.
   */
  applicant: string;
  conformant: boolean;
  kind: Kind;
  /** The day of the conformance. */
  conformance: string;
  /** The day of the last change, when the list says one. */
  modified: string | null;
  /** The organisation of the certificate, when it is another usable name; else null. */
  organisation: string | null;
  /** The name of the product (`DN.CN`), cut to what the text shows; empty when it has none. */
  name: string;
}

type Reading =
  { kind: "product"; key: string; product: Product } | { kind: "person" } | { kind: "unreadable" };

const UNREADABLE: Reading = { kind: "unreadable" };
const PERSON: Reading = { kind: "person" };

/** What the list says of one applicant: the row of the snapshot, and the record that it makes. */
interface ApplicantRow {
  /** The compact name of the applicant: the id of the record. */
  id: string;
  /** The spelling shown: the most frequent among the conformant products, a tie by the characters. */
  display: string;
  /** The spellings (at most three) and then the organisations (at most two) that are other names. */
  names: string[];
  conformant: number;
  generator: number;
  validator: number;
  /** The listed products of this applicant whose status is not conformant. */
  otherStatus: number;
  /** The newest conformance day among the conformant products. */
  newestConformance: string;
  /** The newest last change among all the products of the applicant, when any has one. */
  newestModification: string | null;
  /** The names of the newest conformant products, distinct, at most 20. */
  productNames: string[];
  /** The ids of the newest conformant products, at most 20. */
  recordIds: string[];
}

/** A cell as one whole line of at most `max` characters: null when it is empty, or was cut. */
function wholeLine(value: unknown, max: number): string | null {
  const line = lineOf(value, max);
  return line === "" || line.endsWith(CUT_MARK) ? null : line;
}

/** Whether a name is the business of a person (rule A). */
function isPersonsBusiness(name: string): boolean {
  return PERSON_TERMS.test(name);
}

/** A word of a name without the marks round it, in lower case. */
function bareWord(word: string): string {
  let start = 0;
  let end = word.length;
  while (start < end && WORD_MARKS.includes(word[start])) start += 1;
  while (end > start && WORD_MARKS.includes(word[end - 1])) end -= 1;
  return word.slice(start, end).toLowerCase();
}

/**
 * Whether a text holds a legal form or a word of an organisation: a word of it, in any case, with
 * the marks round the word off, is one of the kit's lists. The dots of a legal form are no part of
 * it (`L.L.P.` is `llp`; the list holds every dotted form with its dotless twin, so the dotless word
 * is all that is looked up).
 */
function holdsOrganisation(text: string): boolean {
  return text.split(/\s+/).some((word) => {
    const bare = bareWord(word);
    return GENERIC_LEGAL_FORMS.has(bare.split(".").join("")) || ORGANISATION_WORDS.has(bare);
  });
}

/**
 * The name of a business that the applicant (or the certificate) gives, with the person that stands
 * before a mark of a trade name cut out (as for the list of the California breaches):
 * `<name>, dba <business>` is the business. While the name holds a mark (TRADING_MARK), and the part
 * BEFORE the first mark holds a letter or a digit and holds no legal form and no word of an
 * organisation (`holdsOrganisation`), what stands before the mark and the mark are cut away and
 * what follows is read again, so that a chain of marks leaves the last business that no
 * organisation precedes. A part before the mark that holds a legal form or a word of an organisation
 * (`Zorb Inc., dba Zorb Studio`), or has no letter and no digit, is the name as it is, with all its
 * marks. Null when nothing readable follows a mark that cut: there is no business, and the name is
 * a person's. The name is a cleaned line of at most 100 characters (`wholeLine`: no applicant and no
 * organisation is longer), so the loop cuts at most 25 times, over at most 100 characters each time;
 * it is not made for a longer text, as every cut copies what is left.
 */
function businessOf(name: string): string | null {
  let rest = name;
  for (;;) {
    const mark = TRADING_MARK.exec(rest);
    if (mark === null) return rest;
    const before = rest.slice(0, mark.index);
    if (!LETTER_OR_DIGIT.test(before) || holdsOrganisation(before)) return rest;
    rest = rest.slice(mark.index + mark[0].length).trim();
    if (compactName(rest) === "") return null;
  }
}

/** The organisation of a certificate when it can be a second name of the applicant; else null. */
function organisationOf(value: unknown): string | null {
  const line = wholeLine(value, ORGANISATION_CHARS);
  if (line === null || isPersonsBusiness(line)) return null;
  const business = businessOf(line);
  if (business === null) return null;
  return compactName(business).length >= MIN_KEY_CHARS ? business : null;
}

function kindOf(value: unknown): Kind {
  if (value === GENERATOR) return "generator";
  return value === VALIDATOR ? "validator" : "other";
}

/** The product that an item of the file is, or why it is none. */
function readProduct(item: unknown, occurrences: ReadonlyMap<string, number>): Reading {
  if (!isObject(item)) return UNREADABLE;
  const applicant = wholeLine(item.applicant, APPLICANT_CHARS);
  if (applicant === null) return UNREADABLE;
  // A person's business is dropped, whatever else is wrong with the product (its id included).
  if (isPersonsBusiness(applicant)) return PERSON;
  // A person who trades under a business name is that business: the person is cut out of
  // everything. A mark with nothing readable after it leaves a person's business: dropped as well.
  const business = businessOf(applicant);
  if (business === null) return PERSON;
  const key = compactName(business);
  if (key === "") return UNREADABLE;

  const { recordId, status } = item;
  if (typeof recordId !== "string" || !RECORD_ID.test(recordId)) return UNREADABLE;
  const id = recordId.toLowerCase();
  if ((occurrences.get(id) ?? 0) > 1) return UNREADABLE;
  if (typeof status !== "string" || lineOf(status, STATUS_CHARS) === "") return UNREADABLE;
  const dates = isObject(item.dates) ? item.dates : {};
  const conformance = dayText(dates.conformance);
  if (conformance === null) return UNREADABLE;
  const inner = isObject(item.product) ? item.product : {};
  const dn = isObject(inner.DN) ? inner.DN : {};
  return {
    kind: "product",
    key,
    product: {
      recordId: id,
      applicant: business,
      // Exactly the word: another case, a blank or a hidden character is another status.
      conformant: status === CONFORMANT,
      kind: kindOf(inner.productType),
      conformance,
      modified: dayText(dates.lastModification),
      organisation: organisationOf(dn.O),
      name: lineOf(dn.CN, PRODUCT_NAME_CHARS),
    },
  };
}

/** The newest first: the later conformance day, and of one day the greater id (UUID v7 grows with time). */
const newestFirst = (a: Product, b: Product): number =>
  compareText(b.conformance, a.conformance) || compareText(b.recordId, a.recordId);

/** The distinct values, the most frequent first and of equal ones the first in the order of the characters. */
function byFrequency(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || compareText(a, b),
  );
}

/** The organisations that are other names than the applicant's, at most ORGANISATIONS_MAX, one for each key. */
function otherOrganisations(listed: readonly Product[], id: string): string[] {
  const organisations = listed.flatMap(({ organisation }) =>
    organisation === null ? [] : [organisation],
  );
  const seen = new Set([id]);
  const names: string[] = [];
  for (const organisation of byFrequency(organisations)) {
    if (names.length === ORGANISATIONS_MAX) break;
    const key = compactName(organisation);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(organisation);
  }
  return names;
}

/** The names of the products, distinct, in the order of the products, at most PRODUCT_NAMES_MAX. */
function productNamesOf(listed: readonly Product[]): string[] {
  const names = new Set<string>();
  for (const { name } of listed) {
    if (names.size === PRODUCT_NAMES_MAX) break;
    if (name !== "") names.add(name);
  }
  return [...names];
}

/** The newest of the days that there are, or null when there is none. */
function newestDay(days: ReadonlyArray<string | null>): string | null {
  let newest: string | null = null;
  for (const day of days) {
    if (day !== null && (newest === null || day > newest)) newest = day;
  }
  return newest;
}

/** The row of an applicant with at least one conformant product. */
function rowOf(id: string, products: readonly Product[]): ApplicantRow {
  const listed = products.filter((product) => product.conformant).sort(newestFirst);
  const spellings = byFrequency(listed.map((product) => product.applicant));
  return {
    id,
    display: spellings[0],
    names: [...spellings.slice(0, SPELLINGS_MAX), ...otherOrganisations(listed, id)],
    conformant: listed.length,
    generator: listed.filter((product) => product.kind === "generator").length,
    validator: listed.filter((product) => product.kind === "validator").length,
    otherStatus: products.length - listed.length,
    newestConformance: listed[0].conformance,
    newestModification: newestDay(products.map((product) => product.modified)),
    productNames: productNamesOf(listed),
    recordIds: listed.slice(0, RECORD_IDS_MAX).map((product) => product.recordId),
  };
}

function read(fetched: Fetched): ReadResult<ApplicantRow> | null {
  const reading = readJsonArray(textOf(fetched, 0), MAX_PRODUCTS);
  if (reading === null) return null;
  const { items } = reading;
  // More products than the list can hold is no list to read whole: it is too large, and the reader
  // gives none of it rather than a part.
  if (!reading.complete) return { rows: [], total: items.length, unreadable: 0, complete: false };

  const occurrences = new Map<string, number>();
  for (const item of items) {
    const id = isObject(item) ? item.recordId : undefined;
    if (typeof id === "string" && RECORD_ID.test(id)) {
      const lower = id.toLowerCase();
      occurrences.set(lower, (occurrences.get(lower) ?? 0) + 1);
    }
  }

  const groups = new Map<string, Product[]>();
  let unreadable = 0;
  let conformant = 0;
  for (const item of items) {
    const product = readProduct(item, occurrences);
    if (product.kind === "unreadable") {
      unreadable += 1;
    } else if (product.kind === "product") {
      const group = groups.get(product.key);
      if (group === undefined) groups.set(product.key, [product.product]);
      else group.push(product.product);
      if (product.product.conformant) conformant += 1;
    }
  }
  // An applicant that has no conformant product has no record.
  const rows = [...groups]
    .filter(([, products]) => products.some((product) => product.conformant))
    .map(([id, products]) => rowOf(id, products));
  if (conformant < MIN_CONFORMANT || rows.length < MIN_APPLICANTS) return null;
  return { rows, total: items.length, unreadable, complete: reading.complete };
}

/** The sentence about the other products of the applicant; nothing when there are none. */
function otherStatusClause(count: number): string {
  if (count === 0) return "";
  return count === 1
    ? "; 1 other listed product has another status"
    : `; ${count} other listed products have another status`;
}

function summaryOf(row: ApplicantRow): string {
  const shown = row.productNames.slice(0, PRODUCT_NAMES_SHOWN);
  const more = row.conformant - shown.length;
  return summaryWithClosing(
    [
      FIRST_SENTENCE,
      NOT_A_FINDING,
      sentence("Applicant as written", lineOf(row.display, DISPLAY_CHARS)),
      `Conformant products: ${row.conformant} (${row.generator} generator, ${row.validator} validator), the newest conformed on ${row.newestConformance}${otherStatusClause(row.otherStatus)}.`,
      shown.length === 0
        ? ""
        : sentence("Products", `${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`),
    ],
    SOURCE_SENTENCE,
    RECORD_SUMMARY_MAX,
  );
}

/** The address of a record: the list's page with the id of the record, which is made of letters and digits. */
function addressOf(id: string): string {
  try {
    return `${PAGE_URL}${encodeURIComponent(id)}`;
  } catch {
    // An id that is not text that can be written in an address (a lone surrogate) is no id.
    throw new UnreadableEntry();
  }
}

function recordFor(row: ApplicantRow): ParsedRecord {
  return recordOf({
    id: row.id,
    type: "c2pa_conformance",
    title: `${C2PA_CONFORMING_RECORD_MARK}: ${lineOf(row.display, DISPLAY_CHARS)}`,
    summary: summaryOf(row),
    url: addressOf(row.id),
    identifiers: {
      applicant: row.display,
      conformant: row.conformant,
      newestConformance: row.newestConformance,
      recordIds: row.recordIds,
    },
    names: row.names,
    // Ordering only: the day of the newest conformance.
    publishedAt: row.newestConformance,
    sourceUpdatedAt: null,
  });
}

const SPEC: ListSpec<ApplicantRow> = {
  id: "c2pa_conforming",
  version: 1,
  root: "conforming-products-list.json",
  sortKey: (row) => row.id,
  files: [
    {
      url: FILE_URL,
      maxBytes: MAX_BYTES,
      contentTypes: ["text/plain", "application/json"],
      timeoutMs: TIMEOUT_MS,
    },
  ],
  pin: { hosts: ["raw.githubusercontent.com"], pathPrefixes: ["/c2pa-org/conformance-public/"] },
  read,
  toRecords: (rows) => rows.map(recordFor),
  // The newest last change of the products of the applicants that have a record.
  sourceVersion: (rows) => newestDay(rows.map((row) => row.newestModification)),
};

export const c2paConformingConnector: Connector = createFileConnector(SPEC);
