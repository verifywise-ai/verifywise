/**
 * The data breach list of the California Attorney General as a mirrored list of the vendor risk
 * database: the one CSV export of oag.ca.gov/privacy/databreach/list (organisation, breach dates,
 * reported date), the Department's own table, which it considers in the public domain. The sample
 * notices behind each row were written by the breached organisations: they are never fetched,
 * linked or copied. A record is one organisation, with the number of notices it filed, the first
 * and the last day it reported, and the newest three notices. It is a list entry and no finding: the
 * named party is the one that FILED the notice, which can be a service provider acting for the
 * breached business, and the list says neither how many people were affected nor what data.
 *
 * The file: every cell quoted, a quote inside a cell written twice, lines that end in CRLF, a header
 * whose second name has two spaces before its bracket, and dates in the American order
 * (`mm/dd/yyyy`: `dayOf` of the kit reads the other order and is never used here). It is read once,
 * whole, from the front (`readCsvText`), and it is the list only when
 *
 * - its header is the three names of the export, once their white space is one blank and their case
 *   is lower (a changed header is a changed format, and the connector says so),
 * - it does not end inside a quote (a cut file is no list), and has at least 4,000 data rows and an
 *   earliest report on or before 2012-12-31 (the list begins in 2012: a file that begins later has
 *   lost its start). A file of more than 50,000 data rows, or with a row of more than 16 cells, was
 *   not read to its end, and the download fails as too large (`complete`) and never gives part of
 *   the list.
 *
 * Natural persons: a row whose name has the shape of a person's practice or of a person (rule P: a
 * leading Dr., a leading Law Office(s) of, a credential after the last comma or as the last word of
 * a name of three words or more; rule M: "First M. Last") is dropped in `read`, before anything is
 * stored: its name and its dates are never copied, and it is neither a row that could not be read
 * nor an error (`californiaPracticeRule` and `CALIFORNIA_MIDDLE_INITIAL_NAME` of kit/persons.ts,
 * measured on the real list). The rules read a name as a whole, and a person can be named in a part
 * of one: "First M. Last d/b/a Business", "Business d/b/a Dr. Last", "Business (First M. Last)",
 * "First M. Last (dba Business)". So each part of a name is judged on its own before the name is
 * used (`withoutPersons`): the parts that an alias mark sets apart, the text inside each pair of
 * parentheses and the text outside them. A part with the shape of a person is cut out of the name,
 * with the mark or the parentheses that held it; the spelling of the row is what remains (the
 * parts that remain, joined by the marks that stood before them; when the person is the text
 * outside the parentheses, the text inside them), and the name as it was written, which holds the
 * person, is never an id, a display, a title, a part of the text, an identifier or a key. Brackets
 * that do not pair up one to one (a pair inside a pair, a bracket never closed or never opened)
 * cannot be taken apart with certainty: a person in the text between any two of them, or in the
 * part with its brackets taken out, takes the whole part with it. An alias mark that opens a pair
 * ("(dba First M. Last)") has no blank before it, so it splits nothing, and rule M, which reads a
 * name from its first letter, would not see the person behind the mark: the text of a pair, and the
 * text between two brackets that do not pair up, is judged as it is and again with the marks that
 * open it taken off (`isPersonInside`), so a mark never hides a person. Measured on the real list:
 * 36 names have a mark right after a bracket, and none of them has a person's name after it. When
 * nothing remains the row is dropped, like a row of a person. A name with no part of a person is the
 * name as it is.
 *
 * A person's practice can also be written as the pieces of one name, behind a comma and a blank or
 * an ampersand with a blank each side ("First M. Last, Trade Name", "Trade Name & Dr. Last"). When
 * a piece of the name that remains has the shape of a person (`isPerson`) and no word of the name is
 * a legal form or a word of an organisation, the row is dropped like a row of a person, and counted
 * as nothing (`isPersonsPractice`). The words are those of the kit's lists, in any case, with the
 * marks round them and the dots of a legal form off ("L.L.P." is "llp"); the words of the list of
 * organisation words that only join the parts of a name ("&", "and", "of", the particles of Spanish,
 * the marks of an alias) are no words of an organisation, or every practice would hold one. Measured
 * on the real list: 28 names have such a piece and are no person's as a whole, 6 of them are
 * dropped, all behind a comma, and the 22 that stay carry a legal form or a word of an
 * organisation, which is the cost of the rule (a family firm that carries one is kept). A comma or
 * an ampersand with no blank, "and" and a hyphen join nothing here: a person behind one stays in
 * the name, a residual that the name of a person and the name of a company hold alike. A few plain
 * two-word names of persons are not caught: they are shown only when a vendor has exactly that
 * name, and the closing sentence says what the list is.
 *
 * What the rules do not see stays in the name (the limits of the kit's measured rules, which this
 * file does not widen): rule M reads ASCII letters only and the whole name from its first letter to
 * its last, so a name with an accented letter, in lower case, behind a title such as "Mr.", with a
 * particle, last name first behind a comma, or with a possessive is no person's by it. An alias mark
 * that the list writes in another way ("d.b.a.", "dba:", "doing business as", "t/a") splits
 * nothing: 6 names of the real list hold one, and splitting at them would give each of them more
 * keys, so the real list would move; they are kept as they are written, a residual.
 *
 * A name that is longer than 200 characters once cleaned (the longest of the list is 255, in 6 rows)
 * is a row that could not be read: `lineWithin` gives no line for a text that does not fit, and
 * never a cut one, because a cut name is no name and never an id or a key (`cellWithin`, which also
 * tells a cell with nothing in it, a row with no name, from one that is too long to be read). The
 * title and the text of a record show at most 120 characters of the name, cut and marked; the body,
 * the names and the identifiers of the record hold it whole.
 *
 * The breach-date cell is unreliable (a date in 2027, notices reported before their breach), so it
 * never dates a record: only the reported day does. It is not stored whole either: of its first 21
 * dates, the earliest and the latest that lie between 2000-01-01 and the reported day (inclusive)
 * are kept, and the others are nowhere. It is read whole (the longest of the list has 250
 * characters), because it is the key of a notice and a cut key would join two notices.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import type { Pin } from "./kit/address";
import {
  LINE_INPUT_MAX,
  compareText,
  dayText,
  lineOf,
  lineWithin,
  shorten,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import {
  CALIFORNIA_MIDDLE_INITIAL_NAME,
  GENERIC_LEGAL_FORMS,
  GENERIC_ORG_WORDS,
  californiaPracticeRule,
} from "./kit/persons";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const CALIFORNIA_BREACHES_RECORD_MARK = "California Attorney General data breach list";

/** The host as the first sentence of a record writes it. */
const HOST = "oag.ca.gov";
const DOCUMENTATION_URL = "https://oag.ca.gov/privacy/databreach/list";
const FILE_URL = "https://oag.ca.gov/privacy/databreach/list-export";
const ROOT = "list-export";
const OPERATOR = "the California Attorney General";

