/**
 * The UK Algorithmic Transparency Recording Standard records as a mirrored list of the vendor risk
 * database: the records that UK public bodies publish on GOV.UK to describe an algorithmic tool they
 * use, which name, in a section of free text, who supplied the tool. One search of the GOV.UK
 * Search API gives the whole list (155 records today) and the text of each record with it. The
 * licence is the Open Government Licence v3.0 (GOV.UK states that its content is available under it).
 *
 * The record unit is the SUPPLIER ENTITY, not the record: every ATRS record that names a supplier
 * is read for the two sections that hold what is kept, and the suppliers that spell to the same
 * compact short name (`compactName(shortName(name))`, which is also the id of the record) are one
 * entity with a count of the records that name it, how many of them are in each phase, and the
 * three newest. A supplier named by a public body is context (the vendor supplies government AI
 * tools) and never a finding: the list is a register, read for context only, and it says nothing
 * of a supplier's conduct or of the quality of a tool.
 *
 * What is read. The text of a record is a document of numbered headings (`2.3.1 - External
 * supplier`). Only the section titled `External supplier`, `Third party` or `Supplier` (the first
 * such section of the text) and the section titled `Companies House Number` (the first) are read;
 * everything else in the text, which holds contact e-mail addresses, telephone numbers, addresses of
 * pages and named officials, is never kept, never logged and never looked at beyond the headings. A
 * record laid out without numbered headings (version 1.1 of the standard) has no such section and
 * gives no row; it is parsed, and it is not unreadable. The text is read to 200,000 characters, a
 * section to 1,000, and a line to 1,001: a section that these cuts end has no end of its own, so the
 * last name of its cell is not kept and a cell of numbers that was cut gives none. A heading whose
 * title is longer than 300 characters, or whose line a limit cut, is no title of either section.
 *
 * Rule S (the cell of the supplier). It is split at a line break, a semicolon, a comma that is not
 * before a legal form (Inc, LLC, Ltd, Limited, PLC, Corp, in any case), a slash, an ampersand or a
 * plus between blanks, a slash between two letters or digits, and the word `and` between blanks
 * before a capital. In each part the blanks, stops, colons, dashes and tabs at both ends go, a
 * trailing bracket alias is cut, a leading `yes` or `no` goes, and `n/a`, `na`, `none`, `no`, `not
 * applicable`, `tbc` and `unknown` are nothing. What is left is a supplier name when it is 2 to 80
 * characters of at most 7 words, begins with a capital letter or a digit, is no UK postcode, holds no
 * colon and no double quotation mark, and none of the words of the prose list (a sentence that
 * describes, not a name). Two more rules come next: a name that is a country of the
 * United Kingdom (as written or without its legal form) and a name that is the deploying body itself
 * (the compact slug of `algorithmic_transparency_record_organisation`) are no supplier. Four guards
 * of this connector come last, on the name as it is stored: no e-mail address (an `@`), no number
 * (no letter), no markup (`<` or `>`, which a fold can make of a full-width sign) and no half of a
 * bracket. The list of the accepted names is measured at 97 % precision on a sample of 30, with a
 * lower recall: a name that the rule does not accept is a record that gives no row, and that is a
 * gap of the list, not an error.
 *
 * Rule N (the number). When a record has exactly one accepted supplier and its section of the number
 * holds exactly one Companies House number (two letters and six digits, eight digits, or seven
 * digits, as a word), that number is a key of the supplier. A record with several suppliers or
 * several numbers gives none, and a number is strong only beside the name (keys.ts).
 *
 * What the file is. The download is one search, `count=1000`, whose answer must say a `total` that
 * is the number of its distinct results (the pager, govukSearch.ts, refuses it when it does not, and
 * refuses a search of more than 1,000 results as no longer this list). The server sends no ETag and
 * no Last-Modified, so the file is downloaded in full every week (3 MB) and the hash of the body
 * tells that nothing changed; the body has the entities and the counts, never the text.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { cutAtCodePoint } from "../../text";
import type { ParsedRecord } from "../types";
import { GOVUK_PIN, GOVUK_SITE, govukRowsOf, govukSearchPages } from "./govukSearch";
import { compareText, dayText, lineOf, lineWithin, withoutAngles } from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { type Sleep, realSleep } from "./kit/pause";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const UK_ATRS_RECORD_MARK = "UK Algorithmic Transparency Records";

const SEARCH_URL =
  "https://www.gov.uk/api/search.json?filter_content_store_document_type=algorithmic_transparency_record&count=1000&start=0&order=-public_timestamp&fields[]=title&fields[]=description&fields[]=link&fields[]=public_timestamp&fields[]=content_store_document_type&fields[]=format&fields[]=first_published_at&fields[]=primary_publishing_organisation&fields[]=algorithmic_transparency_record_organisation&fields[]=algorithmic_transparency_record_organisation_type&fields[]=algorithmic_transparency_record_phase&fields[]=algorithmic_transparency_record_function&fields[]=algorithmic_transparency_record_region&fields[]=algorithmic_transparency_record_atrs_version&fields[]=algorithmic_transparency_record_date_published&fields[]=indexable_content";
/** The search has 155 results today and one page holds 1,000: a list that outgrows it is not this one. */
const PAGE_SIZE = 1_000;
const MAX_PAGES = 1;
/** The answer is 3 MB today, almost all of it the text of the records. */
const MAX_BYTES = 32 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 60_000;

