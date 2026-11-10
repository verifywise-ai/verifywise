/**
 * The consumer protection civil penalty cases of the US Federal Trade Commission as a list of the
 * vendor risk database. The list is one workbook that the FTC publishes with its open data (CC0): one
 * row for each defendant of a case, with the case number, the defendants' names, the amount that was
 * ordered and the day of the order. A row is no finding about a vendor; it says that the FTC's own
 * list holds an order against a defendant of that name, which may be another company of the same
 * name.
 *
 * The address of the workbook carries the fiscal year, so it is not fixed: the connector reads the
 * FTC's catalogue (data.json) first and follows the address that it gives for the dataset, which it
 * accepts only on the FTC's own host and in the FTC's own directory of files. The FTC asks for a pause
 * of 5 seconds between two requests (kit/pause.ts), and the connector keeps it. The two requests are
 * asked with no validators every time: a snapshot holds one pair, and neither request's own would
 * tell whether the list changed, so the sync's hash of the body tells an unchanged list.
 *
 * The workbook states its own total in a footer row (the count of the cases and the sum of the
 * amounts), and the connector checks both against the rows it read: a list that does not add up is
 * not the list. A record is made for each defendant company, not for each order: the orders of a
 * company are counted, dated and summed, and the newest are shown.
 *
 * Natural persons: the names of the defendants are the one place where a person can be named. Every
 * parenthetical group of a Case Name is cut before anything else is read (individual defendants and
 * brands are written there), with one exception (a nickname, see below), and what is left is read by
 * the party rule below (`ftcPenaltyPartiesOf`):
 * a party that is a person's name is dropped, with its row's share of the case, before anything is
 * stored. The rule is the one that was measured on the whole file (kit/persons.ts holds the
 * word lists it calls): its recall was complete by reading, and its precision is low, so a firm whose
 * name has the shape of a person's (two capitalised words and no legal form) is dropped as well.
 * Shapes that the rule alone lets through are closed here. Every one fails
 * closed (a company is lost rather than a person kept), and the cost in recall is accepted:
 * - a group of a comma that begins with `and`, `&` or `+` goes on with the group before it, so that
 *   `Examplecorp Inc., and Casey Sample` is dropped whole as `Examplecorp Inc. and Casey Sample` is
 *   (a `+` joins as an `&` does, and an `and` joins in any case);
 * - the `Last, First` shape (a group of one word with no legal form, followed by another one or
 *   by a group that the person rule drops: `Sample, Casey`, `SAMPLE, CASEY J`) drops its whole
 *   party, and so does a one-word group before legal wording (`Sample, individually`); a company
 *   named as two one-word brands in a row (`Alpha, Beta`) is dropped by design, and so is a
 *   one-word brand that stands before a person;
 * - the same shape with a surname that is no bare word (a surname of two to four words, a suffix
 *   `Jr.` or `III`, a particle that is not taken out, `Estate of`): `Sample Lee, Casey`, `Van
 *   Sample, Casey`, `Sample Jr., Casey`. The person's group and the given name that follows it are
 *   dropped, and so is everything that follows the given name (`Sample Lee, Casey and Examplecorp
 *   Inc.`, `Casey Sample, Brightzorb, Quillon and Co.`): a firm can be named as a bare word, a comma and
 *   the rest of its name, and the rest alone (`Quillon and Co.`) would be a name with its front cut
 *   off, so the firm is lost, never cut. What stands before the person stays (`Examplecorp Inc.,
 *   Sample Lee, Casey` stores `Examplecorp Inc.`). The given name can carry a legal form (`Sample Lee,
 *   Casey, LLC`, `Casey Sample, Robin, LLC`): the bare word is judged on the first piece of its group,
 *   before the form is merged into it, and the given name, its form and everything after it go. A
 *   company of one word with its legal form that stands after a person's group (`Casey Sample,
 *   Zorbex, Inc.`) is that shape too, and is lost, as `Zorbex Lee, Quillon, Inc.` is (the front cut
 *   `Quillon, Inc.` is refused). A bare surname keeps its form (`Sample, Casey, LLC` is stored
 *   whole);
 * - the particles `de del la las los el en` and the `y` are taken out of a group before the person
 *   rule judges it (the kit counts them as organisation words, and the `y` as a legal form, which
 *   hid `Casey de la Sample` and `Casey Sample y Robin Sample`), and a legal form that is left
 *   still wins; a firm with no legal form that holds a particle and capitalised words (`Casa de
 *   Sample`) is dropped with the persons;
 * - `doing business as`, `trading as` and `t/a` split a name as `d/b/a` does: the person before
 *   them is dropped and the business after them stays;
 * - a group of a comma that is made of legal wording alone (`individually`, `also`, `jointly and
 *   severally`) is no party, so that `Casey Sample, individually` leaves no entity `individually`;
 * - a name that goes on under another name (`a/k/a`, `aka`, `f/k/a`, `n/k/a`) is the same
 *   defendant's: when every principal party is dropped as a person, only the business that a
 *   `d/b/a`, `dba`, `t/a`, `doing business as` or `trading as` names is promoted, and a name that the
 *   person goes by is dropped with the person (it is kept after a business that is promoted, as
 *   it has always been);
 * - the marks of a name, for the person shape only (the text that is stored is never changed): every
 *   quotation mark (the straight double mark, the initial and final quotation marks of Unicode, the
 *   low-9 marks, the primes, the CJK double-prime marks) is taken off every word before the person rule
 *   judges a piece, so that `Casey "Robin" Sample` is a person's name with a nickname; every dash
 *   (Unicode's dash punctuation and the minus sign) reads as a hyphen and the backtick as an
 *   apostrophe; a U+2018 or U+2019 between two letters is an apostrophe, and anywhere else a quotation
 *   mark; the acute accent, which NFKC would split into a blank and a combining mark, is an apostrophe
 *   (and a name that holds one is stored with the apostrophe). The full-width and small forms are the
 *   ASCII marks once the cell is cleaned;
 * - the head of a name ends at a dash that separates (a blank, one or two dashes of any script, a
 *   blank), as it always ended at ` - `: `Examplecorp Inc. - Casey Sample`, `... -- Casey Sample` and
 *   `... <en dash> Casey Sample` store the company, and `Casey Sample - Examplecorp Inc.` stores nothing;
 * - a nickname in parentheses, brackets or braces (one or two words, each a capitalised word or an
 *   initial, no digit, no lower-case word, no mark) is left out of what the person rule judges, so
 *   that `Casey (Robin) Sample`, `Casey [Robin] Sample` and `Casey {Robin} Sample` are `Casey Sample`.
 *   A parenthesis is read as a nickname only when a text stands before it and a word follows it (none
 *   of a comma, a slash, a semicolon, an alias mark or a legal form between: `Zorbex (USA) Inc.` is cut
 *   at the parenthesis and stores `Zorbex`, as ever). The name is judged twice, over the same groups: as
 *   it was always read (each group cut at its parenthesis, as far as the last cut) and as it is named,
 *   and a group stays only if both readings keep it (a group after the last cut is also judged, alone,
 *   as it is written). What is stored is the group as it was written, cut at the parenthesis, so that
 *   the person rule is never weaker than it was and nothing that follows a parenthesis is stored but
 *   the groups and the segments that a comma, a slash, a semicolon or an alias mark leaves whole after
 *   it (`Casey (Robin) Sample d/b/a Examplestore` stores `Examplestore`, and `Examplecorp Inc., Casey
 *   (Robin) Sample` stores `Examplecorp Inc.`). Brackets and braces are never cut: they are only left
 *   out of the judging;
 * - a piece that holds `Estate of` anywhere (`Executor of the Estate of ...`, `In re Estate of ...`) or
 *   a name of more than one word that ends in `Estate` is a person's, whatever else it holds.
 * Not closed (each shape is stored as the rule gives it, which a test or a probe shows): the name of a
 * person of five words or more, once its particles are out, has no shape that the rule knows (`Mary
 * Ann Casey Lee Sample` is kept); a digit still makes a piece no person's, for the kit reads letters,
 * dots, apostrophes and hyphens only (`Casey Sample 3rd` is kept); a join with no blank round it
 * (`Casey Sample+Robin Sample`) is no join, and nor is a `y` between a company with a legal form and a
 * person, for the legal form wins: the party is kept whole, the person in it too. A person whose
 * surname is a word of the kit's lists (an organisation word, a legal form: `Casey Hotel`, `Casey
 * Bank`) is read as a company and kept. The words `with`, `et`, `und` and `e` are no joins: a party
 * that holds one is one group of five words or more, with no person's shape, and it is stored whole
 * with its persons (`Casey Sample et Robin Sample`, `Casey Sample with Examplecorp Inc.`); `as
 * Trustee of the ... Trust` is none either: the trust, which names its trustee, is stored (`Casey
 * Sample, as Trustee of the Sample Family Trust` stores `as Trustee of the Sample Family Trust`, and
 * without the comma the whole text), and a named trust is the same (`Robin Sample Revocable Trust`:
 * `Trust` is a company word of the kit's lists). A parenthesis that is no nickname (a lower-case
 * word, three words or more, a digit, a mark) is cut as ever and its head is stored (`Casey (the
 * owner) Sample` stores `Casey`), and so is a nickname with no word after it or a comma, a slash,
 * an alias mark or a legal form first; a bracket or a brace that is no nickname is never cut and stays
 * in the name (`Casey [the owner] Sample`). A run of three dashes is no separator, and a dash that
 * touches a word is none. A firm of one word, a nickname and a word, with no legal form (`Zorbex
 * (USA) Brightzorb`), is read as a person's and dropped, and so is a firm that holds `Estate of` in
 * its name (`Zorbex Estate of Example Inc.`): the costs of the two rules. A US place name that begins
 * with a capitalised Spanish particle and has no legal form (`Las Vegas Zorbex`, `El Paso Example`)
 * has its particle taken out and reads as a person's: it is dropped, the cost of the particle rule. A
 * firm named as a list that begins with a group of a person's shape (`Zorbex Lee, Quillon Brightzorb
 * Inc.`) is read as a person and a company, and the company is stored without its first group, a name
 * with its front cut off; with a bare word after the person's group (`Zorbex Lee, Quillon, and
 * Tallow, Inc.`) the whole is lost instead (see the bullet above). A name that holds several
 * parentheses of nicknames in a list of groups can lose a company that stands beside them (the groups
 * are judged cut, and a cut group is a bare word). Four more shapes, which no case name of the real
 * file has, are stored with their person, as a probe shows: a bracket or a brace that holds a name
 * after a company or an alias mark (stored whole); a nickname inside a company name (`Casey (Robin)
 * Sample LLC` stores `Casey`); a colon, a vertical bar, a tilde, a bullet, a middle dot and the CJK
 * corner brackets, which join nothing; and `Estates of` and `Estate for`, which are kept. No name, id
 * or key is made of what the rule drops.
 *
 * The id of an entity is the compact name of the party without its legal form, as it is up to 100
 * units; a longer name gives its first 83 units, a tilde and 16 hex digits of the SHA-256 of the whole
 * compact name, so that two long names with one start are two entities (no compact name holds a
 * tilde). The identifier `defendant` holds the first spelling of the party whole; the title and the
 * summary of the record show it cut at 100 characters, with the marker.
 *
 * Left out: the Office column, the rest of the catalogue (every other dataset and distribution) and
 * every cell of the sheet that is not one of the five that are read.
 *
 * It keeps no address, no message and no row in an error or in a log: the failures are the kit's.
 */