/** Where the answer may come from, after the redirects. */
const PIN: Pin = { hosts: ["oag.ca.gov"], pathPrefixes: ["/privacy/databreach/"] };

/** The file is 348 KB today. */
const FILE_MAX_BYTES = 4_194_304;
const FILE_TIMEOUT_MS = 120_000;
const FILE_CONTENT_TYPES = ["text/csv", "text/plain", "application/csv"];

/** The most data rows of the list (5,425 today, about 600 a year); the header is one more row. */
const MAX_DATA_ROWS = 50_000;
/** A row has three cells; one of more than this is no row of this list, and stops the reading. */
const MAX_COLUMNS = 16;
/** The list has 5,425 rows today; one of fewer than this is no copy of it. */
const MIN_DATA_ROWS = 4_000;
/** The oldest notice of the list is of 2012; a list that begins after this day lost its start. */
const LATEST_FIRST_DAY = "2012-12-31";
/** The breach dates of a row that are read: those from this day to the reported day, inclusive. */
const EARLIEST_BREACH_DAY = "2000-01-01";
/** The most dates of a breach-date cell that are read (the list has one of 21 today). */
const BREACH_DATES_READ = 21;

/** The header of the export, as `lineOf` and a lower case give it. */
const HEADER = ["organization name", "date(s) of breach (if known)", "reported date"] as const;
const HEADER_CELL_MAX = 100;

const NAME_MAX = 200;
const DISPLAY_MAX = 120;
/** A name key has four letters and digits at least (keys.ts). */
const MIN_NAME_CHARS = 4;
const NAMES_MAX = 6;
const NEWEST_KEPT = 3;
const REPORTED_KEPT = 10;