/** Every record's address is a page under this directory of the site. */
const LINK_PATTERN =
  /^\/algorithmic-transparency-records\/[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~%-]+)*$/;
const LINK_MAX = 200;

/** The most characters of a record's text that are read, of a section's value, and of a line. */
const TEXT_MAX = 200_000;
const CELL_MAX = 1_000;
const LINE_MAX = CELL_MAX + 1;
/**
 * A title longer than this is no title of a section that is read, and neither is a title whose line
 * a limit cut: only the shapes below match, and never on a title that is cut.
 */
const TITLE_MAX = 300;

/** The longest name of a supplier as it is displayed, and the shortest key that matches. */
const NAME_MAX = 120;
const MIN_KEY_CHARS = 4;
/** The longest key (and so id) of an entity: the compact part of an id. */
const KEY_MAX = 120;
/** The suppliers of the list today are 133; a list of thousands is no list of this kind. */
const MAX_ENTITIES = 5_000;
const SPELLINGS_MAX = 10;
const REGNOS_MAX = 3;
const ITEMS_MAX = 3;
const TITLE_SHOWN_MAX = 80;
const AUTHORITY_SHOWN_MAX = 50;

const NO_BREAK_SPACE = /\xA0/g;

/** A numbered heading (`2.3.1 - External supplier`, with marks and a dash of any length): the title is the rest of the line. */
const HEADING = /^(?:#{1,6}\s*)?(\d+(?:\.\d+){0,3})\s*[-–—]\s*([\s\S]+)$/;
/** A line that begins a tier ends the section before it: its title has no number. */
const TIER = /^(?:#{1,6}\s*)?Tier\s+\d/i;
const SUPPLIER_TITLE = /^(?:external supplier|third party|third-party|supplier)(?:\s*name)?\s*:?$/i;
const NUMBER_TITLE =
  /companies house|company (?:registration )?number|external supplier identifier/i;

const WORD_CHAR = "[\\p{L}\\p{N}_]";
/** `inc` as `[iI][nN][cC]`: the legal forms of the comma rule are in any case, and `and` below is not. */
const caseless = (word: string): string =>
  [...word].map((char) => `[${char}${char.toUpperCase()}]`).join("");
const LEGAL_FORMS_AFTER_COMMA = ["inc", "llc", "ltd", "limited", "plc", "corp"]
  .map(caseless)
  .join("|");
/** Where the cell of the supplier is split (rule S). */
const SEPARATORS = new RegExp(
  [
    "\\n",
    ";",
    `,(?!\\s*(?:${LEGAL_FORMS_AFTER_COMMA})(?!${WORD_CHAR}))`,
    "\\s+/\\s+",
    `(?<=${WORD_CHAR})/(?=${WORD_CHAR})`,
    "\\s+&\\s+",
    "\\s+and\\s+(?=[A-Z])",
    "\\s+\\+\\s+",
  ].join("|"),
  "u",
);
const STRIPPED_AT_ENDS = " .:-–—\t";
const STRIPPED_BY_THE_RULE = " .:-";
const LEADING_YES_OR_NO = new RegExp(`^(?:yes|no)(?!${WORD_CHAR})[\\s,:-]*`, "iu");
const NOT_A_SUPPLIER: ReadonlySet<string> = new Set([
  "n/a",
  "na",
  "none",
  "no",
  "not applicable",
  "tbc",
  "unknown",
]);

const MIN_NAME_CHARS = 2;
const MAX_NAME_CHARS = 80;
const MAX_NAME_WORDS = 7;
const FIRST_CHAR = /^[A-Z0-9]/;
const UK_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
const COLON_OR_QUOTE = /[:"“”]/;
/** The words of a sentence that describes: a name that holds one is prose (as the measurement's list). */
const PROSE_WORDS = [
  "is",
  "are",
  "was",
  "were",
  "which",
  "that",
  "where",
  "when",
  "who",
  "whom",
  "provides?",
  "provided",
  "supplies",
  "supplied",
  "runs?",
  "running",
  "used",
  "using",
  "uses",
  "will",
  "has",
  "have",
  "been",
  "this",
  "these",
  "those",
  "their",
  "our",
  "we",
  "it",
  "its",
  "not",
  "no",
  "none",
  "n/a",
  "tbc",
  "various",
  "multiple",
  "internal",
  "in-house",
  "developed",
  "built",
  "hosted",
  "managed",
  "operated",
  "delivered",
  "contract",
  "contracted",
  "suppliers?",
  "third",
  "party",
  "parties",
  "department",
  "authority",
  "council has",
  "team",
];
const PROSE = new RegExp(`(?<!${WORD_CHAR})(?:${PROSE_WORDS.join("|")})(?!${WORD_CHAR})`, "iu");
/** The names of the countries of the United Kingdom, compact: a country is no supplier. */
const COUNTRIES: ReadonlySet<string> = new Set([
  "unitedkingdom",
  "uk",
  "greatbritain",
  "england",
  "scotland",
  "wales",
  "northernireland",
]);

const HAS_LETTER = /\p{L}/u;
const NUMBER_TOKEN = new RegExp(
  `(?<!${WORD_CHAR})(?:[A-Z]{2}[0-9]{6}|[0-9]{8}|[0-9]{7})(?!${WORD_CHAR})`,
  "gu",
);

/** The phase of a record that the list does not give, or gives as something that is none of the six. */
const UNKNOWN_PHASE = "unknown";
/** The phases of a record, in the order that the summary lists them, with the words of the summary for each. */
const PHASES: ReadonlyArray<readonly [phase: string, words: string]> = [
  ["production", "in production"],
  ["beta-pilot", "beta or pilot"],
  ["private-beta", "private beta"],
  ["public-beta", "public beta"],
  ["pre-deployment", "before deployment"],
  ["retired", "retired"],
  [UNKNOWN_PHASE, "phase unknown"],
];
const NOT_DATED = "publication date not stated";
const NO_TITLE = "no title";

const WHAT_A_RECORD_IS =
  "A record is a UK public body's own description of an algorithmic tool it uses and names who supplied it; it says nothing about the supplier's conduct or about the tool's quality.";
const CLOSING = "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0.";

/** One of the newest records of an entity: only what the summary shows. */
interface AtrsItem {
  /** The path of the record's page: it begins with `/algorithmic-transparency-records/`. */
  link: string;
  title: string;
  authority: string;
  phase: string;
  published: string | null;
}

/** One supplier entity of the list, as the reader makes it. */
interface AtrsEntity {
  /** `compactName(shortName(name))`: the id of the record, without its prefix. */
  key: string;
  /** The most frequent spelling, the newest of equally frequent ones. */
  name: string;
  /** The spellings that a vendor may match, the display first: at most ten. */
  spellings: string[];
  /** Companies House numbers, only where a record names this supplier and one number: at most three. */
  regnos: string[];
  /** The ATRS records that name the entity. */
  count: number;
  /** The records of each phase, for the phases that have any, in the order of `PHASES`. */
  phases: Record<string, number>;
  /** The newest records, at most three. */
  items: AtrsItem[];
  /** The newest day of publication among the records, or null when none has one. */
  newest: string | null;
  /** The newest day of the update of a record that names the entity. */
  stamp: string | null;
}

/** The cell of a section: the lines of its value, and whether a limit cut it short. */
interface Cell {
  text: string;
  cut: boolean;
}

/** What a record's text gives of its two sections. */
interface Cells {
  supplier: Cell | null;
  number: Cell | null;
}

/** A name of a supplier that was accepted, and the key of its entity (null when it is too short to be one). */
interface Supplier {
  spelling: string;
  key: string | null;
}

/** What the section of the supplier and the section of the number of one record give. */
interface Supplied {
  suppliers: Supplier[];
  /** The Companies House number of the record when it names one supplier and holds one number. */
  regno: string | null;
}

/** The text without the characters of `chars` at either end, by position (no pattern at the end). */
function trimChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start += 1;
  while (end > start && chars.includes(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

const newerThan = (a: string | null, b: string | null): boolean =>
  a !== null && (b === null || a > b);

/** Adds a line (trimmed, not empty) to the value of a section, until the value passes its limit. */
function addLine(cell: Cell, line: string, lineWasCut: boolean): void {
  if (cell.cut) return;
  const text = cell.text === "" ? line : `${cell.text}\n${line}`;
  if (text.length > CELL_MAX) {
    cell.text = text.slice(0, CELL_MAX);
    cell.cut = true;
    return;
  }
  cell.text = text;
  if (lineWasCut) cell.cut = true;
}

/**
 * The first section titled for the supplier and the first titled for the number of a record's text:
 * one pass over the lines, none of them read beyond LINE_MAX units and the text beyond TEXT_MAX. A
 * section runs to the next heading or the next line that begins a tier; the lines of a section are
 * trimmed, the empty ones left out, and the rest joined with a line break. A section that a limit
 * cuts is marked as cut.
 */
function cellsOf(content: string): Cells {
  const truncated = content.length > TEXT_MAX;
  const text = (truncated ? content.slice(0, TEXT_MAX) : content).replace(NO_BREAK_SPACE, " ");
  let supplier: Cell | null = null;
  let number: Cell | null = null;
  let open: Cell | null = null;

  let at = 0;
  for (;;) {
    const found = text.indexOf("\n", at);
    const end = found === -1 ? text.length : found;
    const wasCut = end - at > LINE_MAX;
    const line = text.slice(at, wasCut ? at + LINE_MAX : end).trim();
    at = end + 1;

    if (line !== "") {
      const heading = HEADING.exec(line);
      if (heading !== null) {
        const title = heading[2];
        open = null;
        // A title that is too long, or whose line a limit cut, is no title of a section that is read:
        // it is never tested cut, for what the cut took off is not known.
        if (!wasCut && title.length <= TITLE_MAX) {
          if (supplier === null && SUPPLIER_TITLE.test(title)) {
            supplier = { text: "", cut: false };
            open = supplier;
          } else if (number === null && NUMBER_TITLE.test(title)) {
            number = { text: "", cut: false };
            open = number;
          }
        }
      } else if (TIER.test(line)) {
        open = null;
      } else if (open !== null) {
        addLine(open, line, wasCut);
      }
    }
    if (found === -1) break;
  }
  // A section that was open where the text was cut goes on past it: its end is not known.
  if (truncated && open !== null) open.cut = true;
  return { supplier, number };
}

/** The part without its trailing bracket alias: `Acme (AA)` is `Acme`. Never a pattern at the end. */
function withoutAlias(part: string): string {
  const end = part.trimEnd();
  if (!end.endsWith(")")) return part;
  const open = end.indexOf("(");
  return open === -1 ? part : end.slice(0, open).trim();
}

/** A part of the cell as a name that the rule may accept, or null when nothing is left (rule S, per part). */
function nameOf(part: string): string | null {
  const stripped = trimChars(part, STRIPPED_AT_ENDS);
  if (stripped === "") return null;
  const name = withoutAlias(stripped).replace(LEADING_YES_OR_NO, "").trim();
  return name === "" || NOT_A_SUPPLIER.has(name.toLowerCase()) ? null : name;
}

/** The name as the accept rule reads it: blanks collapsed and the ends stripped, or null when it is no name. */
function acceptedOf(name: string): string | null {
  const text = trimChars(name.replace(/\s+/g, " "), STRIPPED_BY_THE_RULE);
  if (text.length < MIN_NAME_CHARS || text.length > MAX_NAME_CHARS) return null;
  if (text.split(" ").length > MAX_NAME_WORDS) return null;
  if (!FIRST_CHAR.test(text) || UK_POSTCODE.test(text) || COLON_OR_QUOTE.test(text)) return null;
  return PROSE.test(text) ? null : text;
}

/** Whether every bracket of the text is closed and none is closed before it was opened. */
function bracketsBalance(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")" && (depth -= 1) < 0) return false;
  }
  return depth === 0;
}

/**
 * Whether a name, as it is stored, is one: no e-mail address (`@`), no markup (`<` and `>`, which
 * the fold makes of the full-width signs), no number or telephone number (a name has a letter), and
 * no half of a bracket (the part that the bracket opened or closed is not here).
 */
const isName = (spelling: string): boolean =>
  !/[@<>]/.test(spelling) && HAS_LETTER.test(spelling) && bracketsBalance(spelling);

/**
 * The suppliers that the cell names (rules S and the guards), in the order of the cell. A cell that
 * was cut has no last name: its end is not known. `authority` is the compact slug of the deploying body.
 */
function suppliersIn(cell: Cell, authority: string): Supplier[] {
  const parts = cell.text.split(SEPARATORS);
  const suppliers: Supplier[] = [];
  const last = cell.cut ? parts.length - 1 : parts.length;
  for (let index = 0; index < last; index += 1) {
    const name = nameOf(parts[index]);
    const accepted = name === null ? null : acceptedOf(name);
    if (accepted === null) continue;

    // The name as it is stored: folded and cleaned, and no longer than a name may be. A name that
    // the fold makes longer gives no row, and is never cut to one.
    const spelling = lineWithin(accepted, NAME_MAX);
    if (spelling === null || !isName(spelling)) continue;

    const full = compactName(spelling);
    const short = compactName(shortName(spelling));
    if (COUNTRIES.has(full) || COUNTRIES.has(short)) continue;
    if (authority !== "" && (full === authority || short === authority)) continue;

    suppliers.push({
      spelling,
      key: short.length >= MIN_KEY_CHARS ? cutAtCodePoint(short, KEY_MAX) : null,
    });
  }
  return suppliers;
}

/**
 * The Companies House number of a record when its section of the number holds exactly one (two
 * letters and six digits, eight digits, or seven digits, as a word): the number as written, else
 * null. A section that was cut may have lost a number or half of one.
 */
function numberIn(cell: Cell | null): string | null {
  if (cell === null || cell.cut) return null;
  const numbers = cell.text.match(NUMBER_TOKEN);
  return numbers !== null && numbers.length === 1 ? numbers[0] : null;
}

/** The compact slug of the deploying body (`leeds-city-council`), empty when the result names none. */
const authorityKeyOf = (slug: unknown): string => compactName(typeof slug === "string" ? slug : "");

/** What the text of one record names: its suppliers and, when it is unambiguous, their number. */
function suppliedBy(content: string, authority: string): Supplied | null {
  const cells = cellsOf(content);
  if (cells.supplier === null) return null;
  const suppliers = suppliersIn(cells.supplier, authority);
  if (suppliers.length === 0) return null;
  // The number belongs to the supplier only when there is one supplier and one number.
  const regno = suppliers.length === 1 && !cells.supplier.cut ? numberIn(cells.number) : null;
  return { suppliers, regno };
}

/** The newest first (a record without a day last), then by link. */
function newestFirst(a: AtrsItem, b: AtrsItem): number {
  if (a.published !== b.published) {
    if (a.published === null) return 1;
    if (b.published === null) return -1;
    return a.published < b.published ? 1 : -1;
  }
  return compareText(a.link, b.link);
}

/** What is counted for an entity while the results are read. */
interface Counting {
  /** The records that spell the entity each way: how many, and the newest day of those. */
  spellings: Map<string, { records: number; newest: string | null }>;
  regnos: Set<string>;
  count: number;
  phases: Map<string, number>;
  items: AtrsItem[];
  newest: string | null;
  stamp: string | null;
}

/** The most records first, then the newest, then the order of the texts. */
function bySpelling(
  [a, x]: [string, { records: number; newest: string | null }],
  [b, y]: [string, { records: number; newest: string | null }],
): number {
  if (x.records !== y.records) return y.records - x.records;
  if (x.newest !== y.newest) {
    if (x.newest === null) return 1;
    if (y.newest === null) return -1;
    return x.newest < y.newest ? 1 : -1;
  }
  return compareText(a, b);
}

function entityOf(key: string, counting: Counting): AtrsEntity {
  const spellings = [...counting.spellings].sort(bySpelling).slice(0, SPELLINGS_MAX);
  // In the order of PHASES, so that the body never depends on the order of the results.
  const phases: Record<string, number> = {};
  for (const [phase] of PHASES) {
    const count = counting.phases.get(phase);
    if (count !== undefined) phases[phase] = count;
  }
  return {
    key,
    name: spellings[0][0],
    spellings: spellings.map(([spelling]) => spelling),
    regnos: [...counting.regnos].sort(compareText).slice(0, REGNOS_MAX),
    count: counting.count,
    phases,
    items: counting.items,
    newest: counting.newest,
    stamp: counting.stamp,
  };
}

/** The day of a timestamp of the API (`2026-03-05T10:11:12.000+00:00`): its first ten characters. */
function stampDayOf(value: unknown): string | null {
  if (typeof value !== "string" || (value.length > 10 && value[10] !== "T")) return null;
  return dayText(value.slice(0, 10));
}

/** The few fields of a result that the summary shows. */
function itemOf(result: Record<string, unknown>, link: string): AtrsItem {
  const body = result.algorithmic_transparency_record_organisation;
  return {
    link,
    title: lineOf(result.title, TITLE_SHOWN_MAX),
    authority: lineOf(typeof body === "string" ? body.replace(/-/g, " ") : "", AUTHORITY_SHOWN_MAX),
    phase: phaseOf(result.algorithmic_transparency_record_phase),
    published: dayText(result.algorithmic_transparency_record_date_published),
  };
}

const newCounting = (): Counting => ({
  spellings: new Map(),
  regnos: new Set(),
  count: 0,
  phases: new Map(),
  items: [],
  newest: null,
  stamp: null,
});

/** One record that names the entity, in the spellings that it writes, with the number that it gives it. */
function countRecord(
  counting: Counting,
  record: {
    item: AtrsItem;
    stamp: string | null;
    spellings: Iterable<string>;
    regno: string | null;
  },
): void {
  const { item, stamp, spellings, regno } = record;
  for (const spelling of spellings) {
    const seen = counting.spellings.get(spelling);
    if (seen === undefined) {
      counting.spellings.set(spelling, { records: 1, newest: item.published });
    } else {
      seen.records += 1;
      if (newerThan(item.published, seen.newest)) seen.newest = item.published;
    }
  }
  if (regno !== null) counting.regnos.add(regno);
  counting.count += 1;
  counting.phases.set(item.phase, (counting.phases.get(item.phase) ?? 0) + 1);
  counting.items.push(item);
  counting.items.sort(newestFirst);
  if (counting.items.length > ITEMS_MAX) counting.items.length = ITEMS_MAX;
  if (newerThan(item.published, counting.newest)) counting.newest = item.published;
  if (newerThan(stamp, counting.stamp)) counting.stamp = stamp;
}

/**
 * The supplier entities of the search, or null when it is not the list. A pure function of its
 * text: it takes the results as the pager checked them, reads the text of each one for the two
 * sections, and keeps no more of it than the names, the numbers and the few fields of the summary.
 * A result whose text is no text, or whose address is no record's page, is unreadable; a result that
 * names no supplier is read and gives no row.
 */
function readSearch(fetched: Fetched): ReadResult<AtrsEntity> | null {
  const search = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
  if (search === null) return null;

  const entities = new Map<string, Counting>();
  let unreadable = 0;
  for (const result of search.rows) {
    const { indexable_content: content, link } = result;
    if (typeof content !== "string" || typeof link !== "string") {
      unreadable += 1;
      continue;
    }
    const supplied = suppliedBy(
      content,
      authorityKeyOf(result.algorithmic_transparency_record_organisation),
    );
    if (supplied === null) continue;

    // The address is what the record's page is: a result with another is no record of this list.
    if (link.length > LINK_MAX || !LINK_PATTERN.test(link)) {
      unreadable += 1;
      continue;
    }
    const item = itemOf(result, link);
    const stamp = stampDayOf(result.public_timestamp);

    // The record counts once for each entity it names, however many spellings it holds of it.
    const named = new Map<string, Set<string>>();
    for (const { spelling, key } of supplied.suppliers) {
      if (key === null) continue;
      const spellings = named.get(key);
      if (spellings === undefined) named.set(key, new Set([spelling]));
      else spellings.add(spelling);
    }
    // The number is set only for a record with one supplier: it goes to the entity of that supplier.
    for (const [key, spellings] of named) {
      let counting = entities.get(key);
      if (counting === undefined) {
        // A list of more suppliers than any real one is no list of this kind.
        if (entities.size >= MAX_ENTITIES) return null;
        counting = newCounting();
        entities.set(key, counting);
      }
      countRecord(counting, {
        item,
        stamp,
        spellings,
        regno: supplied.regno,
      });
    }
  }

  const rows = [...entities].map(([key, counting]) => entityOf(key, counting));
  return {
    rows,
    // The entities may be more than the results (a result can name several suppliers).
    total: Math.max(search.total, rows.length + unreadable),
    unreadable,
    complete: search.rows.length === search.total,
  };
}

/** `2 in production, 1 retired`: the phases that the entity's records have, in the order of PHASES. */
function phaseCountsOf(phases: Record<string, number>): string {
  return PHASES.filter(([phase]) => (phases[phase] ?? 0) > 0)
    .map(([phase, words]) => `${phases[phase]} ${words}`)
    .join(", ");
}

/** The words of a phase in the summary: its own, or `phase unknown` for any other. */
const phaseWordsOf = (phase: string): string =>
  (PHASES.find(([name]) => name === phase) ?? PHASES[PHASES.length - 1])[1];

/** The phase of a result: one of the six that the list has, else unknown. */
const phaseOf = (value: unknown): string =>
  typeof value === "string" && PHASES.some(([phase]) => phase === value) ? value : UNKNOWN_PHASE;

/** One of the newest records: its title, the body that published it, its phase and its day. */
function itemSentenceOf(item: AtrsItem): string {
  const title = item.title === "" ? NO_TITLE : item.title;
  const by = item.authority === "" ? "" : ` by ${item.authority}`;
  const day = item.published === null ? NOT_DATED : `published ${item.published}`;
  return `“${title}”${by}, ${phaseWordsOf(item.phase)}, ${day}`;
}

/** A record is the supplier entity: its spellings, how many records name it and the newest of them. */
function toRecord(row: AtrsEntity): ParsedRecord {
  const name = lineOf(row.name, NAME_MAX);
  const records = `${row.count} ${row.count === 1 ? "record" : "records"}`;
  return recordOf({
    id: `atrs:${row.key}`,
    type: "algorithm_register_supplier",
    title: `ATRS supplier: ${name}`,
    summary: summaryWithClosing(
      [
        `${UK_ATRS_RECORD_MARK} (gov.uk), a register or status list.`,
        WHAT_A_RECORD_IS,
        `Supplier as written: ${name}.`,
        `UK public bodies name this supplier in ${records} (${phaseCountsOf(row.phases)}).`,
        `Newest: ${row.items.map(itemSentenceOf).join("; ")}.`,
        row.regnos.length > 0 ? `Companies House number given: ${row.regnos.join(", ")}.` : "",
      ],
      CLOSING,
      RECORD_SUMMARY_MAX,
    ),
    // A record has no page of its own for a supplier: the page of the newest record that names it.
    url: `${GOVUK_SITE}${row.items[0].link}`,
    identifiers: {
      supplier: withoutAngles(name),
      records: row.count,
      newest: row.newest,
      ...(row.regnos.length > 0 ? { companiesHouse: row.regnos } : {}),
    },
    names: row.spellings,
    regnos: row.regnos,
    publishedAt: row.newest,
  });
}

/**
 * The connector of the list. The pager waits between two pages, and this search is one page: the
 * pause is taken so that the four lists of GOV.UK are built alike, and so that a test hands it a
 * `sleep` that does not wait.
 */
export function createUkAtrsConnector({ sleep = realSleep }: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<AtrsEntity>({
    id: "uk_atrs",
    version: 1,
    root: "search.json",
    sortKey: (row) => row.key,
    pin: GOVUK_PIN,
    // No validator is sent (the API has none), so the one search is downloaded in full each time.
    fetchFiles: (fetch) =>
      govukSearchPages(fetch, () => SEARCH_URL, {
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        maxBytes: MAX_BYTES,
        timeoutMs: TOTAL_TIMEOUT_MS,
        sleep,
      }),
    read: readSearch,
    toRecords: (rows) => rows.map(toRecord),
    sourceVersion: (rows) =>
      rows.reduce<string | null>(
        (newest, { stamp }) => (newerThan(stamp, newest) ? stamp : newest),
        null,
      ),
  });
}

export const ukAtrsConnector: Connector = createUkAtrsConnector();