import { createHash } from "node:crypto";
import { FetchError } from "../../../webResearch/guardedFetch";
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { cutAtCodePoint } from "../../text";
import type { ParsedRecord } from "../types";
import { type XlsxLimits, dayOfExcelSerial } from "../xlsx";
import type { Pin } from "./kit/address";
import { readSheetTable } from "./kit/archives";
import {
  SHORTENED,
  compareText,
  distinct,
  isObject,
  lineOf,
  shorten,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { jsonOf } from "./kit/json";
import { pinnedFetch } from "./kit/paging";
import { type Sleep, pauseFor, realSleep } from "./kit/pause";
import { hasLegalForm, looksLikePerson } from "./kit/persons";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf } from "./kit/table";
import { textOf } from "./kit/text";
import { type Connector, type ConnectorFetch, NotTheListError } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const FTC_PENALTIES_RECORD_MARK = "FTC civil penalty cases";

/** The host as the first sentence of a record writes it: the operator's, without `www.`. */
const HOST = "ftc.gov";
const CATALOGUE_URL = "https://www.ftc.gov/data.json";
const CATALOGUE_PATH = "/data.json";
/** The page of the record: the catalogue that names the dataset, with the defendant. */
const RECORD_URL = `${CATALOGUE_URL}?dataset=civil-penalty-cases&defendant=`;
const DATASET_TITLE = "FTC Bureau of Consumer Protection Penalty Actions";
/** The name of the one sheet, as Excel cut it to 31 characters. */
const SHEET = "civil_penalty_cases_fy-2000-202";
/** The address of the workbook, the fiscal year being the last two digits: 26 is the file of 2026. */
const WORKBOOK_URL =
  /^https:\/\/www\.ftc\.gov\/system\/files\/ftc_gov\/documents\/civil_penalty_cases_fy2000-20([0-9]{2})\.xlsx$/;
/** The first fiscal year that this reading is of: an older file is no copy of the current list. */
const FIRST_FISCAL_YEAR = 26;

/** The catalogue is a file of the host itself, and the workbook is in the directory of its files. */
const CATALOGUE_PIN: Pin = { hosts: ["www.ftc.gov"], pathPrefixes: ["/"] };
const WORKBOOK_PIN: Pin = {
  hosts: ["www.ftc.gov"],
  pathPrefixes: ["/system/files/ftc_gov/documents/"],
};

const CATALOGUE_LIMITS = {
  maxBytes: 1_048_576,
  allowedContentTypes: ["application/json"],
  totalTimeoutMs: 60_000,
};
const WORKBOOK_LIMITS = {
  maxBytes: 4_194_304,
  allowedContentTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
  totalTimeoutMs: 120_000,
};

/** What the reader of the sheet may hold: a limit past it is a file that is too large. */
const SHEET_LIMITS: XlsxLimits = {
  maxRows: 5000,
  maxColumns: 16,
  zip: { maxEntries: 64, maxEntryBytes: 4_194_304, maxTotalBytes: 8_388_608 },
};

/**
 * The header of the sheet, by the cells' trimmed text: the sheet writes a blank before the name of
 * the fourth column.
 */
const HEADER = ["Case Number", "Case Name", "Office", "Ordered Amount", "Date of Order", "Basis"];
/** The columns of the sheet: a cell after them must be empty. */
const COLUMNS = HEADER.length;
/** The list has 391 rows today; a sheet of fewer than this is no copy of it. */
const MIN_ROWS = 300;
/** The oldest order of the list is of 2000; a list that begins after this day is cut. */
const LATEST_FIRST_DAY = "2000-12-31";

/** A case number: a letter and four to seven digits, which the sheet may follow with more text. */
const CASE_NUMBER = /^([A-Z][0-9]{4,7})(?![0-9])/;
/** An amount of dollars as a number is written: digits and, with cents or more, a decimal part. */
const AMOUNT = /^[0-9]{1,13}(?:\.[0-9]{1,20})?$/;
/** A day as an Excel serial: the number of days, with the time of the day as a decimal part. */
const SERIAL = /^[0-9]{1,7}(?:\.[0-9]{1,20})?$/;
/** The sum that the footer states: as an amount, with room for a sum of many of them. */
const FOOTER_SUM = /^[0-9]{1,15}(?:\.[0-9]{1,20})?$/;
/** The shortName of a host: the part before its suffix is a name that a vendor may be known by. */
const HOST_NAME = /^[a-z0-9-]+\.(?:com|net|org|info|biz|us)$/i;