/** The reported day and the breach dates are `mm/dd/yyyy`. */
const MONTH_FIRST_DAY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** The marks that join the names an organisation writes for itself, as the alternatives of a pattern. */
const ALIAS_MARKS = String.raw`d\/b\/a|dba|a\/k\/a|aka|f\/k\/a|formerly|on behalf of`;
/**
 * What joins the names that an organisation writes for itself: "d/b/a", "f/k/a", "on behalf of".
 * Split on it with the mark captured, a name is its parts at the even places and the marks between.
 */
const ALIAS_MARK = new RegExp(String.raw`\s+(${ALIAS_MARKS})\s+`, "i");
/**
 * An alias mark at the very start of a text, and the blank after it. A mark that stands right after
 * a bracket ("(dba First M. Last)") has no blank before it, so `ALIAS_MARK` does not split there and
 * the text inside the pair begins with the mark; it is taken off to read what follows it.
 */
const LEADING_ALIAS_MARK = new RegExp(String.raw`^(?:${ALIAS_MARKS})\s+`, "i");
/**
 * What sets the pieces of the name of a practice apart: a comma and a blank, or an ampersand with a
 * blank each side. A comma or an ampersand with no blank joins nothing.
 */
const PRACTICE_PIECES = /,\s+|\s+&\s+/;
/** What is taken off the ends of a word of a name before it is looked up in the lists of the kit. */
const WORD_MARKS = ".,;()";
/**
 * The words that the kit's list of organisation words holds at its end, which no organisation is
 * known by: what joins the parts of a name ("&", "and", "of", "the", "for", the particles of
 * Spanish) and the marks of an alias. Every practice of a person holds some of them, so they are not
 * words of an organisation here.
 */
const CONNECTORS: ReadonlySet<string> = new Set(
  "of the and for de del la las los el en para por & dba d/b/a a/k/a aka".split(" "),
);
/** The words of the kit's list of organisation words that name an organisation, without the connectors. */
const ORGANISATION_WORDS: ReadonlySet<string> = new Set(
  [...GENERIC_ORG_WORDS].filter((word) => !CONNECTORS.has(word)),
);
/** The text inside the first pair of parentheses of a name, and inside every pair. */
const PARENTHESES = /\(([^()]*)\)/;
const EVERY_PARENTHESES = /\(([^()]*)\)/g;

/** One notice, as the body keeps it: the reported day and the breach dates that were given. */
export interface BreachNotice {
  /** The day the notice was reported to the Attorney General, YYYY-MM-DD. */
  reported: string;
  /** The earliest and the latest usable breach date of the notice, or null for both when none. */
  breachFirst: string | null;
  breachLast: string | null;
}

/** One organisation: the row of the body, and what a record is made of. */
export interface BreachOrganisation {
  /** The compact name of the organisation without its legal form. */
  id: string;
  /** The spelling of the name that the list uses most, whole (the title and the text show 120). */
  display: string;
  /** The names a vendor may match the record by, at most six. */
  names: string[];
  /** How many notices: the distinct pairs of a reported day and a breach-date cell. */
  notices: number;
  firstReported: string;
  lastReported: string;
  /** The newest three notices, the newest first. */
  newest: BreachNotice[];
  /** The days on which it reported, each once, the newest first, at most ten. */
  reported: string[];
  /** The day of the newest notice. */
  publishedAt: string;
}

/**
 * The day of a `mm/dd/yyyy` cell as YYYY-MM-DD, or null when the cell is anything else: a day first
 * date (month 13), a day that does not exist, a year of 0000, one digit for the month, a time after
 * the day. The cell is read as a line of at most 32 characters, so a huge cell costs nothing.
 */
function dayOfCell(cell: string): string | null {
  const match = MONTH_FIRST_DAY.exec(lineOf(cell, 32));
  return match === null ? null : dayText(`${match[3]}-${match[1]}-${match[2]}`);
}

/**
 * The earliest and the latest usable date of a breach-date cell, or null and null: the first 21
 * dates of the cell (it separates them with commas), each read as `mm/dd/yyyy`, those that are no
 * date left out, and so are those before the year 2000 and those after the reported day, which a
 * typo makes. A date on the reported day itself is usable.
 */
