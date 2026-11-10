/**
 * The Foundation Model Transparency Index (github.com/stanford-crfm/fmti) as a mirrored list of the
 * vendor risk database: the December 2025 scores file of the Stanford Center for Research on
 * Foundation Models, one small wide CSV. Its header is `Indicator` and one column for each
 * developer of foundation models (13 today), and each of its rows (100 today) is one transparency
 * indicator, whose cell for a developer is 0 or 1. It is licensed (CC BY 4.0, the repository's
 * LICENSE.md), complete by construction, and holds no personal data. A record is one DEVELOPER
 * column, a state and context only: it measures how much a developer disclosed,
 * as the index's team scored it, and not safety, quality or compliance.
 *
 * The record shows the file's own cells, counted: how many of its indicators are marked 1 for the
 * developer, and how many indicator rows the file has. The text says that the count is made by
 * VerifyWise from the file and that the index team's own published scores are the only validated
 * ones; it is never called the index score. The indicator names (CC BY text that a record does not
 * need) are read to check the rows and are never kept, and the transparency reports of the
 * repository (partly written by the companies) are never fetched.
 *
 * The id of a record is the compact name of the developer's header (`openai`, `ai21labs`), and it
 * has no edition in it, so that a new edition updates the same records. Its key is the name as
 * written and without its legal form (record.ts does both) and nothing else: the headers are
 * brand names (`Meta`, `Google`), so a vendor stored as `Meta Platforms, Inc.` does not match,
 * which is the honest limit of exact keys. There is no domain key. A natural person is never a
 * key: the headers are organisations' brand names (13 of 13 read), and no person is a developer of
 * the index. A header of fewer than four letters and digits (the real file has two) is no key: its
 * column gives no record, and it is counted as no entity, which is neither a record nor
 * unreadable.
 *
 * The edition table is in code (`EDITIONS`): the connector reads the last one, and a new edition is
 * invisible until a release adds it, since the text names the edition.
 *
 * Reading. The first cell of the header must be `Indicator` (a blank around it is no matter), the
 * file must have at least five developer columns (a column with no header is no column: its cells
 * are not read, and a header that gives no key counts) and at least 50 readable indicator rows,
 * with at least one developer that has a key, and no two rows may have one name: any other file is
 * not the list (null). More than 200 indicator rows, or a row of more than 200 cells below the
 * header, or a quote that is never closed, is a file too large to read whole (`complete` is false
 * and the download fails as too large, never as a shorter list): the rows have a range and no
 * limit of columns is given, and 200 is more than fifteen times the 14 of today. A header of more
 * than 200 cells is not read at all (the table reader stops before a row that wide, so that no
 * first cell is left to check), and such a file is not the list (null). A row is unreadable when
 * it does not have the width of the header, has no indicator name (or one of over 200
 * characters), or has a cell that is not exactly `0` or `1` in any column that has a header (a
 * count over the other rows would be of another table, so the row is left out whole). A developer
 * column is unreadable when its header is over 40 characters (a cut name would key two names
 * alike) or shares its key with another column (both are left out: the order of the columns must
 * never decide which survives). The unreadable ones are counted and left to the kit's allowance,
 * which for a table of so few records is a tenth of them rounded up, lower than the usual ten
 * rows.
 */
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import { SHORTENED, lineOf } from "./kit/clean";
import {
  type Fetched,
  type ListSpec,
  type ReadResult,
  createFileConnector,
} from "./kit/fileConnector";
import { RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const FMTI_RECORD_MARK = "Foundation Model Transparency Index";

/** The editions of the index that this reader knows; the last one is read. */
const EDITIONS = [
  { label: "December 2025", version: "Dec2025", path: "Dec2025/Dec2025_scores.csv" },
] as const;
const EDITION = EDITIONS[EDITIONS.length - 1];
const FILE_URL = `https://raw.githubusercontent.com/stanford-crfm/fmti/main/${EDITION.path}`;
/** The repository of the index, which the address of every record is: the list is one file, so a record has no page of its own. */
const PAGE_URL = "https://github.com/stanford-crfm/fmti?developer=";
/** The name of the file: the root that a parse of the list gives. */
const ROOT = EDITION.path.slice(EDITION.path.lastIndexOf("/") + 1);
/** The file is 5 KB today: the limit is 200 times that. */
const MAX_BYTES = 1_048_576;
const TIMEOUT_MS = 60_000;

const INDICATOR_HEADER = "Indicator";
/** Fewer readable indicator rows than this is not the index; more than the maximum is not read. */
const MIN_INDICATORS = 50;
const MAX_INDICATORS = 200;
/** Fewer developer columns than this is not the index. */
const MIN_DEVELOPERS = 5;
/** A row of more cells than this (the indicator column and a column for each developer) is not read. */
const MAX_COLUMNS = 200;
const DEVELOPER_CHARS = 40;
const INDICATOR_CHARS = 200;
/** The shortest compact name that is a key (keys.ts: a shorter one matches no list). */
const MIN_KEY_CHARS = 4;
/** What a cut line ends with (kit/clean.ts): a name that carries it was cut and is no name. */
const CUT_MARK = SHORTENED.trimStart();

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${FMTI_RECORD_MARK} (github.com/stanford-crfm), a register or status list.`;
/** The second: what a record is and is not. It comes early, so that no cut of a long text can reach it. */
const NOT_A_FINDING =
  "A record shows how much a developer of foundation models disclosed, as the index's team " +
  "scored it; it measures transparency, not safety, quality or compliance.";
/** The last: the licence's credit, which no cut of a long text may take. */
const SOURCE_SENTENCE =
  "Source: Foundation Model Transparency Index, Stanford CRFM (Bommasani, Klyman et al.), " +
  "CC BY 4.0; adapted by VerifyWise.";

/** What the file says of one developer: the row of the snapshot, and the record that it makes. */
interface DeveloperRow {
  /** The compact name of the header: the id of the record. */
  id: string;
  /** The header as written, cleaned, at most 40 characters. */
  developer: string;
  /** The indicators that the file marks 1 for the developer, counted over the rows that read. */
  met: number;
  /** The indicator rows that read. */
  indicators: number;
  /** The label of the edition, the same in every row. */
  edition: string;
}

/** A developer column that has a key. */
interface Column {
  at: number;
  developer: string;
  key: string;
}

/** A cell as one whole line of at most `max` characters: null when it is empty, or was cut. */
function wholeLine(value: string, max: number): string | null {
  const line = lineOf(value, max);
  return line === "" || line.endsWith(CUT_MARK) ? null : line;
}

/**
 * What the header says of the developers: the columns that have a header at all (their cells are
 * read), the columns that have a key and are the only ones of it, and how many columns could not be
 * made a developer. A column with no header is no column; a header of fewer than four letters and
 * digits is no key and no entity; a header that was cut, and every column of a key that two share,
 * is unreadable.
 */
function developersOf(header: readonly string[]): {
  present: number[];
  unique: Column[];
  unreadable: number;
} {
  const present: number[] = [];
  const named: Column[] = [];
  let unreadable = 0;
  for (let at = 1; at < header.length; at += 1) {
    const cell = lineOf(header[at], DEVELOPER_CHARS);
    if (cell === "") continue;
    present.push(at);
    if (cell.endsWith(CUT_MARK)) {
      unreadable += 1;
      continue;
    }
    const key = compactName(cell);
    if (key.length >= MIN_KEY_CHARS) named.push({ at, developer: cell, key });
  }
  const occurrences = new Map<string, number>();
  for (const { key } of named) occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  const unique = named.filter(({ key }) => occurrences.get(key) === 1);
  return { present, unique, unreadable: unreadable + named.length - unique.length };
}

function read(fetched: Fetched): ReadResult<DeveloperRow> | null {
  // The header and the rows that are allowed: more is `more`, and then the table is not whole.
  const table = readCsvText(textOf(fetched, 0), MAX_INDICATORS + 1, MAX_COLUMNS);
  const [header, ...data] = table.rows;
  if (header === undefined || header[0].trim() !== INDICATOR_HEADER) return null;
  // A table that was not read to its end is no list to read whole: it is too large, and the reader
  // gives none of it rather than a part.
  if (!table.complete) return { rows: [], total: data.length, unreadable: 0, complete: false };

  const { present, unique, unreadable: unreadableColumns } = developersOf(header);
  if (present.length < MIN_DEVELOPERS) return null;

  const names = new Set<string>();
  const met = new Map<number, number>();
  let readable = 0;
  for (const row of data) {
    const name = wholeLine(row[0], INDICATOR_CHARS);
    if (name !== null) {
      // Two rows with one name are no list of indicators.
      if (names.has(name)) return null;
      names.add(name);
    }
    const cells = cellsOf(row, header.length);
    if (name === null || cells === null) continue;
    // Exactly 0 or 1, in every column that has a header, the columns without a key included.
    if (!present.every((at) => cells[at] === "0" || cells[at] === "1")) continue;
    readable += 1;
    for (const { at } of unique) {
      if (cells[at] === "1") met.set(at, (met.get(at) ?? 0) + 1);
    }
  }
  if (readable < MIN_INDICATORS || unique.length === 0) return null;

  const rows = unique.map(({ at, developer, key }) => ({
    id: key,
    developer,
    met: met.get(at) ?? 0,
    indicators: readable,
    edition: EDITION.label,
  }));
  const unreadable = unreadableColumns + data.length - readable;
  return {
    rows,
    // A table of few rows and many developers makes more records than it has rows.
    total: Math.max(data.length, rows.length + unreadable),
    unreadable,
    complete: table.complete,
  };
}

function summaryOf(row: DeveloperRow): string {
  return summaryWithClosing(
    [
      FIRST_SENTENCE,
      NOT_A_FINDING,
      sentence("Developer", row.developer),
      `${row.edition} edition: the published scores file marks ${row.met} of its ${row.indicators} indicators as met for this developer (counted by VerifyWise from the file; the index team's own published scores are the only validated ones).`,
    ],
    SOURCE_SENTENCE,
    RECORD_SUMMARY_MAX,
  );
}

