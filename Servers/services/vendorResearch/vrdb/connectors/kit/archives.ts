/**
 * The archive helpers of the list kit: the one file of a zip, and one sheet of a workbook as a table
 * of text. Both wrap the readers that were made for third-party data (the zip reader, vrdb/zip.ts,
 * and the sheet reader, vrdb/xlsx.ts), which inflate within the limits their caller fixes, in time
 * in proportion to the size of what they read, and neither duplicates what they do. What is not a
 * zip, or not the workbook of a list, is null: a reader of the list then finds no list. What is
 * past a limit is not a smaller list: it is too large (`BodyTooLargeError` for a zip) or an
 * incomplete table (`complete: false`, which the factory turns into the same failure,
 * kit/fileConnector.ts).
 */
import { type CellValue, type XlsxLimits, readSheetParts, sheetRowsOf } from "../../xlsx";
import { type ZipLimits, ZipError, forEachZipEntry } from "../../zip";
import { BodyTooLargeError, NotTheListError } from "../types";

/** What stops the walk through a zip once a second entry is handed out. */
class MoreThanOneEntry extends Error {
  constructor() {
    super("The zip holds more than one entry of the list.");
    this.name = "MoreThanOneEntry";
  }
}

/** The failure of a zip that cannot be read within its limits is the file's being too large. */
const isLimit = (error: ZipError): boolean =>
  error.code === "too_large" || error.code === "too_deep";

/**
 * The bytes of the one entry of a zip that `accept` takes (a name is given as the zip has it and
 * never becomes a path; a folder is no entry). Null for a zip with none, for one with more than one
 * (the walk stops at the second), and for what the zip reader cannot read: not a zip, a zip that is
 * cut or whose sizes or checksum do not hold, an entry that is encrypted or of a method nobody
 * reads. A zip past a limit (the entries of a directory, the bytes of an entry or of all that were
 * handed out, a zip inside a zip inside a zip) is `BodyTooLargeError`. A zip inside the zip that
 * `accept` takes is read once more, and the entry that is handed out is the one inside, as
 * `forEachZipEntry` does. Any other error (an `accept` that throws) goes through.
 */
export function onlyEntryOf(
  buffer: Buffer,
  accept: (name: string) => boolean,
  limits: ZipLimits,
): Buffer | null {
  let only: Buffer | null = null;
  try {
    forEachZipEntry(buffer, accept, limits, (entry) => {
      if (only !== null) throw new MoreThanOneEntry();
      only = entry.data;
    });
  } catch (error) {
    if (error instanceof MoreThanOneEntry) return null;
    if (error instanceof ZipError) {
      if (isLimit(error)) throw new BodyTooLargeError();
      return null;
    }
    throw error;
  }
  return only;
}

/** A cell as the text a reader of the list works with: a trimmed text, a number as JavaScript writes it, else nothing. */
const cellText = (cell: CellValue): string =>
  typeof cell === "string" ? cell.trim() : typeof cell === "number" ? String(cell) : "";

/**
 * The cells of the sheet that has this name, as trimmed text, row by row (the row `n` of the sheet is
 * `rows[n - 1]`, as long as its last cell, an empty text for a cell it lacks; a number is
 * `String(number)`, a boolean 1 or 0, as the sheet reader and the AI Incident Database's reader
 * give them). Null when the zip is not a workbook that has the sheet, when the workbook counts its
 * dates from 1904 (a number would then mean another day than the one that a reader of the list
 * works out), or when the sheet is not a well formed worksheet (a cell with no place, a cut
 * document): the file is not the list. `complete` is false, with no row, when a limit stopped the
 * read: the zip's limits, or a cell past the last row or column that the limits allow (the sheet
 * reader gives no part of a sheet that is past them). Any error that is not the readers' own goes
 * through.
 */
export function readSheetTable(
  buffer: Buffer,
  sheet: string,
  limits: XlsxLimits,
): { rows: string[][]; complete: boolean } | null {
  try {
    const parts = readSheetParts(buffer, sheet, limits.zip);
    if (parts.date1904) return null;
    const cells = sheetRowsOf(parts.sheetXml, parts.sharedStringsXml, limits);
    if (cells.errors > 0 || cells.root !== "worksheet") return null;
    return { rows: cells.rows.map((row) => row.map(cellText)), complete: true };
  } catch (error) {
    if (error instanceof NotTheListError) return null;
    if (error instanceof ZipError) return isLimit(error) ? { rows: [], complete: false } : null;
    throw error;
  }
}