const NUMBER_CELL_MAX = 100;
const NAME_MAX = 300;
const AMOUNT_CELL_MAX = 60;
const DATE_CELL_MAX = 40;
const BASIS_MAX = 120;
const DISPLAY_MAX = 100;
/** The longest id: the compact name of a party is the id itself up to here (see `idOf`). */
const ID_MAX = 100;
/** The hex digits of the hash that ends the id of a compact name that is too long. */
const ID_HASH_DIGITS = 16;
/** The units of such a name that its id keeps: with the tilde and the hash, ID_MAX in all. */
const ID_KEPT = ID_MAX - 1 - ID_HASH_DIGITS;
/** What the text of a record shows of the basis of an order. */
const BASIS_SHOWN = 90;
/** A name key has four letters and digits at least (keys.ts). */
const MIN_NAME_CHARS = 4;
const SPELLINGS_KEPT = 5;
const ALIASES_KEPT = 3;
const NEWEST_KEPT = 3;
const CASES_KEPT = 10;

/** A party of a case, as the party rule reads a Case Name. */
export interface FtcPenaltyParties {
  /** The defendant companies of the row, in the order of the name: the entities that the row counts for. */
  entities: string[];
  /** The other names (d/b/a, f/k/a, a/k/a, n/k/a) that belong to the first of the entities. */
  aliases: string[];
}

/** The marks of a name that goes on under another name, as the source of the expressions below. */
const ALIAS_WORDS = String.raw`d\/b\/a|f\/k\/a|a\/k\/a|n\/k\/a|t\/a|dba|aka|doing\s+business\s+as|trading\s+as`;
/**
 * Where a name goes on under another name: ` d/b/a `, ` f/k/a `, ` a/k/a `, ` n/k/a `, ` t/a `,
 * ` dba `, ` aka `, ` doing business as `, ` trading as `. The mark is captured, so that a split
 * gives it between the segments it opens.
 */
const ALIAS_MARK = new RegExp(String.raw`\s+(${ALIAS_WORDS})\s+`, "i");
/**
 * The marks of a business that a defendant trades under. The others (`a/k/a`, `aka`, `f/k/a`,
 * `n/k/a`) name the same defendant under another name, and a name of a person is a person's.
 */
const BUSINESS_MARK = /^(?:d\/b\/a|dba|t\/a|doing\s+business\s+as|trading\s+as)$/i;
/** What separates two parties of one segment. */
const PARTY_SEPARATOR = /\s*[/;]\s*/;
/** The end of a party that stands for other parties: `et al`, `et. al.`, and the `el al` of a misspelling. */
const ET_AL = /\s*,?\s*e[tl]\.?\s+al\.?$/i;
/** A group of a comma that is only the legal form of the group before it. */
const LEGAL_FORM_ONLY =
  /^(?:inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|lp|l\.p|llp|n\.a|plc|p\.c|pc|gmbh|ag|s\.a|b\.v|n\.v)\.?$/i;
/** What joins two pieces of one group, in any case: ` and `, ` & `, ` + `. */
const AND_JOIN = /\s+(?:and|&|\+)\s+/i;
/**
 * The particles that a Spanish name puts between its names, and the `y` that joins two of them. The
 * kit counts every one of them as an organisation word, and `y` as a legal form as well, so that a
 * name that holds one is never read as a person's: the person rule is asked about the name without
 * them (`coreOf`).
 */
const NAME_PARTICLES: ReadonlySet<string> = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "en",
  "y",
]);
/**
 * The words of the legal wording that a case name adds after a defendant to say how it is named
 * (`Casey Sample, individually`, `jointly and severally`): a group made of them alone names no one.
 */
const LEGAL_WORDING: ReadonlySet<string> = new Set([
  "individually",
  "individual",
  "personally",
  "jointly",
  "severally",
  "collectively",
  "also",
  "formerly",
  "successors",
  "successor",
  "assigns",
  "assign",
  "et",
  "al",
  "and",
  "or",
  "its",
  "their",
  "the",
  "as",
  "an",
  "a",
]);
/**
 * The quotation marks that the person rule reads as no character, as the inside of a class: the
 * straight double mark, every initial and final quotation mark of Unicode (the typographic single and
 * double marks, the guillemets), the low-9 marks, the primes (NFKC turns a double prime into two
 * primes and a reversed one into two reversed) and the CJK double-prime marks.
 */
const QUOTATION_CLASS = String.raw`"\p{Pi}\p{Pf}\u201a\u201e\u2032-\u2037\u301d-\u301f`;
const QUOTATION_MARK = new RegExp(`[${QUOTATION_CLASS}]`, "u");
/** What stands round a word without being part of it: a dot and the quotation marks. */
const WORD_EDGE = new RegExp(`[.${QUOTATION_CLASS}]`, "u");
/** The typographic single marks: between two letters one is an apostrophe, anywhere else a quotation mark. */
const SINGLE_MARK = /[\u2018\u2019]/u;
/** A dash of any script, and the minus sign: the person rule reads one as a hyphen. */
const DASH = /[\p{Pd}\u2212]/u;
const LETTER = /\p{L}/u;
/** The acute accent, which some names write as an apostrophe. NFKC turns it into a blank and U+0301. */
const ACUTE_ACCENT = String.fromCodePoint(0xb4);
const BLANK_COMBINING_ACUTE = /\s\u0301/gu;
/**
 * A piece that holds `Estate of` as two words, anywhere in it (`Executor of the Estate of ...`,
 * `In re Estate of ...`): an estate is a person's.
 */
const ESTATE_OF = /(?:^|\s)estate\s+of(?:\s|$)/i;
/** The dash that cuts a head, as ` - ` always did: a blank, one or two dashes of any script, a blank. */
const DASH_SEPARATOR = /\s[\p{Pd}\u2212]{1,2}\s/u;
/**
 * A word of a nickname: a capitalised word or an initial, with the dots, apostrophes and hyphens that a
 * name holds. A digit, a lower-case word and any mark make a group no nickname.
 */
const NICKNAME_WORD = String.raw`\p{Lu}[\p{L}.'\u2019\p{Pd}\u2212]*`;
const NICKNAME_CONTENT = String.raw`${NICKNAME_WORD}(?:\s+${NICKNAME_WORD})?`;
/** The groups that a nickname is written in: one word or two between parentheses, brackets or braces. */
const NICKNAME_GROUP_SOURCE = String.raw`\(\s*${NICKNAME_CONTENT}\s*\)|\[\s*${NICKNAME_CONTENT}\s*\]|\{\s*${NICKNAME_CONTENT}\s*\}`;
/** Every nickname group of a text. */
const NICKNAME_GROUPS = new RegExp(NICKNAME_GROUP_SOURCE, "gu");
/** Whether a text holds one. */
const HAS_NICKNAME = new RegExp(NICKNAME_GROUP_SOURCE, "u");
/** The nickname group at a position (the position is `lastIndex`). */
const NICKNAME_AT = new RegExp(NICKNAME_GROUP_SOURCE, "uy");
/** The word at a position: a letter, then up to a blank, a comma, a slash, a semicolon or a parenthesis. */
const WORD_AT = /\p{L}[^\s,;/()]*/uy;
/** An alias mark at a position, as a word of its own. */
const MARK_AT = new RegExp(String.raw`(?:${ALIAS_WORDS})(?=\s|$)`, "iy");

/** The text with the `;` and the blanks at its end taken off, in one pass over them. */
function withoutTrailingBlanks(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === ";" || /\s/u.test(text[end - 1]))) end -= 1;
  return text.slice(0, end);
}

/** The end of the blanks that begin at `at`. */
function skipBlanks(text: string, at: number): number {
  let end = at;
  while (end < text.length && /\s/u.test(text[end])) end += 1;
  return end;
}

/** Where the nickname group that begins at `at` ends, or -1 when none begins there. */
function nicknameGroupEnd(text: string, at: number): number {
  NICKNAME_AT.lastIndex = at;
  const group = NICKNAME_AT.exec(text);
  return group === null ? -1 : at + group[0].length;
}

/**
 * Whether a word stands at `at`: it begins with a letter, and it is no alias mark and no legal form
 * (the word after a nickname is what the nickname splits the name from; a mark or a form ends the
 * name instead).
 */
function wordStartsAt(text: string, at: number): boolean {
  MARK_AT.lastIndex = at;
  if (MARK_AT.test(text)) return false;
  WORD_AT.lastIndex = at;
  const word = WORD_AT.exec(text);
  return word !== null && !hasLegalForm(word[0]) && !LEGAL_FORM_ONLY.test(word[0]);
}

