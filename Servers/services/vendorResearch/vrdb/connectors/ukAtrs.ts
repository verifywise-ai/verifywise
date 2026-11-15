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
 * before a legal form (Inc, LLC, Ltd, Limited, PLC, Corp, in any case), a slash or a plus between
 * blanks, a slash between two letters or digits, and the word `and` between blanks before a
 * capital. An ampersand is no separator, as in the Canada and OMB registers: `Ernst & Young LLP` is
 * one firm, and its halves would be records that say a supplier "as written" that no body wrote,
 * with keys (`ernst`, `young`) that are the names of other firms. In each part the blanks, stops,
 * colons, dashes, tabs and ampersands at both ends go (`PolyAI &` ends a line before the next firm), a
 * trailing bracket alias is cut, a leading `yes` or `no` goes, and `n/a`, `na`, `none`, `no`, `not
 * applicable`, `tbc` and `unknown` are nothing. What is left is a supplier name when it is 2 to 80
 * characters of at most 7 words, begins with a capital letter or a digit, is no UK postcode, holds no
 * colon and no double quotation mark, and none of the words of the prose list (a sentence that
 * describes, not a name). The lines of a postal address are no supplier: a UK postcode ends an
 * address, and walking back from it a country, one town, and the lines that begin with a house
 * number or end in a word of a street or a building are its lines, never the first line of its
 * block, which is the name it belongs to (`Nomensa Limited`, `13 Queen Square`, `Bristol`, `BS1 4NT`
 * is one supplier). Two more rules come next: a name that is a country of the
 * United Kingdom (as written or without its legal form) and a name that is the deploying body itself
 * (the compact slug of `algorithmic_transparency_record_organisation`) are no supplier. Four guards
 * of this connector come last, on the name as it is stored: no e-mail address (an `@`), no number
 * (no letter), no markup (`<` or `>`, which a fold can make of a full-width sign) and no half of a
 * bracket. The list of the accepted names was measured at 97 % precision on a sample of 30; on the
 * whole list of November 2026 (155 records, 118 entities, read by hand) 15 entities are fragments of
 * prose that pass the rule (`Interest Rates`, `Quality Assured`, `Young` of `Ernst and Young`) and 7
 * more name a product or a public body (`Azure`, `UK Government`), so 96 to 103 of the 118 are
 * suppliers (81 to 87 %). The recall is lower: a name that the rule does not accept is a
 * record that gives no row, and that is a gap of the list, not an error.
 *
 * Rule N (the number). When a record has exactly one accepted supplier, its cell names no other
 * firm (a part that the accept rule refused for its words or its shape counts as one; a placeholder,
 * a line of an address, a country, the deploying body and a part of one character, without a letter
 * or with an `@` do not; a host counts in every position, a line of its own, beside an address or in
 * a bracket, when it is written as a name, with a capital anywhere, a top level of two letters or more
 * and a label that no public host has, `iQuillon.ai`, unless it is the supplier's own, whose first
 * label is the supplier's whole short name, `Zorbex.co.uk` beside `Zorbex Ltd`; words glued with a
 * dot whose last label holds a digit, `Tel.02079460000`, and public hosts, `GOV.UK`, are details and
 * no supplier, as a label and digits alone are, `Phone 020 7946 0000`), and its section of the number
 * holds exactly one Companies House number (two letters and six digits, eight digits, or seven
 * digits, as a word), that number is a key of the supplier. A number of seven digits is one whose
 * leading zero was dropped: it is stored and shown with that zero (`1234567` is `01234567`, the
 * eight characters of the register). A number that begins with a zero is keyed with it and without
 * it, for a vendor may have stored either (`writtenFormsOf`). A record with several
 * suppliers or several numbers gives none, and a number is strong only beside the name (keys.ts).
 *
 * Natural persons. No rule here tells a person's name from an organization's: the section of the
 * supplier is free text of a public body, and a supplier that a record names by a person's name (a
 * sole trader) is kept as written, like any name that Rule S accepts. That is a residual, which the
 * use of the list as context only limits: a record of it is never a finding.
 *
 * What the file is. The download is one search, `count=1000`, whose answer must say a `total` that
 * is the number of its distinct results (the pager, govukSearch.ts, refuses it when it does not, and
 * refuses a search of more than 1,000 results as no longer this list). The server sends no ETag and
 * no Last-Modified, so the file is downloaded in full every week (3 MB) and the hash of the body
 * tells that nothing changed; the body has the entities and the counts, never the text.
 */
import { isLegalFormOrArticle, shortName } from "../../identity";
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
/** The entities of the list today are 118; a list of thousands is no list of this kind. */
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
    "\\s+and\\s+(?=[A-Z])",
    "\\s+\\+\\s+",
  ].join("|"),
  "u",
);
/**
 * An ampersand at an end is no part of a name: `PolyAI &` ends a line before the next firm. A plus
 * is not stripped, for it ends names (`Canal+`); between blanks it is a separator already.
 */
