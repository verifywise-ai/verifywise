/**
 * The nonmerger enforcement actions of the US Federal Trade Commission as a list of the vendor risk
 * database: one CSV file that the FTC publishes with its open data (CC0), a row for each matter with
 * the fiscal year, the day, the matter number, the matter title, the kind of action, the industry
 * and a hyperlink to the FTC's page of the matter. The title is the only place that names a party
 * (the file has no party field), so a record is made for each party that the title names, and it is
 * weak: the party is a fragment of a title, which may be a topic, a group of firms or another
 * company of the same name. A record is a list entry and no finding: it never says that a vendor
 * broke the law, it says that the FTC's list names a party of that name in the title of a matter.
 *
 * The file declares UTF-8 and its bytes are windows-1252 (the en dash is the byte 0x96), so the
 * connector decodes it as windows-1252 whatever the Content-Type says. Only the file's Last-Modified
 * is sent back to the server (the FTC sends no ETag): a 304 on it is an unchanged list, and a 200
 * with the same body is caught by the sync's hash.
 *
 * The party rule (`ftcCompetitionPartiesOf`) reads the title: every parenthetical group is cut (a
 * natural person is named only there, or after a dash), the title is cut at the first ` - `, the
 * `FTC v` that leads a title is taken off, and the rest is split at the slashes. A party whose name
 * has fewer than four letters and digits (without its legal form) gives no record. There is no
 * person rule: none that works on this field was found.
 *
 * The id of a party is its compact name without the legal form, as it is up to 100 units; a longer
 * name gives its first 83 units, a tilde and 16 hex digits of the SHA-256 of the whole compact name,
 * so that two long names with one start are two records (no compact name holds a tilde). The
 * identifier `party` holds the first spelling of the party whole; the title and the summary of the
 * record show it cut at 100 characters, with the marker.
 *
 * Left out: the fiscal year but as a check of the day, and the hyperlink but as the address of the
 * record when it is an address of the FTC's own site (it is never in the text of a record).
 *
 * Two records can share an address, because the parties of one matter share its link and the file
 * itself gives one hyperlink to more than one matter: the ledger that drops a record whose address it
 * already holds is that of one web session (one vendor's run), the loss needs a single run to match
 * both records, and the link is the FTC's own, so this is accepted.
 *
 * It keeps no address, no message and no row in an error or in a log: the failures are the kit's.
 */
import { createHash } from "node:crypto";
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { cutAtCodePoint } from "../../text";
import type { ParsedRecord } from "../types";
import type { Pin } from "./kit/address";
import {
  SHORTENED,
  compareText,
  dayText,
  distinct,
  lineOf,
  shorten,
  withoutAngles,
} from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const FTC_COMPETITION_RECORD_MARK = "FTC nonmerger enforcement actions";

/** The host as the first sentence of a record writes it: the operator's, without `www.`. */
const HOST = "ftc.gov";
const FILE_URL =
  "https://www.ftc.gov/system/files/ftc_gov/data/FTC-Nonmerger-Enforcement-Actions.csv";
const ROOT = "FTC-Nonmerger-Enforcement-Actions.csv";
/** The page of the dataset: a catalogue's, since the FTC has none of its own for a file. */
const DOCUMENTATION_URL = "https://catalog.data.gov/dataset/ftc-nonmerger-enforcement-actions";

/** Where the answer may come from, after the redirects. */
const PIN: Pin = { hosts: ["www.ftc.gov"], pathPrefixes: ["/system/files/ftc_gov/data/"] };

/** The file says UTF-8, and its bytes are windows-1252: the charset it declares is not believed. */
const FILE_CHARSET = "text/csv; charset=windows-1252";

const MAX_ROWS = 5000;
const MAX_COLUMNS = 16;

/** The names of the header, in order, as they are compared: trimmed and in lower case. */
const HEADER = [
  "matterenforcementfy",
  "matterenforcementdate",
  "matternumber",
  "mattername",
  "matterenforcementtype",
  "matterindustry",
  "matterhyperlink",
];
const COLUMNS = HEADER.length;
/** The list has 188 rows today; a file of fewer than this is no copy of it. */
const MIN_ROWS = 150;
/** The oldest matter of the list is of 1996; a list that begins after this day is cut. */
const LATEST_FIRST_DAY = "1996-12-31";