/**
 * Where the nickname that the parenthesis at `open` begins ends, with every nickname group that
 * follows it at once (`Casey (Robin) (Rob) Sample`), or -1 when the parenthesis is no nickname that is
 * read as part of the name: it must be closed, hold a nickname (see `NICKNAME_WORD`), have a text
 * before it and a word after it (no comma, slash, semicolon, alias mark or legal form between).
 */
function nicknameEnd(name: string, open: number): number {
  let end = nicknameGroupEnd(name, open);
  if (end === -1 || skipBlanksBackwards(name, open) < 0) return -1;
  let next = skipBlanks(name, end);
  for (let more = nicknameGroupEnd(name, next); more !== -1; more = nicknameGroupEnd(name, next)) {
    end = more;
    next = skipBlanks(name, end);
  }
  return wordStartsAt(name, next) ? end : -1;
}

/** The index of the last character before `at` that is no blank, or -1. */
function skipBlanksBackwards(text: string, at: number): number {
  let before = at - 1;
  while (before >= 0 && /\s/u.test(text[before])) before -= 1;
  return before;
}

/** A nickname group with no blank next to its marks. */
const compactNickname = (group: string): string =>
  `${group[0]}${group.slice(1, -1).trim()}${group[group.length - 1]}`;

/**
 * The head of a Case Name: what stands before the first parenthesis (a group that is never closed is
 * a group too), without the `;` and the blanks at its end, up to the first dash that separates (a
 * blank, one or two dashes of any script, a blank). Everything the parentheses hold is never read,
 * with one exception: a nickname (`Casey (Robin) Sample`) that has a text before it and a word after
 * it stays in the head, so that the party rule can judge the name without it (see `keptGroups`). A
 * nickname group, in parentheses, brackets or braces, is written with no blank next to its marks, so
 * that an alias mark in it can never split it.
 */
function headOf(name: string): string {
  let end = name.length;
  for (let open = name.indexOf("("); open !== -1;) {
    const after = nicknameEnd(name, open);
    if (after === -1) {
      end = open;
      break;
    }
    open = name.indexOf("(", after);
  }
  const before = withoutTrailingBlanks(name.slice(0, end).trim());
  const cut = before.search(DASH_SEPARATOR);
  const head = withoutTrailingBlanks((cut === -1 ? before : before.slice(0, cut)).trim());
  return head.replace(NICKNAME_GROUPS, compactNickname);
}

/** A word without the dots and the quotation marks at its ends. */
function trimmedWord(word: string): string {
  let start = 0;
  let end = word.length;
  while (start < end && WORD_EDGE.test(word[start])) start += 1;
  while (end > start && WORD_EDGE.test(word[end - 1])) end -= 1;
  return word.slice(start, end);
}

/**
 * A group, as `commaGroupsOf` gives it, without its particles (see `NAME_PARTICLES`): what the
 * person rule is asked about.
 */
function coreOf(group: string): string {
  return group
    .split(/\s+/u)
    .filter((word) => !NAME_PARTICLES.has(trimmedWord(word).toLowerCase()))
    .join(" ");
}

/**
 * A word as the person rule reads it: every quotation mark is taken off it (a quoted word inside a
 * name is a nickname), every dash that is no ASCII hyphen reads as one, and the backtick as an
 * apostrophe. A U+2018 or a U+2019 between two letters is an apostrophe, and anywhere else a
 * quotation mark. The kit reads letters, dots, apostrophes and hyphens only; a digit still makes a
 * piece no person's. The text that is stored is never read through this.
 */
function readableWord(word: string): string {
  const chars = Array.from(word);
  let read = "";
  for (let at = 0; at < chars.length; at += 1) {
    const char = chars[at];
    if (DASH.test(char)) {
      read += "-";
    } else if (SINGLE_MARK.test(char)) {
      if (LETTER.test(chars[at - 1] ?? "") && LETTER.test(chars[at + 1] ?? "")) read += "'";
    } else if (!QUOTATION_MARK.test(char)) {
      read += char === "`" ? "'" : char;
    }
  }
  return read;
}

/**
 * Whether a piece is an estate: it holds `Estate of` as two words (anywhere in it), or it is a name of
 * more than one word that ends in `Estate`. An estate is a person's, whatever else the piece holds.
 */
function isEstate(piece: string): boolean {
  if (ESTATE_OF.test(piece)) return true;
  const words = piece.split(/\s+/u);
  return words.length > 1 && trimmedWord(words[words.length - 1]).toLowerCase() === "estate";
}

/**
 * Whether a piece of a name has the shape of a natural person's, with no legal form: judged without
 * its particles, so that `Casey de la Sample` and `Casey Sample y Robin Sample` are persons', and a
 * legal form that is left still wins; and read as `readableWord` reads it, so that `Casey "Robin"
 * Sample` is a person's too. An estate (see `isEstate`) is a person's, whatever follows.
 */
const isPerson = (piece: string): boolean => {
  if (isEstate(piece)) return true;
  const core = coreOf(piece)
    .split(" ")
    .map(readableWord)
    .filter((word) => word !== "")
    .join(" ");
  return looksLikePerson(core) && !hasLegalForm(core);
};

/**
 * Whether a group is made of legal wording alone (see `LEGAL_WORDING`): every word of it is one, in
 * any case. A word that is only dots and quotation marks is none.
 */
const isLegalWording = (group: string): boolean =>
  group.split(/\s+/u).every((word) => LEGAL_WORDING.has(trimmedWord(word).toLowerCase()));

/**
 * What a group of a comma may begin with to go on with the group before it: `and`, `&` or `+`, then
 * a blank or the end of the group.
 */
const LEADING_JOIN = /^(?:and|&|\+)(?:\s+|$)/i;

/** One group of a party, between two commas. */
interface CommaGroup {
  /** The place of the group among the groups that the commas make, the empty ones counted. */
  id: number;
  /** The group as the name writes it, with the legal form that follows it: what stays when kept. */
  text: string;
  /** The group without a leading `and`, `&` or `+`: what is judged. */
  judged: string;
  /** Whether the name began the group with `and`, `&` or `+`: it goes on with the one before it. */
  joined: boolean;
  /** Whether the group was cut at the parenthesis of a nickname (see `commaGroupsOf`). */
  cut: boolean;
}

/**
 * The groups of a party. The party is split at its commas. A group that begins with `and`, `&` or
 * `+` is judged without that word and goes on with the group before it, so that `Examplecorp Inc.,
 * and Casey Sample` is judged as `Examplecorp Inc. and Casey Sample` is; a group that is nothing
 * but that word is left out. A group that is only a legal form is joined to the group before it
 * (`Examplecorp, Inc.` is one).
 *
 * A party can hold a nickname (see `headOf`) and is read in two ways. As it is written (`named` is
 * false), a group is cut at the parenthesis of its nickname, as every name was before the nickname
 * was read: `Casey (Robin) Sample` is `Casey`, and the legal form that follows such a group belongs to
 * what was cut off, to no group. As it is named, every nickname group is left out of the text:
 * `Casey (Robin) Sample` is `Casey Sample`. The two readings have the same ids.
 */
function commaGroupsOf(party: string, named: boolean): CommaGroup[] {
  const groups: CommaGroup[] = [];
  for (const [id, raw] of party.split(",").entries()) {
    const open = named ? -1 : raw.indexOf("(");
    const text = (
      named ? raw.replace(NICKNAME_GROUPS, " ") : open === -1 ? raw : raw.slice(0, open)
    ).trim();
    const judged = text.replace(LEADING_JOIN, "");
    if (judged === "") continue;
    const previous = groups[groups.length - 1];
    if (previous !== undefined && LEGAL_FORM_ONLY.test(judged)) {
      if (!previous.cut) {
        previous.text += `, ${text}`;
        previous.judged += `, ${judged}`;
      }
    } else {
      groups.push({ id, text, judged, joined: judged !== text, cut: open !== -1 });
    }
  }
  return groups;
}

/**
 * Whether a group holds a person: one of the pieces that an `and`, an `&` or a `+` joins has a
 * person's shape.
 */
const holdsPerson = (judged: string): boolean =>
  judged
    .split(AND_JOIN)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== "")
    .some(isPerson);