const STRIPPED_AT_ENDS = " .:-–—\t&";
const STRIPPED_BY_THE_RULE = " .:-&";
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
/** A line of a postal address that begins with a house number or a unit (`13 Queen Square`, `Unit 4`). */
const HOUSE_NUMBER_LINE =
  /^(?:(?:unit|suite|floor|flat)\s+)?\d+[A-Za-z]?(?:[-–]\d+[A-Za-z]?)?(?:\s|,|$)/i;
/** A line of a postal address that ends in a word of a street or a building (`Example Road`, `King William House`). */
const STREET_LINE =
  /\s(?:street|st|road|rd|square|lane|avenue|place|way|court|close|drive|gardens|terrace|row|crescent|walk|hill|park|wharf|quay|yard|parade|mews|green|house|building|buildings|centre|center|tower|chambers|hall|exchange)$/i;
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

/** The words inside the trailing bracket of a part (`www.quillon.example (Quillon Data Ltd)`), or null. */
function bracketOf(part: string): string | null {
  const end = trimChars(part, STRIPPED_AT_ENDS).trimEnd();
  if (!end.endsWith(")")) return null;
  const open = end.indexOf("(");
  return open === -1 ? null : end.slice(open + 1, -1).trim();
}

/** A part of the cell as a name that the rule may accept, or null when nothing is left (rule S, per part). */
function nameOf(part: string): string | null {
  const stripped = trimChars(part, STRIPPED_AT_ENDS);
  if (stripped === "") return null;
  const name = withoutAlias(stripped).replace(LEADING_YES_OR_NO, "").trim();
  return name === "" || NOT_A_SUPPLIER.has(name.toLowerCase()) ? null : name;
}

/**
 * The name as the accept rule reads it: blanks collapsed and the ends stripped, or null when it is no
 * name. A text of the shape of a bare domain that is no host that names a firm (`isDottedDetail`:
 * `Tel.02079460000`, `No.12345678`, `GOV.UK`) is no name either.
 */
function acceptedOf(name: string): string | null {
  const text = trimChars(name.replace(/\s+/g, " "), STRIPPED_BY_THE_RULE);
  if (text.length < MIN_NAME_CHARS || text.length > MAX_NAME_CHARS) return null;
  if (text.split(" ").length > MAX_NAME_WORDS) return null;
  if (!FIRST_CHAR.test(text) || UK_POSTCODE.test(text) || COLON_OR_QUOTE.test(text)) return null;
  if (isDottedDetail(text) || isDetailsOnly(text)) return null;
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

/** The text of a part as the accept rule reads it, or null when the part is nothing (a placeholder). */
function partTextOf(part: string): string | null {
  const name = nameOf(part);
  return name === null ? null : trimChars(name.replace(/\s+/g, " "), STRIPPED_BY_THE_RULE);
}

/** Whether the text is a country of the United Kingdom, as written or without its legal form. */
const isCountry = (text: string): boolean =>
  COUNTRIES.has(compactName(text)) || COUNTRIES.has(compactName(shortName(text)));

/**
 * The parts of the cell that are lines of a postal address. An address is the run of lines that a
 * UK postcode ends: walking back from the postcode, a country, then one town (the first other line),
 * then the lines that begin with a house number or end in a word of a street or a building (a
 * line with a legal form is never the town). The
 * first line after the previous address (or of the cell) is the name the address belongs to and is
 * never one of its lines; a line that is none of these ends the walk. A part without a postcode
 * after it is no address line, whatever it looks like.
 */
function addressPartsOf(texts: ReadonlyArray<string | null>): Set<number> {
  const address = new Set<number>();
  let floor = 0;
  for (let at = 0; at < texts.length; at += 1) {
    const text = texts[at];
    if (text === null || !UK_POSTCODE.test(text)) continue;
    address.add(at);
    // The first part of the block that holds a name: the walk stops before it.
    let first = floor;
    while (first < at && (texts[first] === null || address.has(first))) first += 1;
    let townSeen = false;
    for (let back = at - 1; back > first; back -= 1) {
      const line = texts[back];
      if (line === null) continue;
      if (isCountry(line)) {
        address.add(back);
      } else if (HOUSE_NUMBER_LINE.test(line) || STREET_LINE.test(line)) {
        address.add(back);
        townSeen = true;
      } else if (!townSeen && compactName(shortName(line)) === compactName(line)) {
        // A town has no legal form: `Beta Ltd` before a postcode is a firm whose address is the postcode.
        address.add(back);
        townSeen = true;
      } else {
        break;
      }
    }
    floor = at + 1;
  }
  return address;
}

/** A web address (a scheme or `www.`), or a host or bare domain, as the whole text: `zorbex.co.uk`, `zorbex.co.uk/about`. */
const WEB_ADDRESS =
  /^(?:[a-z][a-z0-9+.-]{0,15}:\/\/|www\.)[^\s()]*$|^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:\/\S*)?$/iu;
/**
 * The shape of a real host, as the whole text: labels of letters, digits and hyphens joined by dots,
 * whose last label (the top level) is letters alone, two or more (`quillon.ai`, `Quillon.co.uk`), and
 * a path after it. `Tel.02079460000`, `No.12345678`, `Est.2015`, `ISO.27001` (digits at the end) and
 * `U.K` (one letter) have no such shape: they are details, never a host.
 */