/** The address of a record: the repository's page with the id of the record, which is made of letters and digits. */
function addressOf(id: string): string {
  try {
    return `${PAGE_URL}${encodeURIComponent(id)}`;
  } catch {
    // An id that is not text that can be written in an address (a lone surrogate) is no id.
    throw new UnreadableEntry();
  }
}

function recordFor(row: DeveloperRow): ParsedRecord {
  return recordOf({
    id: row.id,
    type: "transparency_index_score",
    title: `${FMTI_RECORD_MARK}: ${row.developer}`,
    summary: summaryOf(row),
    url: addressOf(row.id),
    identifiers: {
      developer: row.developer,
      met: row.met,
      indicators: row.indicators,
      edition: row.edition,
    },
    names: [row.developer],
    publishedAt: null,
    sourceUpdatedAt: null,
  });
}

const SPEC: ListSpec<DeveloperRow> = {
  id: "fmti",
  version: 1,
  root: ROOT,
  sortKey: (row) => row.id,
  files: [
    {
      url: FILE_URL,
      maxBytes: MAX_BYTES,
      contentTypes: ["text/plain"],
      timeoutMs: TIMEOUT_MS,
    },
  ],
  pin: { hosts: ["raw.githubusercontent.com"], pathPrefixes: ["/stanford-crfm/fmti/"] },
  read,
  toRecords: (rows) => rows.map(recordFor),
  sourceVersion: () => EDITION.version,
};

export const fmtiConnector: Connector = createFileConnector(SPEC);
