/**
 * The AI Hallucination Cases database of Damien Charlotin (HEC Paris) as a mirrored list of the
 * vendor risk database: the court decisions that addressed false or fabricated content in a filing
 * (a citation to a case that does not exist), with the AI tool that the decision names. The
 * database publishes one CSV export, built for each request, at a fixed address; its data are
 * licensed CC BY 4.0 (the export says so in its own headers), and the site's Content-Signal says
 * `ai-train=no`: nothing of it trains or fine-tunes a model. Only counts reach the analysis model.
 *
 * The record unit is the TOOL, not the decision. 89 % of the decisions name no tool (the cell says
 * `Implied` or `Unidentified`), and a vendor is matched by the name of a product or of the vendor
 * that the cell holds: a record is the count of the decisions that name one tool, with the days of
 * the first and the newest, the decisions of the last four years of the file, who filed (lawyers,
 * self-represented litigants, others), the three countries with the most decisions, and how many
 * decisions a vendor disputed. No case name, court, caption, file name or text of a decision is
 * read: they name natural persons (the parties, in at least 57 % of the rows), and the long text
 * columns quote decisions. The match is by the NAME of the tool alone (weak), and a tool is a
 * product, not a maker: a vendor called OpenAI meets the decisions that name "OpenAI", never the
 * ones that name "ChatGPT", unless the vendor holds the product as another name.
 *
 * Natural persons. The only cell that is read and holds free text is the tool cell, and it names
 * products, vendors and generic phrases (the 109 distinct values of the real export were read in
 * full: no person). The columns that name persons (case name, pointer, source, details, items) are
 * never read, and the explanation of a vendor's dispute is read only for the test of which tools it
 * names, and never kept. So no rule tells persons apart: none is ever a key.
 *
 * Rule T (the tool cell). It names no tool when it is empty or begins, in any case, with
 * `implied`, `unidentified` or `unknown`. Otherwise it is split on `,` `;` `/` `+` `&` and the
 * words ` and ` and ` or `; in each part the parentheticals are cut (an unclosed `(` to the end),
 * double quotes become blanks, a leading `and`, `or` or `with` goes, a possessive `'s` goes, blanks
 * are collapsed and blanks and dots trimmed at the ends. A generic phrase (AI, Gen AI, Internet
 * searches, Google Search, Other generative AI platforms and tools, Premium Westlaw subscription)
 * and a token that has fewer than four letters and digits once its legal form is off gives no key.
 * The key is `compactName(shortName(token))`, which is also the id of the record: a changed
 * spelling in the source is a new key, one withdrawal and one insert. A row counts once for each
 * distinct key it names, and not at all when the decision is only alleged.
 *
 * A dispute is attributed to a tool by a measured rule: the row is disputed (`Vendor Disputed`
 * is Yes) and the explanation, read as a compact text, holds the key, or a word of it that has five
 * letters or more is inside the key. The explanation is never kept, and it is read whole or not at
 * all: one of more than 300 characters, once cleaned, names no tool, because a cut fragment of
 * it must never decide a dispute.
 *
 * What a record shows of a tool. The title and the text show the first spelling cut at 60
 * characters; the identifiers and the names hold it whole (at most 200 characters, the cell cap):
 * an identifier is never a cut text.
 *
 * What the file is. The header must hold the columns that are read, by name (a column more is fine,
 * and every row must be as wide as the header); fewer than 1,500 rows is not this list. A row with
 * a day that is not exactly YYYY-MM-DD and real, or a tool cell too long to be a list of tools, or
 * a flag that is neither Yes nor No on a row that names a tool (a flag cell of more than a megabyte
 * is none: its first megabyte could say one thing and the cell another), is not read: it is
 * counted, and the kit's allowance (ten, or a hundredth, and at most a tenth of the entities)
 * decides whether the sync goes on. The years of a record are counted back from the newest decision
 * of the FILE, never from the clock, so that the same file gives the same body on any day and its
 * hash tells that nothing changed. The server sends no ETag and a Last-Modified that is the time of
 * the answer, so the conditional GET never answers 304: the hash of the body decides.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import type { ParsedRecord } from "../types";
import { LINE_INPUT_MAX, compareText, dayText, lineOf, lineWithin } from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, columnsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const CHARLOTIN_RECORD_MARK = "AI Hallucination Cases database";

const EXPORT_URL = "https://www.damiencharlotin.com/hallucinations/hallucinations/download.csv";
/** The page of the database: a record has no page of its own, so the address names the tool. */
const RECORD_URL = "https://www.damiencharlotin.com/hallucinations/?tool=";
/** The export is 2.2 MB today and grows by about 1.5 MB a year. */
const MAX_BYTES = 16 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 120_000;
/** The list has 2,286 decisions today; a file below this is not the list, one above it is too large. */
const MIN_DATA_ROWS = 1_500;
const MAX_DATA_ROWS = 20_000;
/** The header has 19 columns today: a row of more than this many cells is no row of the list. */
const MAX_COLUMNS = 128;
/** The list has 83 tools today (and about 1,000 organisations in the largest list of this kind). */
const MAX_ENTITIES = 5_000;