function breachRangeOf(
  cell: string,
  reported: string,
): { first: string | null; last: string | null } {
  let first: string | null = null;
  let last: string | null = null;
  for (const token of cell.split(",", BREACH_DATES_READ)) {
    const day = dayOfCell(token);
    if (day === null || day < EARLIEST_BREACH_DAY || day > reported) continue;
    if (first === null || day < first) first = day;
    if (last === null || day > last) last = day;
  }
  return { first, last };
}

/** Whether the first row of the file is the header of the export. */
const isListHeader = (row: readonly string[]): boolean =>
  row.length === HEADER.length &&
  HEADER.every((name, at) => lineOf(row[at], HEADER_CELL_MAX).toLowerCase() === name);

/**
 * Whether a name is a natural person's: rule P (a person-named practice or firm) and rule M ("First
 * M. Last"), both measured on this list (kit/persons.ts). The name is the cleaned line, as a record
 * would show it.
 */
const isPerson = (name: string): boolean =>
  californiaPracticeRule(name) !== null || CALIFORNIA_MIDDLE_INITIAL_NAME.test(name);

/**
 * Whether the text of a pair of parentheses, or the text between two brackets, is a person's: as it
 * is, or once the alias mark that opens it is off ("(dba First M. Last)": the mark stands right
 * after the bracket, so no blank stands before it and it set nothing apart, and rule M, which reads a
 * name from its first letter, would never see the person behind it). One mark at most: a second one
 * has a blank before it, and splits the name at `ALIAS_MARK` before any part is judged.
 */
function isPersonInside(text: string): boolean {
  return isPerson(text) || isPerson(text.replace(LEADING_ALIAS_MARK, ""));
}

/**
 * A cell as one clean line that fits `max` units: "" for a cell with nothing in it, and null for one
 * that does not fit (`lineWithin` gives null for both, and never gives a cut line). A value of more
 * than `LINE_INPUT_MAX` units does not fit, whatever its first megabyte holds: `lineOf` reads no
 * more than that, and a first megabyte of blanks would pass for a cell with nothing in it. A line of
 * two units tells whether a cell has anything in it: a cut to one unit cannot hold a pair of
 * surrogates, and a cell that begins with a character outside the BMP would read as empty.
 */
const cellWithin = (value: unknown, max: number): string | null => {
  const line = lineWithin(value, max);
  if (line !== null) return line;
  if (typeof value === "string" && value.length > LINE_INPUT_MAX) return null;
  return lineOf(value, 2) === "" ? "" : null;
};

/** The parts of a name that its alias marks set apart, without the marks. */
const aliasPartsOf = (name: string): string[] =>
  name.split(ALIAS_MARK).filter((_, at) => at % 2 === 0);

/** A part of a name, judged: whether a person was in it, and what remains of it. */
interface JudgedPart {
  person: boolean;
  text: string;
}

/** A text with each run of white space made one blank, and none at either end. */
const collapsed = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * One part of a name judged: the part as it is when no person is in it. A part that is a person's
 * as a whole is no part. Of a part with parentheses the text outside every pair, and the text
 * inside each pair, are judged on their own: a pair of a person goes out of the part (the part is
 * what stands outside it), and when the text outside the pairs is a person's, the part is what
 * stands inside the pairs that are no person's, without the parentheses. Nothing that holds a
 * letter or a digit remaining, the part is no part. Brackets that do not pair up one to one (a pair
 * inside a pair, a bracket that is never closed or never opened) cannot be taken apart with
 * certainty: when any text between two of their brackets, or the part with every bracket taken
 * out, is a person's, the whole part goes.
 */
function judgePart(part: string): JudgedPart {
  const text = part.trim();
  if (text === "") return { person: false, text };
  if (isPerson(text)) return { person: true, text: "" };
  if (!/[()]/.test(text)) return { person: false, text };

  const outside = collapsed(text.replace(EVERY_PARENTHESES, " "));
  if (/[()]/.test(outside)) {
    const pieces = [text.replace(/[()]/g, " "), ...text.split(/[()]/)].map(collapsed);
    const personal = pieces.some((piece) => piece !== "" && isPersonInside(piece));
    return personal ? { person: true, text: "" } : { person: false, text };
  }

  const insides = [...text.matchAll(EVERY_PARENTHESES)].map((match) => match[1].trim());
  const personInside = (inside: string): boolean => inside !== "" && isPersonInside(inside);
  const outsideIsPerson = outside !== "" && isPerson(outside);
  if (!outsideIsPerson && !insides.some(personInside)) return { person: false, text };

  const remaining = collapsed(
    outsideIsPerson
      ? insides.filter((inside) => inside !== "" && !personInside(inside)).join(" ")
      : text.replace(EVERY_PARENTHESES, (pair: string, inside: string) =>
          personInside(inside.trim()) ? " " : pair,
        ),
  );
  return { person: true, text: compactName(remaining) === "" ? "" : remaining };
}