/**
 * Whether a group is one word, once its particles are out, that is no legal form (of the kit or of
 * this rule) and has none: a surname or a brand. A group of particles alone is a bare word too, as
 * the one-word group that it was before the particles were taken out.
 */
const isBareWord = (judged: string): boolean => {
  const core = coreOf(judged);
  return !/\s/u.test(core) && !hasLegalForm(core) && !LEGAL_FORM_ONLY.test(core);
};

/**
 * Whether a group begins with a bare word: the first piece of it, of those that an `and`, an `&` or a
 * `+` joins, and before the legal form that was merged into it (`commaGroupsOf`): `Casey`, `Casey
 * and Examplecorp Inc.` and `Casey, LLC` begin with one.
 */
const beginsWithBareWord = (judged: string): boolean =>
  isBareWord(judged.split(",")[0].split(AND_JOIN)[0].trim());

/**
 * The groups of a party without the given names of its persons, and without what follows them. A
 * group that holds a person (a surname of two to four words, a suffix, a particle that is not taken
 * out, an estate) is followed by the given name in the shape `Last, First`: the group that stands
 * next to it and begins with a bare word is that name and goes whole, and every group after it goes
 * with it, those that an `and`, an `&` or a `+` joins (the unit goes, as the unit rule says) and
 * those that a plain comma puts after it. A group is dropped whole and is never cut: a firm can be
 * named as a bare word, a comma and the rest of its name (`Gardens, and Tools, Inc.`, `Brightzorb,
 * Quillon and Co.`), and what is left of it once the bare word is out (`Tools, Inc.`, `Quillon and
 * Co.`) is a name with its front cut off, a key that can match another vendor. What stands before the
 * person stays.
 */
function withoutGivenNames(groups: CommaGroup[], person: boolean[]): CommaGroup[] {
  const left: CommaGroup[] = [];
  let cut = false;
  for (let at = 0; at < groups.length; at += 1) {
    const group = groups[at];
    cut = cut || (!group.joined && at > 0 && person[at - 1] && beginsWithBareWord(group.judged));
    if (!cut) left.push(group);
  }
  return left;
}

/**
 * The groups of a party that are kept, as the text the name writes; none when the party is dropped
 * whole. Every rule here fails closed: a company is lost rather than a person kept.
 *
 * The shape `Last, First`: a bare word that is followed by another bare word (`Sample, Casey`) or by
 * a group that the person rule drops (`SAMPLE, CASEY J`, the same shape with a middle name or an
 * initial) drops the whole party. The groups are those of `commaGroupsOf`, so that the legal form of
 * a group is not a bare word of its own (`Gardens, and Tools, Inc.` is one firm of two groups, the
 * second not a bare word). A company named as two one-word brands in a row (`Alpha, Beta`) is
 * dropped by design.
 *
 * The same shape with a surname that is no bare word (`Sample Lee, Casey`, `Van Sample, Casey`,
 * `Sample Jr., Casey`, `de la Sample Lee, Casey`): the group that holds the person is dropped as any
 * is (see below), and the group next to it that begins with a bare word is its given name and goes
 * whole, with everything that follows it (`withoutGivenNames`). The company that stands before the
 * person stays (`Examplecorp Inc., Sample Lee, Casey` stores `Examplecorp Inc.`); the company that
 * follows the given name is lost, whether an `and` or a plain comma puts it there (`Sample Lee,
 * Casey and Examplecorp Inc.` and `Sample Lee, Casey, Examplecorp Inc.` store nothing). It is not cut
 * out of the party, because the same shape is a firm named as a bare word, a comma and the rest of
 * its name (`Casey Sample, Gardens, and Tools, Inc.`, `Casey Sample, Brightzorb, Quillon and Co.`), and
 * `Tools, Inc.` is a name with its front cut off. A word of legal wording after the person counts as
 * the bare word here (`Casey Sample, individually, Examplecorp Inc.` stores nothing). The whole party
 * goes for a bare surname, as above.
 *
 * Otherwise a group that holds a person is dropped, with the groups that an `and`, an `&` or a `+`
 * joins to it: a person in `Examplecorp Inc., and Casey Sample` drops the company as it does in
 * `Examplecorp Inc. and Casey Sample`, while a group of a plain comma is dropped alone
 * (`Examplecorp Inc., Casey Sample` keeps the company).
 *
 * A group made of legal wording alone (`individually`, `jointly and severally`, see
 * `LEGAL_WORDING`) is no party and is left out. After a bare word it is the shape `Last, First` as
 * well, whatever its length: `Sample, individually` and `Sample, jointly and severally` drop the
 * party. It is judged for a person as any group is, and the words of wording can have a person's
 * shape (`its successors`): a group that an `and` goes on with then drops its whole unit, as
 * before.
 */
function survivingGroups(written: CommaGroup[]): CommaGroup[] {
  const writtenWording = written.map((group) => isLegalWording(group.judged));
  const writtenPerson = written.map((group) => holdsPerson(group.judged));
  for (let at = 1; at < written.length; at += 1) {
    if (
      isBareWord(written[at - 1].judged) &&
      (writtenWording[at] || isBareWord(written[at].judged) || writtenPerson[at])
    ) {
      return [];
    }
  }
  const groups = withoutGivenNames(written, writtenPerson);
  const wording = groups.map((group) => isLegalWording(group.judged));
  const person = groups.map((group) => holdsPerson(group.judged));
  const kept: CommaGroup[] = [];
  let start = 0;
  while (start < groups.length) {
    let end = start + 1;
    while (end < groups.length && groups[end].joined) end += 1;
    if (!person.slice(start, end).includes(true)) {
      for (let at = start; at < end; at += 1) {
        if (!wording[at]) kept.push(groups[at]);
      }
    }
    start = end;
  }
  return kept;
}

/**
 * The groups of a party that are kept, as the text the name writes. A party that holds a nickname
 * (`Casey (Robin) Sample`, see `headOf`) is judged twice, over the same groups: as it was always read
 * (every group cut at its parenthesis, as far as the last group that a parenthesis cuts: `Casey`; the
 * groups that follow it were never read) and as it is named (`Casey Sample`, every group read). A
 * group stays only if both readings keep it, and what is stored is the group as it was written, cut
 * at the parenthesis, so that the text of every group that a parenthesis cuts is judged as it is
 * stored and the person rule is never weaker than it was (`Mary Ann (Robin) Casey Lee Sample` has
 * five words, which have no shape, and `Mary Ann` is a person, in the first group of a name and in
 * a later one). Nothing that follows a parenthesis is stored but the groups that the commas leave
 * whole after the last one; they hold no parenthesis and are judged as named and, each alone, as
 * written (a bracket that holds a nickname is in the text that is stored: `Mary Ann and [Robin]`).
 */
function keptGroups(party: string): string[] {
  const written = commaGroupsOf(party, false);
  if (!HAS_NICKNAME.test(party)) return survivingGroups(written).map((group) => group.text);
  const cutAt = written.map((group) => group.cut).lastIndexOf(true);
  const asWritten = new Set(
    survivingGroups(cutAt === -1 ? written : written.slice(0, cutAt + 1)).map((group) => group.id),
  );
  const asNamed = new Set(survivingGroups(commaGroupsOf(party, true)).map((group) => group.id));
  return written
    .filter(
      (group, at) =>
        asNamed.has(group.id) &&
        (asWritten.has(group.id) ||
          (cutAt !== -1 && at > cutAt && survivingGroups([group]).length > 0)),
    )
    .map((group) => group.text);
}

/** The parties of one segment of the head that are kept, in order. */
function partiesOf(segment: string): string[] {
  const parties: string[] = [];
  for (const piece of segment.split(PARTY_SEPARATOR)) {
    let party = piece.trim();
    if (party === "") continue;
    if (ET_AL.test(party)) {
      // `et al` stands for parties that the case does not name: it is dropped, and a party without a
      // legal form that led the case is dropped with it (it is mostly a person).
      party = party.replace(ET_AL, "").trim();
      if (!hasLegalForm(party)) continue;
    }
    const kept = keptGroups(party);
    if (kept.length > 0) parties.push(kept.join(", "));
  }
  return parties;
}