const HOST = /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(\p{L}{2,})(?:\/\S*)?$/u;
/**
 * The labels of a host of the state or of a register, lower case: a host made of them alone
 * (`GOV.UK`, `NHS.UK`, `gov.scot`) is the address of a public body, never a firm's name.
 */
const PUBLIC_HOST_LABELS: ReadonlySet<string> = new Set([
  "gov",
  "uk",
  "nhs",
  "ac",
  "co",
  "org",
  "police",
  "mod",
  "parliament",
  "scot",
  "wales",
  "cymru",
  "service",
  "sch",
  "judiciary",
  "ltd",
  "plc",
  "net",
  "com",
  "eu",
]);

/** The labels of a host before its path, lower case: `Quillon.co.uk/about` is `quillon`, `co`, `uk`. */
const hostLabelsOf = (host: string): string[] => host.split("/")[0].toLowerCase().split(".");

/**
 * Whether a text, as a whole, names a firm by its host: it has the shape of a real host (HOST), a
 * capital anywhere (`Quillon.ai`, `iQuillon.ai`, `quillon.AI`, `QUILLON.AI`: a host written as a
 * name), and a label that is no label of a public host (`GOV.UK` names no firm). A host in lower
 * case is an address and names no one. This is the ONE test of a host that names a firm: every
 * position of a cell reads it through `mentionsOf` (a line of its own, beside a web address, a
 * bracket at the end of a part, the rest after a label).
 */
const hostNamesAFirm = (text: string): boolean =>
  isHostOfAFirmShape(text) && CAPITALISED.test(text);

/** Whether a text has the shape of a real host (HOST) with a label that no public host has. */
const isHostOfAFirmShape = (text: string): boolean =>
  HOST.test(text) && hostLabelsOf(text).some((label) => !PUBLIC_HOST_LABELS.has(label));

/** Words joined by dots, with no blank, and a path after them: the shape of a bare domain. */
const BARE_DOMAIN = /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:\/\S*)?$/u;

/** A text without the one dot that closes its last word: `U.K.` is `U.K`. */
const withoutClosingDot = (text: string): string => (text.endsWith(".") ? text.slice(0, -1) : text);

/**
 * Whether a text, as a whole, has the shape of a bare domain (BARE_DOMAIN, the dot that closes it
 * aside) and is a detail: its last label holds a digit (`Tel.02079460000`, `No.12345678`,
 * `Est.2015`, `ISO.27001`, `V2.1`) or every label is a label of a public host (`GOV.UK`, `NHS.UK`).
 * As a whole text it names no one and is never a supplier's name; as the head before a colon it is
 * read as a name all the same (`Tel.02079460000: 020 7946 0000`, the residual HEAD_BEFORE_COLON, on
 * the safe side). Initials (`I.B.M`, `E.Y.`) are no detail: they may be a firm's name (`U.K` is a
 * country, `isCountry`).
 */
function isDottedDetail(text: string): boolean {
  const bare = withoutClosingDot(text);
  if (!BARE_DOMAIN.test(bare)) return false;
  const labels = hostLabelsOf(bare);
  return (
    /\p{N}/u.test(labels[labels.length - 1]) ||
    labels.every((label) => PUBLIC_HOST_LABELS.has(label))
  );
}

/**
 * A web address as a word of a text, wherever it stands: a scheme and `//`, or `www.`, then what
 * follows up to a blank or a bracket (`Website https://zorbex.co.uk`, `www.zorbex.co.uk - Quillon
 * Data Ltd`). No letter, digit, dot or `@` comes before it. Its run of characters has one way to
 * match, so a long text costs no more than its length.
 */
const WEB_TOKEN = /(?<![\p{L}\p{N}.@])(?:[a-z][a-z0-9+.-]{0,15}:\/\/|www\.)[^\s()]*/giu;
/** The blanks and the joiners at the ends of a piece around a web address: `Zorbex Ltd - `, `Website: `. */
const JOINERS_AT_ENDS = /^[\s:,;|\p{Pd}]+|[\s:,;|\p{Pd}]+$/gu;
/** A piece that is a joiner of two web addresses alone: `https://zorbex.co.uk and https://zorbex.com`. */
const JOINER_ALONE = /^(?:and|or|and\/or|&)$/iu;
/**
 * The word in lower case that joins a piece to the web address before it (`https://zorbex.co.uk and
 * Quillon Data Ltd`) or to the one after it (`Quillon Data Ltd and https://...`). A name that opens
 * with the word in capitals (`And Zorbex Ltd`) keeps it.
 */
const JOINER_BEFORE = /^(?:and|or|&)\s+/u;
const JOINER_AFTER = /\s+(?:and|or|&)$/u;
/** A piece that closes with a colon: the head of what follows it (`quillon data: https://quillon.example`). */
const HEAD_BEFORE_DETAILS = /:\s*$/u;
/** A clause: its first word is letters in lower case alone, and more words follow (`a company registered in England`). */
const LOWER_CASE_CLAUSE = /^\p{Ll}+\s/u;
/** A word with a capital anywhere in it: `Quillon`, `(Quillon`, `iProov`, `eBay`. */
const CAPITALISED = /\p{Lu}/u;
/**
 * The words with a capital that a clause about the supplier holds and that name no firm: the
 * countries of the United Kingdom and the register (`a company registered in England and Wales`,
 * `registered with Companies House`).
 */