/**
 * The name of an organisation without the natural persons that it names, or null when it names
 * nothing else. Each part is judged on its own (`judgePart`); a name in which none is a person's is
 * the name as it is, and one in which some are is the parts that remain, each after the mark that
 * stood before it in the name (the first one after none).
 */
function withoutPersons(name: string): string | null {
  const pieces = name.split(ALIAS_MARK);
  const parts = pieces.filter((_, at) => at % 2 === 0).map(judgePart);
  if (!parts.some((part) => part.person)) return name;
  let spelling = "";
  parts.forEach((part, at) => {
    if (part.text === "") return;
    spelling += spelling === "" ? part.text : ` ${pieces[2 * at - 1]} ${part.text}`;
  });
  return spelling === "" ? null : spelling;
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
 * Whether a word of a name is a legal form or a word of an organisation: the lists of the kit, in
 * any case, with the marks round the word off. The dots of a legal form are no part of it ("L.L.P."
 * is "llp"; the kit's `hasLegalForm` does the same for the last word of a name, and the list holds
 * every dotted form with its dotless twin, so the dotless word is all that is looked up).
 */
function isLegalFormOrOrganisationWord(word: string): boolean {
  const bare = bareWord(word);
  return GENERIC_LEGAL_FORMS.has(bare.split(".").join("")) || ORGANISATION_WORDS.has(bare);
}

/**
 * Whether the name of an organisation, which no rule above has judged, is the practice of a person:
 * it has pieces (a comma and a blank, or an ampersand with a blank each side), one of them has the
 * shape of a person (`isPerson`), and no word of it is a legal form or a word of an organisation.
 * A family firm that carries a legal form or a word of an organisation is kept, and so is a name
 * with no piece that has the shape of a person.
 */
function isPersonsPractice(name: string): boolean {
  const pieces = name.split(PRACTICE_PIECES).map((piece) => piece.trim());
  if (pieces.length < 2 || !pieces.some(isPerson)) return false;
  return !name.split(/\s+/).some(isLegalFormOrOrganisationWord);
}

/** The rows of one organisation, as they are collected. */
interface Group {
  /** Each spelling of the name (cleaned) and how many rows use it. */
  spellings: Map<string, number>;
  /** The notices by their key, a reported day and a breach-date cell, so that an exact copy merges. */
  notices: Map<string, BreachNotice>;
}

/** The later day first, and a missing day after a day that is there. */
const compareLaterFirst = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : compareText(b, a);

/**
 * The newer report first; on one day the later breach (its last date, then its first) first; and so
 * every tie is settled by the fields that the body keeps, whatever the order of the rows of the file.
 */
const compareNotices = (a: BreachNotice, b: BreachNotice): number =>
  compareLaterFirst(a.reported, b.reported) ||
  compareLaterFirst(a.breachLast, b.breachLast) ||
  compareLaterFirst(a.breachFirst, b.breachFirst);

/**
 * The names that a vendor may be known by, for one spelling of the name: the whole spelling, each
 * part of it that a "d/b/a", "a/k/a", "f/k/a", "formerly" or "on behalf of" separates, and the text
 * inside its first pair of parentheses. Only the names that can be a key (four letters and digits).
 * The spelling has no part of a person in it (`withoutPersons`), so none of these is one.
 */
function namesOfSpelling(spelling: string): string[] {
  const inside = PARENTHESES.exec(spelling)?.[1] ?? "";
  const parts = [...aliasPartsOf(spelling), inside].map((part) => part.trim());
  return [spelling, ...parts].filter((name) => compactName(name).length >= MIN_NAME_CHARS);
}

/** The first six names of the spellings, in the order of the spellings, each once. */
function namesOf(spellings: readonly string[]): string[] {
  const names = new Set<string>();
  for (const spelling of spellings) {
    for (const name of namesOfSpelling(spelling)) {
      names.add(name);
      if (names.size >= NAMES_MAX) return [...names];
    }
  }
  return [...names];
}

/** The organisation of a group of rows (a group has one notice at least). */
function organisationOf(id: string, group: Group): BreachOrganisation {
  const notices = [...group.notices.values()].sort(compareNotices);
  // The spelling that the list uses most, the one that sorts first of two used as often (by code unit).
  const spellings = [...group.spellings]
    .sort(([a, countA], [b, countB]) => countB - countA || compareText(a, b))
    .map(([spelling]) => spelling);
  // The notices are sorted by their reported day, the newest first: so are the days.
  const days = [...new Set(notices.map((notice) => notice.reported))];
  return {
    id,
    display: withoutAngles(spellings[0]),
    names: namesOf(spellings),
    notices: notices.length,
    firstReported: days[days.length - 1],
    lastReported: days[0],
    newest: notices.slice(0, NEWEST_KEPT),
    reported: days.slice(0, REPORTED_KEPT),
    publishedAt: days[0],
  };
}

/**
 * The organisations of the file: null when it is not the list. A row is read as the cleaned name,
 * the reported day and the breach dates; the breach-date cell and every other cell are dropped
 * once they are read. A row of another width is counted as one that could not be read (a shifted
 * row puts its cells in the wrong columns); a row with no name, a row of a natural person, a row
 * whose name holds nothing but persons, and a row whose name is a person's practice
 * (`isPersonsPractice`), are dropped and counted as nothing; a row whose name is longer than a name
 * can be, whose reported day is no day, or whose name has no letter or digit to make an id of, is
 * counted as one that could not be read.
 */
function read(fetched: Fetched): ReadResult<BreachOrganisation> | null {
  const table = readCsvText(textOf(fetched, 0), MAX_DATA_ROWS + 1, MAX_COLUMNS);
  // A file that ends inside a quote was cut short: the row that the quote opened is not among the rows.
  if (table.cut) return null;
  const [header, ...data] = table.rows;
  if (header === undefined || !isListHeader(header) || data.length < MIN_DATA_ROWS) return null;

  let unreadable = 0;
  let earliest: string | null = null;
  const groups = new Map<string, Group>();
  for (const row of data) {
    const cells = cellsOf(row, HEADER.length);
    if (cells === null) {
      unreadable += 1;
      continue;
    }
    // The name as one clean line that fits: no name is no row; one that does not fit is a row that
    // cannot be read, and is never used cut, as an id or as a key.
    const name = cellWithin(cells[0], NAME_MAX);
    if (name === "") continue;
    if (name === null) {
      unreadable += 1;
      continue;
    }
    // A natural person is never copied, not its name, not its dates: a row whose name is a
    // person's is dropped, so is the person who is a part of a name, and so is a practice that is
    // written as the pieces of a name (the name that remains is the one that is judged).
    if (isPerson(name)) continue;
    const spelling = withoutPersons(name);
    if (spelling === null || isPersonsPractice(spelling)) continue;

    const reported = dayOfCell(cells[2]);
    const id = compactName(shortName(spelling));
    const cell = cellWithin(cells[1], LINE_INPUT_MAX);
    if (reported === null || id === "" || cell === null) {
      unreadable += 1;
      continue;
    }
    if (earliest === null || reported < earliest) earliest = reported;

    const { first, last } = breachRangeOf(cell, reported);
    let group = groups.get(id);
    if (group === undefined) {
      group = { spellings: new Map(), notices: new Map() };
      groups.set(id, group);
    }
    group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
    const key = `${reported} ${cell}`;
    if (!group.notices.has(key)) {
      group.notices.set(key, { reported, breachFirst: first, breachLast: last });
    }
  }
  if (earliest === null || earliest > LATEST_FIRST_DAY) return null;

  const rows: BreachOrganisation[] = [];
  for (const [id, group] of groups) rows.push(organisationOf(id, group));
  return { rows, total: data.length, unreadable, complete: table.complete };
}

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${CALIFORNIA_BREACHES_RECORD_MARK} (${HOST}), a data breach notice list.`;

/**
 * The last sentence of every record: whom the list names, what it does not say, and that it is no
 * finding. It is never cut and never left out.
 */
const CLOSING =
  "The list names the organisation that filed the notice, which can be a service provider acting " +
  "for the breached business; it does not say how many people were affected or what data, and it " +
  "is not a finding of fault. Not endorsed by the Department; adapted by VerifyWise.";

/** What the list holds of the organisation: how many notices, and when they were reported. */
function countSentenceOf(organisation: BreachOrganisation): string {
  const many = `${organisation.notices} data breach${organisation.notices === 1 ? "" : "es"}`;
  const when =
    organisation.firstReported === organisation.lastReported
      ? ` on ${organisation.lastReported}`
      : `, from ${organisation.firstReported} to ${organisation.lastReported}`;
  return `It reported ${many} to ${OPERATOR}${when}.`;
}

/** The breach dates of a notice as the text writes them: one date, a stretch, or none given. */
function breachDatesOf(notice: BreachNotice): string {
  if (notice.breachFirst === null || notice.breachLast === null) return "not stated";
  return notice.breachFirst === notice.breachLast
    ? notice.breachFirst
    : `${notice.breachFirst} to ${notice.breachLast}`;
}

/** One of the newest notices. */
const newestOf = (notice: BreachNotice): string =>
  `reported ${notice.reported} (breach date(s) given: ${breachDatesOf(notice)})`;

/**
 * The text of a record: the list and its kind (S1), the organisation (S2), what the list holds of
 * it (S3), the newest notices (S4) and the closing sentence. It is the whole when it fits in `max`;
 * otherwise the newest notices are dropped from the end, the third and then the second, and then
 * the name of the organisation is cut; the closing sentence is never cut, so that `recordOf` never
 * has to cut it. (With the caps of the fields the text is at most 808 characters, so this is the
 * safety net of a cap that is raised.)
 */
export function californiaSummaryOf(
  organisation: BreachOrganisation,
  max: number = RECORD_SUMMARY_MAX,
): string {
  const entries = organisation.newest.map(newestOf);
  // The text shows the name cut at DISPLAY_MAX and marked; the organisation holds it whole.
  const name = shorten(organisation.display, DISPLAY_MAX);
  const sentencesOf = (display: string, shown: number): string[] => [
    FIRST_SENTENCE,
    sentence("Organisation", display),
    countSentenceOf(organisation),
    shown === 0 ? "" : `Newest: ${entries.slice(0, shown).join("; ")}.`,
  ];
  const textOfShown = (display: string, shown: number): string =>
    joinSentences([...sentencesOf(display, shown), CLOSING]);

  const least = Math.min(1, entries.length);
  for (let shown = entries.length; shown >= least; shown -= 1) {
    const text = textOfShown(name, shown);
    if (text.length <= max) return text;
  }
  for (let room = name.length - 1; room >= 1; room -= 1) {
    const text = textOfShown(shorten(name, room), least);
    if (text.length <= max) return text;
  }
  return summaryWithClosing(sentencesOf(name, least), CLOSING, max);
}

/** The record of an organisation. */
function recordFor(organisation: BreachOrganisation): ParsedRecord {
  return recordOf({
    id: organisation.id,
    type: "breach_notice_summary",
    title: `${CALIFORNIA_BREACHES_RECORD_MARK}: ${shorten(organisation.display, DISPLAY_MAX)}`,
    summary: californiaSummaryOf(organisation),
    // The page of the list, with the organisation: the evidence ledger keeps one record for an address.
    url: `${DOCUMENTATION_URL}?organisation=${encodeURIComponent(organisation.id)}`,
    identifiers: { organisation: organisation.display, reported: organisation.reported },
    names: organisation.names,
    publishedAt: organisation.publishedAt,
    sourceUpdatedAt: null,
  });
}

export const californiaBreachesConnector: Connector = createFileConnector<BreachOrganisation>({
  id: "california_breaches",
  version: 1,
  root: ROOT,
  sortKey: (organisation) => organisation.id,
  files: [
    {
      url: FILE_URL,
      contentTypes: FILE_CONTENT_TYPES,
      maxBytes: FILE_MAX_BYTES,
      timeoutMs: FILE_TIMEOUT_MS,
    },
  ],
  pin: PIN,
  read,
  toRecords: (organisations) => organisations.map(recordFor),
  sourceVersion: (organisations) =>
    organisations.reduce<string | null>(
      (latest, organisation) =>
        latest === null || organisation.lastReported > latest ? organisation.lastReported : latest,
      null,
    ),
});