/**
 * A name with its acute accents read as apostrophes (some names write the apostrophe so). NFKC, which
 * cleans every cell, turns the accent into a blank and a combining acute, so that the rule is given
 * that: the blank and the mark read as the apostrophe too. A name that holds either is stored with
 * the apostrophe.
 */
const withApostrophes = (name: string): string =>
  name.split(ACUTE_ACCENT).join("'").replace(BLANK_COMBINING_ACUTE, "'");

/**
 * The parties of a Case Name that stay, as the party rule reads it. `name` is a cell as `lineOf`
 * gives it. The head (see `headOf`) is split at ` d/b/a `, ` f/k/a `, ` a/k/a `, ` n/k/a `,
 * ` t/a `, ` dba `, ` aka `, ` doing business as ` and ` trading as `: the first segment holds the
 * principal parties, the others the alias parties. Each segment is split at a slash or a semicolon, and each party
 * loses its `et al`, is dropped when it is a person's (see `keptGroups`) and is otherwise written
 * as its kept groups, joined with a comma.
 *
 * The row's entities are its principal parties; when it has none (the defendant is a person), the
 * first party of a business mark (`d/b/a`, `dba`, `t/a`, `doing business as`, `trading as`) is
 * promoted, and the parties of the other marks (`a/k/a`, `aka`, `f/k/a`, `n/k/a`) are dropped with the
 * person, unless they follow a business that is promoted. The alias parties are names of the first
 * entity.
 */
export function ftcPenaltyPartiesOf(name: string): FtcPenaltyParties {
  const [principal = "", ...marked] = headOf(withApostrophes(name)).split(ALIAS_MARK);
  const entities = partiesOf(principal);
  // The split gives each mark and then the segment it opens.
  const segments: Array<{ business: boolean; parties: string[] }> = [];
  for (let at = 0; at + 1 < marked.length; at += 2) {
    segments.push({ business: BUSINESS_MARK.test(marked[at]), parties: partiesOf(marked[at + 1]) });
  }
  if (entities.length > 0)
    return { entities, aliases: segments.flatMap((segment) => segment.parties) };
  // Every principal party is dropped: the defendant is a person. The business that it trades under is
  // promoted, and a name that it goes by is not: it is the person's own, and is dropped with it. A
  // name that follows a business that is promoted is the business's, as it has always been.
  const promoted: string[] = [];
  let owned = false;
  for (const segment of segments) {
    if (segment.business) {
      promoted.push(...segment.parties);
      owned = segment.parties.length > 0;
    } else if (owned) {
      promoted.push(...segment.parties);
    }
  }
  const [first, ...rest] = promoted;
  return first === undefined ? { entities: [], aliases: [] } : { entities: [first], aliases: rest };
}

/** One order of a defendant, as the body keeps it: its newest orders are shown by a record. */
export interface FtcPenaltyOrder {
  caseNumber: string;
  /** The day of the order, YYYY-MM-DD. */
  day: string;
  /** The ordered amount in dollars (with cents when the sheet has them); null when the sheet states none. */
  amount: number | null;
  /** The basis of the case, as the FTC writes it; empty when the sheet has none. */
  basis: string;
}

/** One defendant company: the row of the body, and what a record is made of. */
export interface FtcPenaltyRow {
  /** The compact name of the party without its legal form. */
  id: string;
  /** The spelling of the party that the most orders use. */
  display: string;
  /** The names a vendor may match the record by: the spellings, the aliases and the label of a host. */
  names: string[];
  /** The distinct orders: a case number and a day each. */
  orders: number;
  firstYear: number;
  lastYear: number;
  /** The ordered amounts of the orders that state one, added and rounded to whole dollars. */
  total: number;
  /** The orders that state no amount. */
  noAmount: number;
  /** The newest three orders, the newest first. */
  newest: FtcPenaltyOrder[];
  /** The case numbers of the newest orders, each once, the newest first, at most ten. */
  cases: string[];
  /** The day of the newest order. */
  publishedAt: string;
}

/** What the amount cell of a row is: a dash for none, a sum in cents, or no amount at all. */
type Amount = { kind: "none" } | { kind: "cents"; cents: number } | { kind: "invalid" };

/** The amount of a cell: the dash that the sheet writes for none, or a number of dollars, in cents. */
function amountOf(cell: string): Amount {
  const text = lineOf(cell, AMOUNT_CELL_MAX);
  if (text === "-") return { kind: "none" };
  if (!AMOUNT.test(text)) return { kind: "invalid" };
  return { kind: "cents", cents: Math.round(Number(text) * 100) };
}

/** The day of a cell: an Excel serial of the 1900 system, with no time of the day; null for any other text. */
function dayOfCell(cell: string): string | null {
  const text = lineOf(cell, DATE_CELL_MAX);
  return SERIAL.test(text) ? dayOfExcelSerial(Number(text)) : null;
}

/** One row of the sheet that could be read. */
interface CaseLine {
  caseNumber: string;
  name: string;
  /** The ordered amount in cents; null for none. */
  cents: number | null;
  day: string;
  basis: string;
}

/**
 * The cells of a row as the six columns: the empty cells at its end are not cells, a cell after the
 * sixth that holds anything makes the row another width, and a row of fewer cells is padded.
 */
function sixCellsOf(row: readonly string[]): readonly string[] | null {
  let width = row.length;
  while (width > 0 && row[width - 1] === "") width -= 1;
  if (width > COLUMNS) return null;
  const cells = row.slice(0, width);
  while (cells.length < COLUMNS) cells.push("");
  return cellsOf(cells, COLUMNS);
}

/** The case of a row, or null when one of the cells it reads is not in its form. */
function caseLineOf(row: readonly string[]): CaseLine | null {
  const cells = sixCellsOf(row);
  if (cells === null) return null;
  const number = CASE_NUMBER.exec(lineOf(cells[0], NUMBER_CELL_MAX));
  const name = lineOf(cells[1], NAME_MAX);
  // A name that was cut is not the name of a defendant.
  if (number === null || name === "" || name.endsWith(SHORTENED)) return null;
  const amount = amountOf(cells[3]);
  const day = dayOfCell(cells[4]);
  if (amount.kind === "invalid" || day === null) return null;
  return {
    caseNumber: number[1],
    name,
    cents: amount.kind === "cents" ? amount.cents : null,
    day,
    basis: lineOf(cells[5], BASIS_MAX),
  };
}

const isBlank = (row: readonly string[]): boolean => row.every((cell) => cell === "");

/** Whether the first row is the header of the list: the six names, and nothing after them. */
function isHeader(row: readonly string[] | undefined): boolean {
  if (row === undefined) return false;
  for (let at = 0; at < COLUMNS; at += 1) if ((row[at] ?? "") !== HEADER[at]) return false;
  for (let at = COLUMNS; at < row.length; at += 1) if (row[at] !== "") return false;
  return true;
}

/**
 * Whether the footer states the rows that were read: nothing but the count of the cases in the
 * second column and their sum in the fourth. The sum is compared in cents, to the cent, with the
 * amounts that are numbers (a spreadsheet's sum leaves the rest out) of every row of the sheet, the
 * rows that cannot be read included.
 */
function footerAddsUp(footer: readonly string[], data: readonly (readonly string[])[]): boolean {
  for (const at of [0, 2, 4, 5]) if ((footer[at] ?? "") !== "") return false;
  for (let at = COLUMNS; at < footer.length; at += 1) if (footer[at] !== "") return false;
  if ((footer[1] ?? "") !== String(data.length)) return false;
  const stated = lineOf(footer[3] ?? "", AMOUNT_CELL_MAX);
  if (!FOOTER_SUM.test(stated)) return false;
  const statedCents = Math.round(Number(stated) * 100);
  let cents = 0;
  for (const row of data) {
    const amount = amountOf(row[3] ?? "");
    if (amount.kind === "cents") cents += amount.cents;
  }
  return Number.isSafeInteger(statedCents) && Number.isSafeInteger(cents) && cents === statedCents;
}

/**
 * The rows of the cases of a sheet, or null when it is not the list: the header, then the cases up to
 * the first row with no case number, then blank rows, then the footer, which is the last row that
 * holds anything and adds up (`footerAddsUp`).
 */