/** A matter number: seven digits, and a lower case letter when the matter has a part. */
const NUMBER = /^[0-9]{7}[a-z]?$/;
const FISCAL_YEAR = /^[0-9]{4}$/;
/** A day as the file writes it: month first, no padding, and a time that is always midnight. */
const DAY = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4}) 0:00:00$/;
/** A parenthetical group that holds no other: the inner ones go first. */
const GROUP = /\([^()]*\)/g;
const FTC_PREFIX = /^FTC\s+v\.?\s+/i;
/** An address of the FTC's own site. */
const FTC_LINK = /^https?:\/\/(?:www\.)?ftc\.gov\/\S+$/;
/**
 * What an address of a record may not hold (kit/record.ts says the same): the characters that
 * markup and a quotation are made of, white space, the controls and the characters nobody sees. A
 * link that holds one is no link, so the record has the address of the documentation, and the
 * record builder never has to refuse the address.
 */
const UNSAFE_LINK = /[<>"`\\^{|}\p{Cc}\p{Cf}\s]/u;

const LINK_MAX = 500;
/** A cell longer than this is no link, and is not read. */
const LINK_CELL_MAX = 600;
const NUMBER_CELL_MAX = 20;
const DATE_CELL_MAX = 40;
const TITLE_CELL_MAX = 200;
/** What a record shows of a title. */
const TITLE_SHOWN = 80;
const TYPE_MAX = 40;
const INDUSTRY_MAX = 60;
const DISPLAY_MAX = 100;
/** The longest id: the compact name of a party is the id itself up to here (see `idOf`). */
const ID_MAX = 100;
/** The hex digits of the hash that ends the id of a compact name that is too long. */
const ID_HASH_DIGITS = 16;
/** The units of such a name that its id keeps: with the tilde and the hash, ID_MAX in all. */
const ID_KEPT = ID_MAX - 1 - ID_HASH_DIGITS;
/** A name key has four letters and digits at least (keys.ts). */
const MIN_NAME_CHARS = 4;
const NAMES_KEPT = 3;
const NEWEST_KEPT = 3;
const NUMBERS_KEPT = 10;

/**
 * The parties of a matter title and the title as a record shows it, as the party rule reads it.
 * `name` is a cell as `lineOf` gives it. Every parenthetical group is removed, the inner first, as
 * many times as there are (a group that is never closed is cut with all that follows it, so that
 * nothing of it is read), the white space is collapsed, and the title is cut at the first ` - `.
 * That is the title. The parties are what it holds, without a leading `FTC v` or `FTC v.`, split at
 * the slashes and trimmed, and only those whose name has four letters and digits or more once its
 * legal form is taken off (`shortName`): a name of three is no key.
 */
export function ftcCompetitionPartiesOf(name: string): { title: string; parties: string[] } {
  let text = name;
  // One pass takes the groups that hold no other; the next takes the ones that held them.
  for (let before = ""; before !== text;) {
    before = text;
    text = text.replace(GROUP, "");
  }
  const open = text.indexOf("(");
  if (open !== -1) text = text.slice(0, open);
  text = text.replace(/\s+/g, " ").trim();
  const cut = text.indexOf(" - ");
  if (cut !== -1) text = text.slice(0, cut).trim();

  const parties = text
    .replace(FTC_PREFIX, "")
    .split("/")
    .map((party) => party.trim())
    .filter((party) => compactName(shortName(party)).length >= MIN_NAME_CHARS);
  return { title: text, parties };
}

/** One matter of a party, as the body keeps it: its newest are shown by a record. */
export interface FtcCompetitionMatter {
  /** The matter number, seven digits and perhaps a letter. */
  number: string;
  /** The day of the action, YYYY-MM-DD. */
  day: string;
  /** The title after the cuts, at most 80 characters, with the `FTC v` it may begin with. */
  title: string;
  /** The kind of action, as the FTC writes it; empty when the file has none. */
  type: string;
  industry: string;
}

/** One party: the row of the body, and what a record is made of. */
export interface FtcCompetitionRow {
  /** The compact name of the party without its legal form. */
  id: string;
  /** The spelling of the party that the most matters use. */
  display: string;
  /** The names a vendor may match the record by: the spellings, at most three. */
  names: string[];
  /** The distinct matters that name it: a number and a day each. */
  matters: number;
  firstYear: number;
  lastYear: number;
  /** The newest three matters, the newest first. */
  newest: FtcCompetitionMatter[];
  /** The numbers of the newest matters, each once, the newest first, at most ten. */
  numbers: string[];
  /** The FTC's page of the newest matter that has one; null when none has. */
  url: string | null;
  /** The day of the newest matter. */
  publishedAt: string;
}

/**
 * The day of a matter, YYYY-MM-DD: the file writes month first and no padding (`5/10/2023 0:00:00`
 * is the 10th of May), the day must exist, and it must belong to the fiscal year that the row
 * states, the year that ends on the 30th of September (so the 1st of October is of the next year).
 */
function matterDayOf(dateCell: string, fiscalCell: string): string | null {
  const match = DAY.exec(lineOf(dateCell, DATE_CELL_MAX));
  if (match === null) return null;
  const month = Number(match[1]);
  const year = Number(match[3]);
  const day = dayText(`${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`);
  if (day === null) return null;
  const fiscal = lineOf(fiscalCell, DATE_CELL_MAX);
  return FISCAL_YEAR.test(fiscal) && Number(fiscal) === (month >= 10 ? year + 1 : year)
    ? day
    : null;
}

/** The address of an FTC page that a candidate is, written with https; null when it is none. */
function ftcAddressOf(candidate: string): string | null {
  const text = candidate.trim();
  if (text.length > LINK_MAX || !FTC_LINK.test(text) || UNSAFE_LINK.test(text)) return null;
  return text.replace(/^http:/, "https:");
}

/**
 * The FTC page that a hyperlink cell names. A spreadsheet writes a link as `text#address#`: the
 * address is what stands between the first and the second `#` (the first when the cell begins with
 * `#`, so that there is no text). A cell with a `#` and no address there is read by the text before
 * it, which the file writes as the address when it has no other text, and a cell with no `#` is the
 * address itself. It is the FTC's own site (`www.ftc.gov` or `ftc.gov`), at most 500 characters,
 * with no character that an address of a record may not hold; anything else is no link. The cell is
 * read as it is, never cleaned: a link whose hidden characters were taken out would be another one.
 */
function linkOf(cell: string): string | null {
  const text = cell.trim();
  if (text.length > LINK_CELL_MAX) return null;
  const parts = text.split("#");
  const candidates = text.startsWith("#")
    ? [parts[1]]
    : parts.length > 1
      ? [parts[1], parts[0]]
      : [text];
  for (const candidate of candidates) {
    const link = ftcAddressOf(candidate);
    if (link !== null) return link;
  }
  return null;
}

/** One row of the file that could be read. */
interface MatterLine {
  number: string;
  day: string;
  title: string;
  type: string;
  industry: string;
  link: string | null;
  parties: string[];
}

/** The matter of a row, or null when it does not have the seven cells or one is not in its form. */
function matterLineOf(row: readonly string[]): MatterLine | null {
  const cells = cellsOf(row, COLUMNS);
  if (cells === null) return null;
  const number = lineOf(cells[2], NUMBER_CELL_MAX);
  const day = matterDayOf(cells[1], cells[0]);
  const name = lineOf(cells[3], TITLE_CELL_MAX);
  // A title that was cut is not the title of a matter.
  if (!NUMBER.test(number) || day === null || name === "" || name.endsWith(SHORTENED)) return null;
  const { title, parties } = ftcCompetitionPartiesOf(name);
  return {
    number,
    day,
    title: lineOf(title, TITLE_SHOWN),
    type: lineOf(cells[4], TYPE_MAX),
    industry: lineOf(cells[5], INDUSTRY_MAX),
    link: linkOf(cells[6]),
    parties,
  };
}

/** The rows of one matter of a party while the rows are collected: a matter may be on several rows. */
interface MatterGroup {
  number: string;
  day: string;
  titles: string[];
  types: string[];
  industries: string[];
  links: string[];
}

/** A party while the rows are collected. */
interface Group {
  matters: Map<string, MatterGroup>;
  /** Each spelling of the party (as the title writes it) and the matters that use it. */
  spellings: Map<string, Set<string>>;
}

/**
 * The id of a party: its compact name without the legal form, as it is when it has ID_MAX units or
 * fewer. A longer name is cut, and a cut alone would give one id to two parties whose names differ
 * only after it (their matters would be one record), so the id is its first ID_KEPT units, a tilde
 * and the first 16 hex digits of the SHA-256 of the WHOLE compact name. A tilde is in no compact
 * name (letters and digits), so such an id is never one of a name that was not cut. It is a function
 * of the compact name alone, so no order of the rows changes it.
 */
function idOf(party: string): string {
  const compact = compactName(shortName(party));
  if (compact.length <= ID_MAX) return compact;
  const digest = createHash("sha256")
    .update(compact, "utf8")
    .digest("hex")
    .slice(0, ID_HASH_DIGITS);
  return `${cutAtCodePoint(compact, ID_KEPT)}~${digest}`;
}

/**
 * The parties of the rows, each with the matters that name it. A matter is a number and a day, so a
 * row that names a party twice (two spellings of it) and a row that is written twice are one matter
 * of the party.
 */
function groupsOf(lines: readonly MatterLine[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const line of lines) {
    const matterKey = `${line.number} ${line.day}`;
    for (const party of line.parties) {
      const id = idOf(party);
      let group = groups.get(id);
      if (group === undefined) {
        group = { matters: new Map(), spellings: new Map() };
        groups.set(id, group);
      }
      let matter = group.matters.get(matterKey);
      if (matter === undefined) {
        matter = {
          number: line.number,
          day: line.day,
          titles: [],
          types: [],
          industries: [],
          links: [],
        };
        group.matters.set(matterKey, matter);
      }
      matter.titles.push(line.title);
      matter.types.push(line.type);
      matter.industries.push(line.industry);
      if (line.link !== null) matter.links.push(line.link);
      const spelling = group.spellings.get(party);
      if (spelling === undefined) group.spellings.set(party, new Set([matterKey]));
      else spelling.add(matterKey);
    }
  }
  return groups;
}

/** A matter with its link, as the rows of the matter give it. */
interface MatterOf extends FtcCompetitionMatter {
  link: string | null;
}

/** The first by the order of the text of the values that are not empty; an empty text when there is none. */
const firstOf = (values: readonly string[]): string =>
  values.filter((value) => value !== "").sort(compareText)[0] ?? "";

/**
 * The matter of its rows: a matter is a number and a day, and the rows of one (the file has one that
 * is written twice) give one title, one kind, one industry and one link, each the first by the order
 * of the text, so that the order of the rows never decides.
 */
function matterOf(group: MatterGroup): MatterOf {
  return {
    number: group.number,
    day: group.day,
    title: firstOf(group.titles),
    type: firstOf(group.types),
    industry: firstOf(group.industries),
    link: firstOf(group.links) || null,
  };
}

/** The newer matter first; on one day the greater number first, so that no order of the rows decides. */
const compareMatters = (a: MatterOf, b: MatterOf): number =>
  compareText(b.day, a.day) || compareText(b.number, a.number);

/** The spellings by the matters that use them, the most first; on a tie, by the order of the text. */
const rankedSpellings = (map: ReadonlyMap<string, ReadonlySet<string>>): string[] =>
  [...map]
    .sort(([a, mattersA], [b, mattersB]) => mattersB.size - mattersA.size || compareText(a, b))
    .map(([spelling]) => spelling);

/** The party of a group. */
function rowOf(id: string, group: Group): FtcCompetitionRow {
  const matters = [...group.matters.values()].map(matterOf).sort(compareMatters);
  const newest = matters[0];
  const oldest = matters[matters.length - 1];
  const spellings = rankedSpellings(group.spellings);
  return {
    id,
    display: withoutAngles(lineOf(spellings[0], DISPLAY_MAX)),
    names: spellings.slice(0, NAMES_KEPT),
    matters: matters.length,
    firstYear: Number(oldest.day.slice(0, 4)),
    lastYear: Number(newest.day.slice(0, 4)),
    newest: matters.slice(0, NEWEST_KEPT).map(({ number, day, title, type, industry }) => ({
      number,
      day,
      title,
      type,
      industry,
    })),
    numbers: distinct(
      matters.map((matter) => matter.number),
      NUMBERS_KEPT,
    ),
    url: matters.find((matter) => matter.link !== null)?.link ?? null,
    publishedAt: newest.day,
  };
}

/** Whether a row is the header of the list: the seven names in order, in any case, and no cell more. */
const isHeader = (row: readonly string[] | undefined): boolean =>
  row !== undefined &&
  row.length === COLUMNS &&
  row.every((cell, at) => cell.trim().toLowerCase() === HEADER[at]);

/**
 * The parties of the file: null when it is not the list. The first row must be the header, and the
 * file must hold at least MIN_ROWS rows of which the first is of 1996 or before. A row that does not
 * have the seven cells or whose cells are not in their form is counted as one that could not be read;
 * a row whose title names no party is dropped here and is neither.
 */
function read(fetched: Fetched): ReadResult<FtcCompetitionRow> | null {
  const text = textOf({ ...fetched, contentTypes: [FILE_CHARSET] }, 0);
  const csv = readCsvText(text, MAX_ROWS, MAX_COLUMNS);
  if (!isHeader(csv.rows[0])) return null;
  if (!csv.complete) return { rows: [], total: 0, unreadable: 0, complete: false };

  const data = csv.rows.slice(1);
  if (data.length < MIN_ROWS) return null;
  let earliest: string | null = null;
  for (const row of data) {
    const day = row.length > 1 ? matterDayOf(row[1], row[0]) : null;
    if (day !== null && (earliest === null || day < earliest)) earliest = day;
  }
  if (earliest === null || earliest > LATEST_FIRST_DAY) return null;

  let unreadable = 0;
  const lines: MatterLine[] = [];
  for (const row of data) {
    const line = matterLineOf(row);
    if (line === null) unreadable += 1;
    else lines.push(line);
  }
  const rows = [...groupsOf(lines)].map(([id, group]) => rowOf(id, group));
  // The rows of the file are counted as they are; a title with several parties may make more
  // entities than the file has rows, and the total is never below what was read.
  return {
    rows,
    total: Math.max(data.length, rows.length + unreadable),
    unreadable,
    complete: csv.complete,
  };
}

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${FTC_COMPETITION_RECORD_MARK} (${HOST}), an enforcement or case list.`;

/**
 * The last sentence of every record: what the record is and is not. It is never cut and never left
 * out.
 */
const CLOSING =
  "VerifyWise read the party from the matter title, so it may be another company of the same " +
  "name or a group of firms; an enforcement action is not a finding that the vendor broke the " +
  "law. Not endorsed by the FTC; adapted by VerifyWise.";

/** One of the newest matters: the day, the number, the title, the kind and the industry. */
function entryOf(matter: FtcCompetitionMatter): string {
  return [matter.day, `matter ${matter.number}`, `"${matter.title}"`, matter.type, matter.industry]
    .filter((part) => part !== "")
    .join(", ");
}

/** What the list holds of the party: in how many matters, and when. */
function countSentenceOf(row: FtcCompetitionRow): string {
  const matters = `${row.matters} matter${row.matters === 1 ? "" : "s"}`;
  const years =
    row.firstYear === row.lastYear ? `${row.lastYear}` : `${row.firstYear} to ${row.lastYear}`;
  return `The US Federal Trade Commission's list of nonmerger (antitrust) enforcement actions names it in the title of ${matters}, dated ${years}.`;
}

