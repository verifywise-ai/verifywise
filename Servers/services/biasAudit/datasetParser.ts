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
}

const TRUE_WORDS = new Set(["1", "true", "yes", "y", "t"]);
const FALSE_WORDS = new Set(["0", "false", "no", "n", "f"]);

/** RFC 4180 reader: quoted fields may hold commas, doubled quotes and newlines. */
function readCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
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
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function mappingError(key: string, column: string): string {
  return (
    `The mapping sends "${key}" to a column named "${column}", and no column by that name is ` +
    `present in the file's headers. Check the column mapping; the file itself may be fine.`
  );
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
  const records: AuditRecord[] = dataRows.map((cells) => {
    const record: AuditRecord = {};
    for (const [key, at] of index) {
      const raw = (cells[at] ?? "").trim();
      if (key === RECORD_KEYS.selected) {
        const word = raw.toLowerCase();
        if (TRUE_WORDS.has(word)) record[key] = true;
        else {
          record[key] = false;
          if (word !== "" && !FALSE_WORDS.has(word)) unreadableOutcomeCount++;
        }
      } else if (key === RECORD_KEYS.score) {
        const n = raw === "" ? NaN : Number(raw);
        record[key] = Number.isFinite(n) ? n : null;
        if (raw !== "" && !Number.isFinite(n)) unreadableScoreCount++;
      } else record[key] = raw;
    }
    return record;
  });

  return { records, headers, mappingErrors, unreadableOutcomeCount, unreadableScoreCount };
}