function casesOf(rows: readonly (readonly string[])[]): readonly (readonly string[])[] | null {
  if (!isHeader(rows[0])) return null;
  let last = rows.length - 1;
  while (last > 0 && isBlank(rows[last])) last -= 1;
  if (last < 2) return null;
  let end = 1;
  while (end < last && (rows[end][0] ?? "") !== "") end += 1;
  // Between the last case and the footer there are blank rows or none.
  for (let at = end; at < last; at += 1) if (!isBlank(rows[at])) return null;
  const data = rows.slice(1, end);
  return footerAddsUp(rows[last], data) ? data : null;
}

/** One order of an entity while the rows are collected: the rows that give its amount and its basis. */
interface OrderGroup {
  caseNumber: string;
  day: string;
  rows: Array<{ cents: number | null; basis: string }>;
}

/** An entity while the rows are collected. */
interface Group {
  orders: Map<string, OrderGroup>;
  /** Each spelling of a party (whole, cleaned) and the orders that use it. */
  spellings: Map<string, Set<string>>;
  /** Each alias party and the orders that use it. */
  aliases: Map<string, Set<string>>;
}

/**
 * The id of a party: its compact name without the legal form, as it is when it has ID_MAX units or
 * fewer. A longer name is cut, and a cut alone would give one id to two parties whose names differ
 * only after it (their orders would be one entity), so the id is its first ID_KEPT units, a tilde
 * and the first 16 hex digits of the SHA-256 of the WHOLE compact name. A tilde is in no compact
 * name (letters and digits), so such an id is never one of a name that was not cut. It is a function
 * of the compact name alone, so no order of the rows changes it. A party whose name has fewer than
 * four letters and digits once the legal form is taken off is no entity (as for ftc_competition):
 * 294 entities were measured on today's file with this rule and 297 without it (the person
 * rules leave 293).
 */
function idOf(party: string): string | null {
  const short = compactName(shortName(party));
  if (short.length < MIN_NAME_CHARS) return null;
  if (short.length <= ID_MAX) return short;
  const digest = createHash("sha256").update(short, "utf8").digest("hex").slice(0, ID_HASH_DIGITS);
  return `${cutAtCodePoint(short, ID_KEPT)}~${digest}`;
}

function note(map: Map<string, Set<string>>, text: string, order: string): void {
  const orders = map.get(text);
  if (orders === undefined) map.set(text, new Set([order]));
  else orders.add(order);
}

/** The entities of the cases, each with the orders that name it; rows without a defendant company count for none. */
function groupsOf(lines: readonly CaseLine[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const line of lines) {
    const { entities, aliases } = ftcPenaltyPartiesOf(line.name);
    const kept: Array<{ id: string; party: string }> = [];
    for (const party of entities) {
      const id = idOf(party);
      if (id !== null) kept.push({ id, party });
    }
    if (kept.length === 0) continue;

    const orderKey = `${line.caseNumber} ${line.day}`;
    // A row that names two spellings of one company counts once for it.
    for (const id of new Set(kept.map((entity) => entity.id))) {
      let group = groups.get(id);
      if (group === undefined) {
        group = { orders: new Map(), spellings: new Map(), aliases: new Map() };
        groups.set(id, group);
      }
      let order = group.orders.get(orderKey);
      if (order === undefined) {
        order = { caseNumber: line.caseNumber, day: line.day, rows: [] };
        group.orders.set(orderKey, order);
      }
      order.rows.push({ cents: line.cents, basis: line.basis });
    }
    for (const { id, party } of kept) note((groups.get(id) as Group).spellings, party, orderKey);
    // The aliases are names of the first company of the row.
    const first = groups.get(kept[0].id) as Group;
    for (const alias of aliases) note(first.aliases, alias, orderKey);
  }
  return groups;
}

/** An order with its amount in cents, as the rows of the order give it. */
interface OrderOf {
  caseNumber: string;
  day: string;
  cents: number | null;
  basis: string;
}

/**
 * The order of the rows that share a case number and a day: the amount is the largest that its rows
 * state (the rows of an order repeat or split the amount, and are never added), and the basis is
 * that of the row that states it (the first by the order of the text when two do, and when no row
 * states an amount, the first of all), the rows with no basis left out of the choice.
 */
function orderOf(group: OrderGroup): OrderOf {
  let largest: number | null = null;
  for (const row of group.rows) {
    if (row.cents !== null && (largest === null || row.cents > largest)) largest = row.cents;
  }
  const bases = group.rows
    .filter((row) => row.cents === largest)
    .map((row) => row.basis)
    .filter((basis) => basis !== "")
    .sort(compareText);
  return { caseNumber: group.caseNumber, day: group.day, cents: largest, basis: bases[0] ?? "" };
}

/** The newer order first; on one day the greater case number first, so that no order of the rows decides. */
const compareOrders = (a: OrderOf, b: OrderOf): number =>
  compareText(b.day, a.day) || compareText(b.caseNumber, a.caseNumber);

/** The texts of a map by the orders that use them, the most first; on a tie, by the order of the text. */
const rankedTexts = (map: ReadonlyMap<string, ReadonlySet<string>>): string[] =>
  [...map]
    .sort(([a, ordersA], [b, ordersB]) => ordersB.size - ordersA.size || compareText(a, b))
    .map(([text]) => text);

/** The label of a spelling that is a host (`Examplehost.com, Inc.` is `Examplehost`), when it can be a key. */
function hostLabelOf(spelling: string): string[] {
  const short = shortName(spelling);
  if (!HOST_NAME.test(short)) return [];
  const label = short.slice(0, short.lastIndexOf("."));
  return compactName(label).length >= MIN_NAME_CHARS ? [label] : [];
}

/** The entity of a group. */
function rowOf(id: string, group: Group): FtcPenaltyRow {
  const orders = [...group.orders.values()].map(orderOf).sort(compareOrders);
  let totalCents = 0;
  let noAmount = 0;
  for (const order of orders) {
    if (order.cents === null) noAmount += 1;
    else totalCents += order.cents;
  }
  const newest = orders[0];
  const oldest = orders[orders.length - 1];

  const spellings = rankedTexts(group.spellings);
  const shown = spellings.slice(0, SPELLINGS_KEPT);
  const names = new Set([
    ...shown,
    ...rankedTexts(group.aliases).slice(0, ALIASES_KEPT),
    ...shown.flatMap(hostLabelOf),
  ]);
  return {
    id,
    display: withoutAngles(lineOf(spellings[0], DISPLAY_MAX)),
    names: [...names],
    orders: orders.length,
    firstYear: Number(oldest.day.slice(0, 4)),
    lastYear: Number(newest.day.slice(0, 4)),
    total: Math.round(totalCents / 100),
    noAmount,
    newest: orders.slice(0, NEWEST_KEPT).map((order) => ({
      caseNumber: order.caseNumber,
      day: order.day,
      amount: order.cents === null ? null : order.cents / 100,
      basis: order.basis,
    })),
    cases: distinct(
      orders.map((order) => order.caseNumber),
      CASES_KEPT,
    ),
    publishedAt: newest.day,
  };
}

/**
 * The defendant companies of the workbook: null when it is not the list. The sheet is the list only
 * when its header is the six names, its footer adds up, and it holds at least MIN_ROWS cases of which
 * the first is of 2000 or before. A row whose cells are not in their form is counted as one that could
 * not be read; a row whose defendants are all persons (or that has no company with a name that could
 * be a key) is dropped here, before anything is stored, and is neither. A natural person is never
 * copied.
 */
function read(fetched: Fetched): ReadResult<FtcPenaltyRow> | null {
  const book = fetched.buffers[0];
  if (book === undefined) return null;
  const table = readSheetTable(book, SHEET, SHEET_LIMITS);
  if (table === null) return null;
  if (!table.complete) return { rows: [], total: 0, unreadable: 0, complete: false };

  const data = casesOf(table.rows);
  if (data === null || data.length < MIN_ROWS) return null;
  let earliest: string | null = null;
  for (const row of data) {
    const day = dayOfCell(row[4] ?? "");
    if (day !== null && (earliest === null || day < earliest)) earliest = day;
  }
  if (earliest === null || earliest > LATEST_FIRST_DAY) return null;

  let unreadable = 0;
  const lines: CaseLine[] = [];
  for (const row of data) {
    const line = caseLineOf(row);
    if (line === null) unreadable += 1;
    else lines.push(line);
  }
  const rows = [...groupsOf(lines)].map(([id, group]) => rowOf(id, group));
  // The rows of the sheet are counted as the footer counts them; a row with several companies may
  // make more entities than the sheet has rows, and the total is never below what was read.
  return {
    rows,
    total: Math.max(data.length, rows.length + unreadable),
    unreadable,
    complete: table.complete,
  };
}