const WORDS_OF_NO_FIRM: ReadonlySet<string> = new Set([
  "united",
  "kingdom",
  "great",
  "britain",
  "england",
  "scotland",
  "wales",
  "northern",
  "ireland",
  "uk",
  "gb",
  "companies",
  "house",
]);
/** The words of the list of legal forms that a clause ends in without naming a firm: `a private limited company`. */
const FORMS_OF_A_CLAUSE: ReadonlySet<string> = new Set(["the", "as", "co", "company"]);
/** The words of a label of the supplier's details: `Contact:`, `Tel:`, `Email:`, `Website:`, `Web site:`. */
const LABEL_WORDS: ReadonlySet<string> = new Set([
  "contact",
  "contacts",
  "details",
  "tel",
  "telephone",
  "phone",
  "mobile",
  "fax",
  "email",
  "e-mail",
  "mail",
  "web",
  "website",
  "site",
  "url",
  "link",
  "homepage",
  "address",
  "number",
  "us",
  "info",
  "enquiries",
  "more",
  "further",
  "information",
  "see",
  "visit",
]);

/**
 * Whether the text before a colon or a web address is a label of details: words of LABEL_WORDS
 * alone, with the dot that closes a word or without (`Tel.`), or shorter than a name (`T:`, `W:`,
 * nothing).
 */
const isLabel = (head: string): boolean =>
  head.length < MIN_NAME_CHARS ||
  head
    .toLowerCase()
    .split(/\s+/)
    .every((word) => LABEL_WORDS.has(word.replace(/\.$/, "")));

/** A part at its first colon that no `//` follows (the colon of a scheme is none): the head and the rest. */
function labelledOf(text: string): { head: string; rest: string } | null {
  const at = text.search(/:(?!\/\/)/);
  return at === -1 ? null : { head: text.slice(0, at).trim(), rest: text.slice(at + 1).trim() };
}

/**
 * Whether a word is a detail of a firm after its name: no letter (`020`, `7946`, `+44`, `-`), or a
 * word of a label (LABEL_WORDS: `tel`, `phone`, `Tel:`).
 */
const isDetailWord = (word: string): boolean =>
  !HAS_LETTER.test(word) || LABEL_WORDS.has(word.toLowerCase().replace(/[.:]+$/, ""));

/** The fewest digits of a telephone or a registration number: `020 7946 0000` has 11, `360` is none. */
const DETAIL_DIGITS_MIN = 6;

/**
 * Whether a text is the details of a firm and nothing else: every word is a detail (`isDetailWord`),
 * and its words with no letter hold DETAIL_DIGITS_MIN digits or more in all, as a telephone or a
 * registration number does (`Phone 020 7946 0000`, `Tel 020 7946 0000`). A label alone (`Link`), and
 * a label with a short number (`Link 360`, `Info 24`, `Web 2.0`), is not: a firm may have that
 * name. It is no supplier's name and names no one.
 */
function isDetailsOnly(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => word !== "");
  const digits = words
    .filter((word) => !HAS_LETTER.test(word))
    .join("")
    .replace(/\D/g, "").length;
  return digits >= DETAIL_DIGITS_MIN && words.every(isDetailWord);
}

/**
 * Whether a clause in lower case names a firm: a word after its first has a capital anywhere in it
 * and is no word of WORDS_OF_NO_FIRM (`supplied by Quillon Data`, `registered in Delaware`, `with
 * iProov`, `supplied by Link`: every word is read, a label word with a capital too), or its last
 * word, the details that follow a name put aside, is a legal form of the keys that a clause does not
 * end in (`quillon data ltd`, `quillon data ltd 020 7946 0001`, `quillon data ltd tel 020 ...`; not `a
 * private limited company`). The details put aside are a trailing run of detail words
 * (`isDetailWord`) that holds a word with no letter (a telephone number); a run of label words alone
 * is put aside nowhere.
 */
function clauseNamesAFirm(clause: string): boolean {
  const all = clause.split(/\s+/);
  const capitalised = all
    .slice(1)
    .some(
      (word) =>
        CAPITALISED.test(word) &&
        !WORDS_OF_NO_FIRM.has(word.toLowerCase().replace(/[^\p{L}]/gu, "")),
    );
  if (capitalised) return true;
  let end = all.length;
  while (end > 1 && isDetailWord(all[end - 1])) end -= 1;
  if (all.slice(end).every((word) => HAS_LETTER.test(word))) end = all.length;
  const last = all[end - 1].replace(/[)]+$/, "");
  return (
    isLegalFormOrArticle(last) && !FORMS_OF_A_CLAUSE.has(last.toLowerCase().replace(/[.,]/g, ""))
  );
}