/**
 * The text of a record: the list and its kind (S1), the party (S2), what the list holds of it (S3),
 * the newest matters (S4) and the closing sentence. It is the whole when it fits in `max`; otherwise
 * the newest matters are dropped from the end, the third and then the second, and then the name of
 * the party is cut; the closing sentence is never cut, so that `recordOf` never has to cut it.
 * (With the caps of the fields the text is at most about 1,200 characters, and 791 on today's file,
 * so this is the safety net of a cap that is raised.)
 */
export function ftcCompetitionSummaryOf(
  row: FtcCompetitionRow,
  max: number = RECORD_SUMMARY_MAX,
): string {
  const entries = row.newest.map(entryOf);
  const sentencesOf = (display: string, shown: number): string[] => [
    FIRST_SENTENCE,
    sentence("Party", display),
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
 * The record of a party. The title and the summary show the display, which is cut at DISPLAY_MAX; the
 * identifier is never a cut text, so it holds the first spelling of the party whole (a title is read
 * to TITLE_CELL_MAX units), and the kit takes the angle brackets out of it.
 */
function recordFor(row: FtcCompetitionRow): ParsedRecord {
  return recordOf({
    id: row.id,
    type: "competition_action_summary",
    title: `${FTC_COMPETITION_RECORD_MARK}: ${row.display}`,
    summary: ftcCompetitionSummaryOf(row),
    // The FTC's page of the newest matter that has one; else the dataset's page, with the party:
    // the evidence ledger keeps one record for an address.
    url: row.url ?? `${DOCUMENTATION_URL}?party=${encodeURIComponent(row.id)}`,
    identifiers: { party: row.names[0] ?? row.display, matters: row.numbers },
    names: row.names,
    publishedAt: row.publishedAt,
    sourceUpdatedAt: null,
  });
}

export const ftcCompetitionConnector: Connector = createFileConnector<FtcCompetitionRow>({
  id: "ftc_competition",
  version: 1,
  root: ROOT,
  sortKey: (row) => row.id,
  files: [{ url: FILE_URL, maxBytes: 1_048_576, contentTypes: ["text/csv"], timeoutMs: 60_000 }],
  pin: PIN,
  read,
  toRecords: (rows) => rows.map(recordFor),
  sourceVersion: (rows) =>
    rows.reduce<string | null>(
      (latest, row) => (latest === null || row.publishedAt > latest ? row.publishedAt : latest),
      null,
    ),
});
