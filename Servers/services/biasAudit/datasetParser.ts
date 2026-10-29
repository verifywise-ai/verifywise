/**
 * Reads an uploaded CSV and maps its columns onto the keys the engine reads.
 *
 * Pure: it takes text and a mapping and returns records. The mapping goes from
 * a canonical key (a category key such as `sex`, or `selected` / `score`) to
 * the customer's column header, so uploaded files keep their own column names.
 *
 * A mapped column that is absent from the headers is reported as a problem
 * with the mapping, not with the data. The two have different fixes, and
 * conflating them sends the customer to check a file that is fine.
 *
 * The count of records with no demographic value is not computed here:
 * `runAudit` provides it, so there is one definition of "unknown".
 */
import { RECORD_KEYS } from "./engine/recordKeys";
import type { AuditRecord } from "./engine/types";

/** Thrown for a file with nothing to read; the caller maps it to its own error type. */
export class DatasetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetParseError";
  }
}

export interface ParsedDataset {
  records: AuditRecord[];
  headers: string[];
  mappingErrors: string[];
  /** Outcome cells that were neither blank nor a recognised yes/no value. */
  unreadableOutcomeCount: number;
  /** Score cells that were neither blank nor a number. */
  unreadableScoreCount: number;
  /** Outcome cells that were blank; each is read as not selected, so the caller decides. */
  blankOutcomeCount: number;
  /** Columns up to the last named header; blank names after it are trailing commas. */
  namedColumnCount: number;
  /**
   * Data rows missing a cell under a named column, or with a value past the
   * last named column (an extra comma, or a column with no header name).
   * Their values may sit under the wrong columns, so the caller must not
   * compute from them.
   */
  wrongWidthRowCount: number;
}

const TRUE_WORDS = new Set(["1", "true", "yes", "y", "t"]);
const FALSE_WORDS = new Set(["0", "false", "no", "n", "f"]);

/** Upload limit for a dataset, matching the shared upload default. */
export const DATASET_MAX_BYTES = 30 * 1024 * 1024;

/** RFC 4180 reader: quoted fields may hold commas, doubled quotes and newlines. */
function readCsv(text: string): string[][] {
  if (typeof text !== "string") throw new DatasetParseError("The file could not be read as text.");
  const src = text.replace(/^﻿/, "");
  // UTF-8 never decodes to more characters than bytes, so an upload within
  // the limit always passes; this bounds the loop below for any other caller.
  if (src.length > DATASET_MAX_BYTES) {
    throw new DatasetParseError("The file is too large to read.");
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) {
    throw new DatasetParseError(
      "A quoted value is never closed, so the rest of the file would be read as one value. " +
        "Check the file for a stray quotation mark.",
    );
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A row whose cells are all blank carries no applicant: an empty line, or the
  // full-width ",,,," rows a spreadsheet export often ends with. Drop it before
  // anything counts rows, so it is not read as a blank outcome or a short row.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function mappingError(key: string, column: string): string {
  return (
    `The mapping sends "${key}" to a column named "${column}", and no column by that name is ` +
    `present in the file's headers. Check the column mapping; the file itself may be fine.`
  );
}

function countNamedColumns(headers: string[]): number {
  let count = headers.length;
  while (count > 0 && headers[count - 1] === "") count--;
  return count;
}

export function parseDataset(csv: string, mapping: Record<string, string>): ParsedDataset {
  const table = readCsv(csv);
  if (table.length === 0) throw new DatasetParseError("The file is empty: it has no rows.");
  const headers = table[0].map((h) => h.trim());
  const dataRows = table.slice(1);
  if (dataRows.length === 0) {
    throw new DatasetParseError("The file has a header row but no rows of data.");
  }

  const mappingErrors: string[] = [];
  const index = new Map<string, number>();
  for (const [key, column] of Object.entries(mapping)) {
    const at = headers.indexOf(column.trim());
    if (at === -1) mappingErrors.push(mappingError(key, column));
    else index.set(key, at);
  }

  let unreadableOutcomeCount = 0;
  let unreadableScoreCount = 0;
  let blankOutcomeCount = 0;
  let wrongWidthRowCount = 0;
  const namedColumns = countNamedColumns(headers);
  const records: AuditRecord[] = dataRows.map((cells) => {
    // Trailing commas, in the header or in a row, add blank cells past the
    // last named column and move no value. A row is wrong width when it is
    // missing a named column's cell or has a value past the last named one.
    const filledExtra = cells.slice(namedColumns).some((c) => c.trim() !== "");
    if (cells.length < namedColumns || filledExtra) wrongWidthRowCount++;
    const record: AuditRecord = {};
    for (const [key, at] of index) {
      const raw = (cells[at] ?? "").trim();
      if (key === RECORD_KEYS.selected) {
        const word = raw.toLowerCase();
        if (TRUE_WORDS.has(word)) record[key] = true;
        else {
          record[key] = false;
          if (word === "") blankOutcomeCount++;
          else if (!FALSE_WORDS.has(word)) unreadableOutcomeCount++;
        }
      } else if (key === RECORD_KEYS.score) {
        const n = raw === "" ? NaN : Number(raw);
        record[key] = Number.isFinite(n) ? n : null;
        if (raw !== "" && !Number.isFinite(n)) unreadableScoreCount++;
      } else record[key] = raw;
    }
    return record;
  });

  return {
    records,
    headers,
    mappingErrors,
    unreadableOutcomeCount,
    unreadableScoreCount,
    blankOutcomeCount,
    namedColumnCount: namedColumns,
    wrongWidthRowCount,
  };
}