/**
 * Whether a text without a label may name a firm: no web address or host in lower case, no detail
 * glued with a dot (`isDottedDetail`: `Tel.02079460000`, `GOV.UK`), no details alone
 * (`isDetailsOnly`: `Phone 020 7946 0000`), no country (`U.K.`), and no clause in lower case that
 * names none. Words joined by dots with a capital (`I.B.M`) may.
 */
function textMayNameAFirm(text: string): boolean {
  if (text.length < MIN_NAME_CHARS || !HAS_LETTER.test(text)) return false;
  if (isDottedDetail(text) || isDetailsOnly(text) || isCountry(text)) return false;
  // Words joined by dots with a capital (`I.B.M`, `E.Y.`, `Cyber.Essentials`) are written as a name;
  // in lower case (`zorbex.co.uk`) they are an address. A scheme or `www.` is an address.
  if (BARE_DOMAIN.test(withoutClosingDot(text))) return CAPITALISED.test(text);
  if (WEB_ADDRESS.test(text)) return false;
  return !LOWER_CASE_CLAUSE.test(text) || clauseNamesAFirm(text);
}

/**
 * The names that a part the accept rule refused holds. `direct`: the part as a whole may be the name
 * of a firm, and counts as one. `details`: names that stand with details of a firm (a web address,
 * or the details after a colon), each counted only when no supplier of the cell has that name.
 */
interface Mentions {
  direct: string[];
  details: string[];
}

const NO_MENTION: Mentions = { direct: [], details: [] };

/**
 * A piece without the bracket that opens it and the one that closes it, each when it has one: `(Quillon
 * Data Ltd)` is `Quillon Data Ltd`, and `(a company registered in England`, which a separator cut, is
 * `a company registered in England`.
 */
const unbracketed = (piece: string): string => piece.replace(/^\(\s*/, "").replace(/\s*\)$/, "");

/**
 * The names around the web addresses of a part (its `pieces`, split at WEB_TOKEN): every name
 * is details, as a web address is a firm's details (`Zorbex Analytics Ltd - https://zorbex.co.uk`).
 * A piece names no one only in a shape that no firm's name has: joiners alone (`and`, `|`), a
 * label (`Website`, `See`, `Tel.`), a host in lower case, a clause in lower case of two words or
 * more that names no firm and has no colon after it, on either side of an address (read by
 * `mentionsOf`: `https://... (a company registered in England)`, `https://... via quillon data`),
 * or, before the first address and with no colon after it, words that open with a letter in lower
 * case, have no capital anywhere and name no firm, one word included (`through`, `for more
 * information visit`). After an address one word in lower case names a firm (`https://... and
 * quillon`). The other pieces name a firm: a head with a letter before a colon
 * that is no label (`quillon data: https://...`, `eBay: www...`), words with a capital anywhere
 * (`iProov https://...`), a host with a capital anywhere (`Quillon.ai https://...`: `mentionsOf`
 * reads it, `hostNamesAFirm`), and words that open with a digit or a mark (`6point6`, `(quillon)`). The
 * word `and`, `or` or `&` in lower case that joins a piece to the address beside it is no name. A piece in brackets is read
 * inside them (`www.quillon.example (in partnership with Quillon Data Ltd)`). The pieces hold no
 * web address, so each is read once.
 */
function mentionsAroundWebAddresses(pieces: readonly string[]): Mentions {
  const details: string[] = [];
  pieces.forEach((piece, at) => {
    let words = piece.replace(JOINERS_AT_ENDS, "");
    if (JOINER_ALONE.test(words)) return;
    if (at > 0) words = words.replace(JOINER_BEFORE, "");
    if (at < pieces.length - 1) words = words.replace(JOINER_AFTER, "");
    if (words === "" || isLabel(words)) return;
    const head = HEAD_BEFORE_DETAILS.test(piece);
    // Words in lower case alone, a clause that names no firm (`through`, `for more information
    // visit`); not `iProov`, `6point6`, `(quillon)`.
    const clause = /^\p{Ll}/u.test(words) && !CAPITALISED.test(words) && !clauseNamesAFirm(words);
    if (at === 0 && !head && clause) return;
    const inside = unbracketed(words);
    const found = mentionsOf(inside);
    const names = [...found.direct, ...found.details];
    // A head that is no label names someone, whatever its words: the details after it are its own.
    const headName = head && names.length === 0 && HAS_LETTER.test(words) ? [words] : [];
    details.push(...names, ...headName);
  });
  return { direct: [], details };
}

/**
 * What a part that the accept rule refused names (Mentions). A part with a web address is read
 * around it (`mentionsAroundWebAddresses`). A host written as a name (`hostNamesAFirm`: `iQuillon.ai`,
 * `Quillon.co.uk`) names a firm, as details (the supplier's own host is the supplier's:
 * `isOwnDetail`); any other host or bare domain alone (WEB_ADDRESS: `zorbex.co.uk`, `GOV.UK`,
 * `Tel.02079460000`) names no one.
 * A part with a colon is read at its first colon that no `//` follows: a head that is a label of
 * details (LABEL_WORDS: `Contact:`, `Tel:`) names no one and the rest is read as a part of its
 * own; any other head is a name, the details of that name when the rest names no firm
 * (`Zorbex Analytics Ltd: 020 7946 0000`), and a firm otherwise (`Quillon Data Ltd: Other Ltd`,
 * `Partner: quillon`). Without a label, a clause in lower case (`a company registered in England`)
 * names no firm unless it names one (`clauseNamesAFirm`: `supplied by Quillon Data Ltd`, `quillon
 * data ltd`). A name in lower case of one word, or with a capital inside (`iProov`, `eBay`), may be
 * a firm's.
 */