/** The columns that are read, by their names in the header. */
const USED_COLUMNS = {
  state: "State(s)",
  date: "Date",
  party: "Party(ies)",
  tool: "AI Tool",
  alleged: "Alleged",
  disputed: "Vendor Disputed",
  explanation: "Vendor Disputed Explanation",
} as const;

/** The longest tool cell that is read: the longest of the real export has 65 characters. */
const TOOL_CELL_MAX = 200;
/** The longest cell of countries that is read, and the longest country. */
const STATE_CELL_MAX = 200;
const COUNTRY_MAX = 40;
const PARTY_MAX = 40;
const FLAG_MAX = 8;
const EXPLANATION_MAX = 300;
/** The longest key (and so id) of a tool. */
const KEY_MAX = 160;
const MIN_KEY_CHARS = 4;
const MIN_EXPLANATION_WORD_CHARS = 5;
/** The spellings of a tool that go to the names of its record. */
const NAMES_MAX = 5;
const COUNTRIES_SHOWN = 3;
/** The years of the window, counted back from the year of the newest decision of the file. */
const YEARS_SHOWN = 4;
const DISPLAY_MAX = 60;
const NOT_STATED = "not stated";

/** What a tool cell begins with when the decision names no tool. */
const NO_TOOL_PREFIXES = ["implied", "unidentified", "unknown"];
/** Phrases that describe a kind of tool and name none (compared as lower case, whole). */
const GENERIC_PHRASES: ReadonlySet<string> = new Set([
  "ai",
  "gen ai",
  "internet searches",
  "google search",
  "other generative ai platforms",
  "other generative ai tools",
  "premium westlaw subscription",
]);
/** Where a tool cell is split: a separator, or the word and / or between blanks, in any case. */
const TOOL_SEPARATORS = /\s*(?:,|;|\/|\+|&|\sand\s|\sor\s)\s*/iu;
const DOUBLE_QUOTES = /["\u{201C}\u{201D}]/gu;
const LEADING_CONNECTIVE = /^(?:and|or|with)\s+/i;
/** `'s`, or the typographic apostrophe and an s (U+2019), at the end of a word: Westlaw's. */
const POSSESSIVE = /['\u{2019}]s(?![\p{L}\p{N}_])/gu;
const WORDS = /[A-Za-z0-9]+/g;

/** The text of the record's closing sentence: how the numbers were made, and the credit the licence asks for. */
const CLOSING =
  "A decision that names several tools counts for each. Counted by VerifyWise from the published CSV; AI Hallucination Cases Database, Damien Charlotin, CC BY 4.0.";
/** The sentence that says what an entry is, and is not: never cut, since it comes before the numbers. */
const WHAT_AN_ENTRY_IS =
  "Each entry is a court decision that addressed false or fabricated content in a filing and names the AI tool used; the database notes that naming a tool does not show that the tool caused the error, and an entry is not a finding about the tool's maker.";

/** One tool of the list, as the reader makes it. */
interface ToolRow {
  /** The key of the tool: `compactName(shortName(token))`. */
  id: string;
  /** The most frequent spelling (as cleaned), ties by the order of the texts. */
  display: string;
  /** The five most frequent spellings, for the names a vendor may match. */
  names: string[];
  decisions: number;
  first: string;
  last: string;
  /** The year of the newest decision of the file: the same in every row. */
  anchorYear: number;
  /** The decisions of the years `anchorYear` down to `anchorYear - 3`. */
  byYear: number[];
  roles: { lawyers: number; selfRepresented: number; others: number };
  /** The countries with the most decisions: [name, decisions]. */
  countries: Array<[string, number]>;
  disputed: number;
}

/** What is counted for a tool while the rows are read. */
interface Counting {
  spellings: Map<string, number>;
  decisions: number;
  first: string;
  last: string;
  years: Map<number, number>;
  roles: { lawyers: number; selfRepresented: number; others: number };
  countries: Map<string, number>;
  disputed: number;
}

/** The text without its parentheticals (a blank for each), an unclosed `(` cutting to the end. Linear. */
function withoutParentheticals(text: string): string {
  let kept = "";
  let at = 0;
  for (;;) {
    const open = text.indexOf("(", at);
    if (open === -1) return kept + text.slice(at);
    kept += `${text.slice(at, open)} `;
    const close = text.indexOf(")", open + 1);
    if (close === -1) return kept;
    at = close + 1;
  }
}

/** The text without the blanks and the full stops at either end; by position, never a pattern at the end. */
function trimBlanksAndDots(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && (text[start] === " " || text[start] === ".")) start += 1;
  while (end > start && (text[end - 1] === " " || text[end - 1] === ".")) end -= 1;
  return text.slice(start, end);
}

/** A part of a tool cell as a token: the cuts and the strips of rule T. */
function tokenOf(part: string): string {
  const text = withoutParentheticals(part)
    .replace(DOUBLE_QUOTES, " ")
    .trim()
    .replace(LEADING_CONNECTIVE, "")
    .replace(POSSESSIVE, "")
    .replace(/\s+/g, " ");
  return trimBlanksAndDots(text);
}

/**
 * A cell as one clean line (`lineOf`) of at most `max` units: "" when nothing is left of it (a cell
 * that names no tool is no cell that is too long), null when the clean line is longer than `max`.
 * It never gives a cut line: `lineWithin` says null for an empty line as well, and `lineOf(cell,
 * max + 1)` cannot tell an overlong cell from a whole one (the cut takes a blank before it off and
 * never splits a pair of surrogates, so a cut line of `max` units that ends in the marker passes).
 * A cell of more than LINE_INPUT_MAX units is null before anything else is asked: `lineOf`
 * reads only the first LINE_INPUT_MAX units of it, so a first megabyte of blanks would read as an
 * empty cell, and a row that names no tool, while a tool lies beyond it.
 */
function uncutLineOf(cell: string, max: number): string | null {
  if (cell.length > LINE_INPUT_MAX) return null;
  // `lineOf(cell, 2)` is empty only when the clean line is: a cut to two units keeps at least one.
  return lineWithin(cell, max) ?? (lineOf(cell, 2) === "" ? "" : null);
}

/**
 * The tools that a tool cell names (rule T), each once, in the order of the cell, with its key: the
 * decision names none when the cell says nothing or says that the tool is implied, unidentified or
 * unknown; a generic phrase and a name of fewer than four letters and digits are no tool.
 */
function toolsOf(cell: string): Array<{ key: string; token: string }> {
  const lower = cell.toLowerCase();
  if (lower === "" || NO_TOOL_PREFIXES.some((prefix) => lower.startsWith(prefix))) return [];
  const tools = new Map<string, string>();
  for (const part of cell.split(TOOL_SEPARATORS)) {
    const token = tokenOf(part);
    if (token === "" || GENERIC_PHRASES.has(token.toLowerCase())) continue;
    const key = compactName(shortName(token));
    if (key.length >= MIN_KEY_CHARS && !tools.has(key)) tools.set(key, token);
  }
  return [...tools].map(([key, token]) => ({ key, token }));
}

/**
 * Yes or No, in any case, with blanks around it; null for anything else, an empty cell included, and
 * a cell that is too long to be read whole (`lineWithin`): `lineOf` reads only the first
 * LINE_INPUT_MAX units of a cell, which can say `No` where the cell as a whole says another thing.
 */
function flagOf(cell: string): boolean | null {
  const value = lineWithin(cell, FLAG_MAX)?.toLowerCase();
  if (value === "yes") return true;
  return value === "no" ? false : null;
}

/** Who filed: by the first words of the role (`Judge; Lawyer` is no lawyer's decision, `Lawyer; Judge` is). */
function roleOf(cell: string): keyof Counting["roles"] {
  const party = lineOf(cell, PARTY_MAX).toLowerCase();
  if (party.startsWith("lawyer")) return "lawyers";
  return party.startsWith("pro se") ? "selfRepresented" : "others";
}

/** The countries of a decision, each once: the cell split on `;`, and `not stated` for none. */
function countriesOf(cell: string): string[] {
  const countries = new Set<string>();
  for (const part of lineOf(cell, STATE_CELL_MAX).split(";")) {
    const country = lineOf(part, COUNTRY_MAX);
    if (country !== "") countries.add(country);
  }
  return countries.size === 0 ? [NOT_STATED] : [...countries];
}

/**
 * What the explanation of a dispute names: its compact text, and its words of five letters or
 * digits or more. A tool is the one the vendor spoke of when the text holds its key, or a word is
 * inside its key ("Acmelaw" is inside "acmelawprecision"). An explanation of more than 300 units
 * (once cleaned) names no tool: it is never cut and read, because a fragment of a text that
 * does not fit must not decide what a vendor disputed, and neither is an empty one.
 */
function explanationOf(cell: string): (key: string) => boolean {
  const explanation = lineWithin(cell, EXPLANATION_MAX);
  if (explanation === null) return () => false;
  const compact = compactName(explanation);
  const words = (explanation.match(WORDS) ?? [])
    .filter((word) => word.length >= MIN_EXPLANATION_WORD_CHARS)
    .map((word) => word.toLowerCase());
  return (key) => compact.includes(key) || words.some((word) => key.includes(word));
}

const countedUp = <K>(counts: Map<K, number>, key: K): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

/** The most decisions first, then the order of the texts. */
const byCount = ([a, x]: [string, number], [b, y]: [string, number]): number =>
  y - x || compareText(a, b);

function toolRowOf(id: string, counting: Counting, anchorYear: number): ToolRow {
  const spellings = [...counting.spellings].sort(byCount);
  return {
    id,
    display: spellings[0][0],
    names: spellings.slice(0, NAMES_MAX).map(([spelling]) => spelling),
    decisions: counting.decisions,
    first: counting.first,
    last: counting.last,
    anchorYear,
    byYear: Array.from(
      { length: YEARS_SHOWN },
      (_, back) => counting.years.get(anchorYear - back) ?? 0,
    ),
    roles: counting.roles,
    countries: [...counting.countries].sort(byCount).slice(0, COUNTRIES_SHOWN),
    disputed: counting.disputed,
  };
}

/**
 * The tools of the export, or null when it is not the list. A pure function of its text: it reads
 * at most 20,000 rows of at most 128 cells, and a part of the list is no read (the download then
 * fails as too large). It drops the columns that it does not read before any row is built.
 */
function readExport(fetched: Fetched): ReadResult<ToolRow> | null {
  const csv = readCsvText(textOf(fetched, 0), MAX_DATA_ROWS + 1, MAX_COLUMNS);
  const [header, ...body] = csv.rows;
  if (header === undefined) return null;
  const columns = columnsOf(header, USED_COLUMNS);
  if (columns === null) return null;
  const complete = !csv.more && !csv.cut && !csv.wide;
  if (!complete) return { rows: [], total: body.length, unreadable: 0, complete };
  if (body.length < MIN_DATA_ROWS) return null;

  const width = header.length;
  const tools = new Map<string, Counting>();
  let unreadable = 0;
  let newestDay = "";
  for (const row of body) {
    const cells = cellsOf(row, width);
    if (cells === null) {
      unreadable += 1;
      continue;
    }
    const day = dayText(cells[columns.date]);
    // A cell longer than a list of tools can be is not read, and is never cut: a token of the end
    // of a cut cell would be the piece of a name.
    const cell = uncutLineOf(cells[columns.tool], TOOL_CELL_MAX);
    if (day === null || cell === null) {
      unreadable += 1;
      continue;
    }
    const named = toolsOf(cell);
    const alleged = named.length === 0 ? false : flagOf(cells[columns.alleged]);
    const disputed = named.length === 0 ? false : flagOf(cells[columns.disputed]);
    if (alleged === null || disputed === null) {
      unreadable += 1;
      continue;
    }
    // The row reads: it counts for the newest decision of the file, whether or not it counts for a tool.
    if (day > newestDay) newestDay = day;
    if (alleged) continue;

    const role = roleOf(cells[columns.party]);
    const countries = countriesOf(cells[columns.state]);
    const names = disputed ? explanationOf(cells[columns.explanation]) : () => false;
    for (const { key, token } of named) {
      if (key.length > KEY_MAX) {
        unreadable += 1;
        continue;
      }
      let counting = tools.get(key);
      if (counting === undefined) {
        // A list of more tools than any real one is no list of this kind.
        if (tools.size >= MAX_ENTITIES) return null;
        counting = {
          spellings: new Map(),
          decisions: 0,
          first: day,
          last: day,
          years: new Map(),
          roles: { lawyers: 0, selfRepresented: 0, others: 0 },
          countries: new Map(),
          disputed: 0,
        };
        tools.set(key, counting);
      }
      countedUp(counting.spellings, token);
      counting.decisions += 1;
      if (day < counting.first) counting.first = day;
      if (day > counting.last) counting.last = day;
      countedUp(counting.years, Number(day.slice(0, 4)));
      counting.roles[role] += 1;
      for (const country of countries) countedUp(counting.countries, country);
      if (names(key)) counting.disputed += 1;
    }
  }

  const anchorYear = Number(newestDay.slice(0, 4));
  const rows = [...tools].map(([id, counting]) => toolRowOf(id, counting, anchorYear));
  // A row can name several tools, so the entities may outnumber the rows of the file: the total is
  // the larger of the two, and the kit refuses a body whose total is below the entities.
  return { rows, total: Math.max(body.length, rows.length + unreadable), unreadable, complete };
}

/** `label count, label count`, for the counts above zero. */
const countsOf = (counts: ReadonlyArray<readonly [string, number]>): string =>
  counts
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
    .join(", ");

/** A record is the count of the decisions that name one tool: no text of a decision, no person. */
function toRecord(row: ToolRow): ParsedRecord {
  const display = lineOf(row.display, DISPLAY_MAX);
  const years = countsOf(row.byYear.map((count, back) => [String(row.anchorYear - back), count]));
  const roles = countsOf([
    ["lawyers", row.roles.lawyers],
    ["self-represented litigants", row.roles.selfRepresented],
    ["others", row.roles.others],
  ]);
  const countries = countsOf(row.countries);
  const disputed =
    row.disputed > 0
      ? `; ${row.disputed} marked as disputed by a vendor, which said the errors did not come from its tool`
      : "";
  return recordOf({
    id: row.id,
    type: "hallucination_cases",
    title: `${CHARLOTIN_RECORD_MARK}: ${display}`,
    summary: summaryWithClosing(
      [
        `${CHARLOTIN_RECORD_MARK} (damiencharlotin.com), an AI incident list.`,
        WHAT_AN_ENTRY_IS,
        `AI tool as written: ${display}.`,
        `Decisions that name it: ${row.decisions}, dated ${row.first} to ${row.last}${disputed}.`,
        years === "" ? "" : `By year: ${years}.`,
        roles === "" ? "" : `Filed by: ${roles}.`,
        countries === "" ? "" : `Countries: ${countries}.`,
      ],
      CLOSING,
      RECORD_SUMMARY_MAX,
    ),
    // The count is over rows of the export, and no page shows one tool: the address names it.
    url: `${RECORD_URL}${encodeURIComponent(row.id)}`,
    identifiers: {
      // The whole first spelling, never the cut line of the title; the record builder takes
      // the angle brackets out of every identifier.
      tool: row.names[0],
      decisions: row.decisions,
      first: row.first,
      last: row.last,
      disputed: row.disputed,
    },
    names: row.names,
    publishedAt: row.last,
  });
}

export const charlotinConnector: Connector = createFileConnector<ToolRow>({
  id: "charlotin",
  version: 1,
  root: "download.csv",
  sortKey: (row) => row.id,
  files: [
    {
      url: EXPORT_URL,
      maxBytes: MAX_BYTES,
      contentTypes: ["text/csv"],
      timeoutMs: TOTAL_TIMEOUT_MS,
    },
  ],
  pin: { hosts: ["www.damiencharlotin.com"], pathPrefixes: ["/hallucinations/"] },
  read: readExport,
  toRecords: (rows) => rows.map(toRecord),
  sourceVersion: (rows) =>
    rows.reduce<string | null>(
      (newest, { last }) => (newest === null || last > newest ? last : newest),
      null,
    ),
});