/** The address of the workbook that the catalogue gives for the dataset; not the list when it gives none or two. */
function workbookUrlOf(catalogue: unknown): string {
  if (!isObject(catalogue) || !Array.isArray(catalogue.dataset)) throw new NotTheListError();
  const datasets: unknown[] = catalogue.dataset.filter(
    (dataset): boolean => isObject(dataset) && dataset.title === DATASET_TITLE,
  );
  const dataset = datasets[0];
  if (datasets.length !== 1 || !isObject(dataset) || !Array.isArray(dataset.distribution)) {
    throw new NotTheListError();
  }
  const urls: string[] = [];
  for (const distribution of dataset.distribution as unknown[]) {
    const url = isObject(distribution) ? distribution.downloadURL : undefined;
    if (typeof url !== "string") continue;
    const match = WORKBOOK_URL.exec(url);
    if (match !== null && Number(match[1]) >= FIRST_FISCAL_YEAR) urls.push(url);
  }
  if (urls.length !== 1) throw new NotTheListError();
  return urls[0];
}

/**
 * The catalogue, a pause of the 5 seconds that the FTC asks for, and then the workbook that the
 * catalogue names. Both are asked with no validators, so a 304 is no answer; every answer comes from
 * the pinned host and no body is cut (`pinnedFetch`). The catalogue must answer at its own path: a
 * redirect to another page of the host is not the catalogue. Nothing is waited for, and the
 * workbook is not asked, when the catalogue does not name it.
 */
async function fetchFiles(fetch: ConnectorFetch, sleep: Sleep): Promise<Fetched> {
  const catalogue = await pinnedFetch(fetch, CATALOGUE_PIN)(CATALOGUE_URL, {}, CATALOGUE_LIMITS);
  if (catalogue.notModified) throw new FetchError("unreachable");
  // The error holds no address: it can carry a token.
  if (new URL(catalogue.url).pathname !== CATALOGUE_PATH) throw new FetchError("not_allowed");
  const text = textOf(
    {
      buffers: [catalogue.body],
      contentTypes: [catalogue.contentType],
      etag: null,
      lastModified: null,
      bytes: catalogue.body.length,
    },
    0,
  );
  const url = workbookUrlOf(jsonOf(text));

  await pauseFor("www.ftc.gov", sleep);
  const workbook = await pinnedFetch(fetch, WORKBOOK_PIN)(url, {}, WORKBOOK_LIMITS);
  if (workbook.notModified) throw new FetchError("unreachable");
  return {
    buffers: [workbook.body],
    contentTypes: [workbook.contentType],
    // Nothing is stored to compare with: the sync's hash of the body tells an unchanged list.
    etag: null,
    lastModified: null,
    bytes: catalogue.body.length + workbook.body.length,
  };
}

/** `1234567` as `1,234,567`, in no locale. */
const thousands = (number: number): string => String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** An amount of dollars as US$ with its thousands set off, and its cents only when it has some. */
function dollarsOf(amount: number): string {
  const cents = Math.round(amount * 100);
  const rest = cents % 100;
  return `US$${thousands(Math.floor(cents / 100))}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${FTC_PENALTIES_RECORD_MARK} (${HOST}), an enforcement or case list.`;

/**
 * The last sentence of every record: what an order on the list is and is not, and that the FTC does
 * not endorse the record. It is never cut and never left out.
 */
const CLOSING =
  "The entry is the FTC's record of an order against a defendant of this name, which may be " +
  "another company of the same name; it is not a finding about the vendor's current practices. " +
  "Not endorsed by the FTC; adapted by VerifyWise.";

/** One of the newest orders: the day, the case, the basis and the amount. */
function entryOf(order: FtcPenaltyOrder): string {
  return [
    order.day,
    `case ${order.caseNumber}`,
    lineOf(order.basis, BASIS_SHOWN),
    order.amount === null ? "no amount stated" : `ordered ${dollarsOf(order.amount)}`,
  ]
    .filter((part) => part !== "")
    .join(", ");
}

/** What the list holds of the defendant: how many orders, when, and for how much. */
function countSentenceOf(row: FtcPenaltyRow): string {
  const orders = `${row.orders} order${row.orders === 1 ? "" : "s"}`;
  const years =
    row.firstYear === row.lastYear ? `${row.lastYear}` : `${row.firstYear} to ${row.lastYear}`;
  const total = row.total > 0 ? `, ordered amounts totalling US$${thousands(row.total)}` : "";
  return `The US Federal Trade Commission's list of consumer protection civil penalty cases holds ${orders} naming it, dated ${years}${total}.`;
}

/**
 * The text of a record: the list and its kind (S1), the defendant (S2), what the list holds of it
 * (S3), the newest orders (S4) and the closing sentence. It is the whole when it fits in `max`;
 * otherwise the newest orders are dropped from the end, the third and then the second, and then the
 * name of the defendant is cut; the closing sentence is never cut, so that `recordOf` never has to
 * cut it. (With the caps of the fields the text is at most about 1,050 characters, so this is the
 * safety net of a cap that is raised.)
 */
export function ftcPenaltiesSummaryOf(
  row: FtcPenaltyRow,
  max: number = RECORD_SUMMARY_MAX,
): string {
  const entries = row.newest.map(entryOf);
  const sentencesOf = (display: string, shown: number): string[] => [
    FIRST_SENTENCE,
    sentence("Defendant", display),
    countSentenceOf(row),
    shown === 0 ? "" : sentence("Newest", entries.slice(0, shown).join("; ")),
  ];
  const textOfShown = (display: string, shown: number): string =>
    joinSentences([...sentencesOf(display, shown), CLOSING]);

  const least = Math.min(1, entries.length);
  for (let shown = entries.length; shown >= least; shown -= 1) {
    const text = textOfShown(row.display, shown);
    if (text.length <= max) return text;
  }
  for (let room = row.display.length - 1; room >= 1; room -= 1) {
    const text = textOfShown(shorten(row.display, room), least);
    if (text.length <= max) return text;
  }
  return summaryWithClosing(sentencesOf(row.display, least), CLOSING, max);
}

/**
 * The record of a defendant company. The title and the summary show the display, which is cut at
 * DISPLAY_MAX; the identifier is never a cut text, so it holds the first spelling of the defendant
 * whole (a name is read to NAME_MAX units), and the kit takes the angle brackets out of it.
 */
function recordFor(row: FtcPenaltyRow): ParsedRecord {
  return recordOf({
    id: row.id,
    type: "civil_penalty_summary",
    title: `${FTC_PENALTIES_RECORD_MARK}: ${row.display}`,
    summary: ftcPenaltiesSummaryOf(row),
    // The catalogue that names the dataset, with the defendant: the evidence ledger keeps one record for an address.
    url: `${RECORD_URL}${encodeURIComponent(row.id)}`,
    identifiers: { defendant: row.names[0] ?? row.display, cases: row.cases },
    names: row.names,
    publishedAt: row.publishedAt,
    sourceUpdatedAt: null,
  });
}

/**
 * The connector, with the pause between the two requests injectable: a test hands it a sleep that
 * does not wait.
 */
export function createFtcPenaltiesConnector({
  sleep = realSleep,
}: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<FtcPenaltyRow>({
    id: "ftc_penalties",
    version: 1,
    root: SHEET,
    sortKey: (row) => row.id,
    fetchFiles: (fetch) => fetchFiles(fetch, sleep),
    read,
    toRecords: (rows) => rows.map(recordFor),
    sourceVersion: (rows) =>
      rows.reduce<string | null>(
        (latest, row) => (latest === null || row.publishedAt > latest ? row.publishedAt : latest),
        null,
      ),
  });
}

export const ftcPenaltiesConnector: Connector = createFtcPenaltiesConnector();