function mentionsOf(text: string): Mentions {
  if (text.length < MIN_NAME_CHARS || !HAS_LETTER.test(text)) return NO_MENTION;
  const pieces = text.split(WEB_TOKEN);
  if (pieces.length > 1) return mentionsAroundWebAddresses(pieces);
  // A host written as a name (`iQuillon.ai`, `Quillon.ai`) is a firm's, in every position; it counts
  // unless it is a supplier's of the cell (`hostOwnerOf`).
  if (hostNamesAFirm(text)) return { direct: [], details: [text] };
  const labelled = labelledOf(text);
  if (labelled === null)
    return textMayNameAFirm(text) ? { direct: [text], details: [] } : NO_MENTION;
  if (isLabel(labelled.head)) return mentionsOf(labelled.rest);
  const rest = mentionsOf(labelled.rest);
  return rest.direct.length + rest.details.length === 0
    ? { direct: [], details: [labelled.head] }
    : { direct: [text], details: [] };
}

/** Whether a part that the accept rule refused may still name a firm (`mentionsOf`). */
function mayNameAFirm(text: string): boolean {
  const found = mentionsOf(text);
  return found.direct.length + found.details.length > 0;
}

/**
 * Whether a part names someone, accepted or not: what the number test counts. A placeholder, a line
 * of an address, a country, the deploying body, and a part that is no name of anyone (one character,
 * no letter, an e-mail address) name no one. A part that the accept rule refuses may name a firm,
 * and then the number may be that firm's: one refused for its words (prose, `The tool is supplied
 * by a partner`) or for half a bracket still counts. One refused for a shape that no firm's name has
 * does not (`mayNameAFirm`): a web address, a host or a bare domain that is no host written as a name
 * (`www.zorbex.co.uk`, `zorbex.co.uk`, `https://zorbex.example`, `Tel.02079460000`, `GOV.UK`; a host
 * with a capital, `iQuillon.ai`, counts), a clause in lower case that names no firm (`a company
 * registered in England`), and a label of details whose rest is either of these (`Contact: sales
 * team`; `Contact: Quillon Data` and `Subcontractor: quillon` still count).
 */
function namesSomeone(text: string, authority: string): boolean {
  if (text.length < MIN_NAME_CHARS || !HAS_LETTER.test(text) || text.includes("@")) return false;
  if (acceptedOf(text) === null && !mayNameAFirm(text)) return false;
  if (isCountry(text)) return false;
  const full = compactName(text);
  const short = compactName(shortName(text));
  return authority === "" || (full !== authority && short !== authority);
}

/**
 * Whether a name that stands with details is a supplier's of the cell: its compact short name is a
 * supplier's (`Zorbex Analytics Ltd: www.zorbex.co.uk` beside Zorbex Analytics Ltd), or, for a host
 * written as a name (`hostNamesAFirm`), its first label is the compact short name of a supplier
 * (`Zorbex.co.uk` beside Zorbex Ltd, `ZorbexDataLabs.com` beside Zorbex Data Labs Ltd: its own
 * host). A host whose first label is only the first word of a supplier (`Zorbex.co.uk` beside Zorbex
 * Analytics Ltd) is not told from another firm's (`Digital.ai` beside Digital Health Ltd): it names a
 * firm, and the number is withheld (the safe side).
 */
function isOwnDetail(name: string, suppliers: readonly Supplier[]): boolean {
  const key = compactName(shortName(name));
  const host = hostNamesAFirm(name) ? compactName(hostLabelsOf(name)[0]) : null;
  return suppliers.some((supplier) => {
    const short = compactName(shortName(supplier.spelling));
    return short === key || host === short;
  });
}

/**
 * The words that open a bracket naming the supplier itself by another name: `trading as`,
 * `formerly`, `previously`, `known as`, `also known as`, `formerly known as`. The arm `t/a` is never
 * reached in a cell: SEPARATORS splits the cell at a slash between two letters first, so
 * `Zorbex Analytics Ltd (t/a Zorbex Ltd)` gives no record at all (as at version 8). It is kept so
 * that the words stay one list.
 */
const OWN_OTHER_NAME =
  /^(?:trading as|t\/a|formerly(?: known as)?|previously(?: known as)?|(?:also )?known as)\s/iu;

/**
 * Whether the words of a bracket at the end of a part that is a name of its own, or of a part that
 * is a bracket alone, name a firm: a host written as a name (`hostNamesAFirm`: `iQuillon.ai`), or
 * two words or more whose last is such a host (`in partnership with QUILLON.AI`) or a legal form of
 * the keys that a clause does not end in (`Quillon Data Ltd`, `part of Quillon Group plc`, `via
 * Quillon Data GmbH`). The supplier's other names
 * (OWN_OTHER_NAME: `trading as Zorbex Ltd`, `formerly Zorbex Data Ltd`) and an alias without a
 * legal form (`AWS`, `KLD`, `PwC`) name none. A plain name of words alone (`Quillon Data`) is not
 * read: the residual BRACKET_PLAIN_NAME.
 */
function bracketNamesAFirm(inside: string): boolean {
  if (hostNamesAFirm(inside)) return true;
  if (OWN_OTHER_NAME.test(inside)) return false;
  const words = inside.split(/\s+/).filter((word) => word !== "");
  if (words.length < 2) return false;
  const last = words[words.length - 1];
  return (
    hostNamesAFirm(last) ||
    (isLegalFormOrArticle(last) && !FORMS_OF_A_CLAUSE.has(last.toLowerCase().replace(/[.,]/g, "")))
  );
}

/** What the cell of the supplier names: the suppliers accepted, and how many parts name anyone. */
interface Named {
  suppliers: Supplier[];
  /** The parts that name someone (`namesSomeone`), the suppliers included: the number goes only to one. */
  named: number;
}

/**
 * The suppliers that the cell names (rules S and the guards), in the order of the cell. A cell that
 * was cut has no last name: its end is not known. `authority` is the compact slug of the deploying body.
 */
function suppliersIn(cell: Cell, authority: string): Named {
  const parts = cell.text.split(SEPARATORS);
  const last = cell.cut ? parts.length - 1 : parts.length;
  const texts = parts.slice(0, last).map(partTextOf);
  const address = addressPartsOf(texts);
  const suppliers: Supplier[] = [];
  let named = 0;
  /** The names that stand with details (`mentionsOf`): each counts unless a supplier of the cell has it. */
  const detailsOf: string[] = [];
  for (let index = 0; index < last; index += 1) {
    const text = texts[index];
    // A bracket that names a firm (`bracketNamesAFirm`) at the end of a part that is a name of its
    // own (`Zorbex Analytics Ltd (Quillon Data Ltd)`), or that is a part alone (`(Quillon Data Ltd)`
    // on a line of its own), names that firm unless a supplier of the cell has that name.
    const ending = bracketOf(parts[index]);
    const firmInBracket =
      ending !== null && bracketNamesAFirm(ending) && namesSomeone(ending, authority);
    if (text === null) {
      if (firmInBracket) detailsOf.push(ending);
      continue;
    }
    if (address.has(index)) continue;
    const accepted = acceptedOf(text);
    const namesItself = namesSomeone(text, authority);
    if (accepted !== null && namesItself) {
      named += 1;
      if (firmInBracket) detailsOf.push(ending);
    } else {
      if (namesItself) {
        const found = mentionsOf(text);
        if (found.direct.length > 0) named += 1;
        detailsOf.push(...found.details);
      }
      // The bracket at the end of a part that does not count as a name of its own, which its text
      // leaves out (`nameOf`): it names a firm (`www.quillon.example (Quillon Data Ltd)`, `Zorbex
      // Analytics Ltd: www.zorbex.co.uk (Quillon Data Ltd)`, `sales@quillon.example (via Quillon
      // Data)`, `020 7946 0000 (Quillon Data Ltd)`) unless a supplier of the cell has that name.
      const inside = bracketOf(parts[index]);
      if (inside !== null && namesSomeone(inside, authority)) {
        const found =
          acceptedOf(inside) === null ? mentionsOf(inside) : { direct: [inside], details: [] };
        detailsOf.push(...found.direct, ...found.details);
      }
    }
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
  // A host written as a name that is the own host of another supplier of the cell that is no host
  // (`Zorbex.co.uk` on a line of its own beside Zorbex Analytics Ltd) is that supplier's details, not a
  // supplier of its own: it was counted as a name, and is not.
  const firms = suppliers.filter((supplier) => !hostNamesAFirm(supplier.spelling));
  const own = suppliers.filter(
    (supplier) => hostNamesAFirm(supplier.spelling) && isOwnDetail(supplier.spelling, firms),
  );
  const kept = suppliers.filter((supplier) => !own.includes(supplier));
  named -= own.length;
  // The details of a supplier of the cell (`Zorbex Analytics Ltd: www.zorbex.co.uk` beside Zorbex
  // Analytics Ltd) name no other firm; those of another name do.
  named += detailsOf.filter((name) => !isOwnDetail(name, kept)).length;
  return { suppliers: kept, named };
}

/** The length of a Companies House number. */
const COMPANY_NUMBER_LENGTH = 8;

/**
 * The Companies House number of a record when its section of the number holds exactly one (two
 * letters and six digits, eight digits, or seven digits, as a word), else null. A section that was
 * cut may have lost a number or half of one. A number of seven digits had its leading zero dropped:
 * the zero is put back, so that the record stores and shows the eight characters of the register
 * (`01234567`); the keys hold both forms (`writtenFormsOf`).
 */
function numberIn(cell: Cell | null): string | null {
  if (cell === null || cell.cut) return null;
  const numbers = cell.text.match(NUMBER_TOKEN);
  return numbers !== null && numbers.length === 1
    ? numbers[0].padStart(COMPANY_NUMBER_LENGTH, "0")
    : null;
}

/** The compact slug of the deploying body (`leeds-city-council`), empty when the result names none. */
const authorityKeyOf = (slug: unknown): string => compactName(typeof slug === "string" ? slug : "");

/** What the text of one record names: its suppliers and, when it is unambiguous, their number. */
function suppliedBy(content: string, authority: string): Supplied | null {
  const cells = cellsOf(content);
  if (cells.supplier === null) return null;
  const { suppliers, named } = suppliersIn(cells.supplier, authority);
  if (suppliers.length === 0) return null;
  // The number belongs to the supplier only when the cell names one firm, accepted or not (a firm
  // the rule refused may be the number's), and the section of the number holds one number.
  const regno =
    suppliers.length === 1 && named === 1 && !cells.supplier.cut ? numberIn(cells.number) : null;
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

/** A Companies House number of eight digits that begins with a zero (`01234567`). */
const ZERO_LED_NUMBER = /^0\d{7}$/;

/**
 * The forms of a Companies House number that a vendor may have stored: the number of eight
 * characters, and for one that begins with a zero also the seven digits without it, which is how
 * the zero is often dropped (`01234567` and `1234567`). A vendor's number is keyed as it is written
 * (keys.ts `regnoKey` pads nothing), so the record keys both: one form only would lose the vendor
 * that stored the other, and both name the same company (a number key matches only beside a shared
 * name).
 */
const writtenFormsOf = (number: string): string[] =>
  ZERO_LED_NUMBER.test(number) ? [number, number.slice(1)] : [number];

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
    regnos: row.regnos.flatMap(writtenFormsOf),
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
    // 2: a Companies House number of seven digits gets its leading zero back, and a number that
    // begins with a zero is keyed with it and without it (regno:01234567, regno:1234567); an
    // ampersand no longer splits a supplier.
    // 3: an ampersand at the end of a name goes; the lines of a postal address are no suppliers;
    // the number goes only to a cell that names one firm, accepted or not.
    // 4: a web address, a host, a clause in lower case or a label of no firm (`Contact: sales team`)
    // beside the one supplier is no other firm: the number is the supplier's again.
    // 5: a clause in lower case that names a firm (`supplied by Quillon Data Ltd`, `quillon data
    // ltd`) and a name before its details (`Quillon Data Ltd: www.quillon.example`) are another firm
    // again, unless the name is the supplier's own: the number is withheld.
    // 6: a web address anywhere in a part is details (`Website https://...`, `Zorbex Analytics Ltd -
    // https://...`: the number again), and a name beside it or in the bracket after it is another
    // firm unless it is the supplier's (`www.zorbex.co.uk - Quillon Data Ltd`, `... (via Quillon
    // Data)`: withheld); `See`, `Visit` and a label with a dot (`Tel.:`) are labels.
    // 7: a piece around a web address names no one only in a shape no firm's name has (joiners
    // alone: `https://... and https://...` gives the number again; a label; words without a capital
    // before the first address); a head before a colon (`quillon data: https://...`) and a word with
    // a capital anywhere (`iProov`, `eBay`, `with iProov`) name a firm: withheld.
    // 8: a host with a capital anywhere beside an address (`Quillon.ai https://quillon.ai`) names a
    // firm unless it is the supplier's own name (`Zorbex.io Ltd` and `Zorbex.io - https://...`):
    // withheld.
    // 9: one test of a host that names a firm in every position (`hostNamesAFirm`: a real host shape,
    // a top level of two letters or more, a capital anywhere, a label no public host has): the bracket
    // and the line of its own read it too (`(iQuillon.ai)`, `quillon.AI` alone: withheld), a detail
    // glued with a dot that ends in a digit or a public host (`Tel.02079460000`, `No.12345678`,
    // `GOV.UK`) is no host and no supplier (the number again; initials, `I.B.M`, still name a firm),
    // the supplier's own host is its own when its first label is the supplier's whole short name
    // (`Zorbex.co.uk` beside Zorbex Ltd: the number again, also on a line of its own), a label and
    // digits alone (`Phone 020 7946 0000`) name no one, and a legal form that only details follow
    // names a firm in a clause in lower case (`quillon data ltd 020 7946 0001`: withheld).
    // 10: a label word with a capital names a firm in a clause in lower case again, as in version 8
    // (`supplied by Link`: withheld), the details put aside after a name are a run that holds a
    // telephone number (`quillon data ltd tel 020 7946 0001` is still withheld), and details alone need
    // six digits or more (`Link 360` is a supplier again); a bracket that names a firm by a legal form
    // or a host written as a name, after a supplier's name or on a line of its own, withholds the
    // number (`Zorbex Analytics Ltd (Quillon Data Ltd)`, `(iQuillon.ai)`; not `(AWS)`, `(trading as
    // Zorbex Ltd)`).
    version: 10,
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
