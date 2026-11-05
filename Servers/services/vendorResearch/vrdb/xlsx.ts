/**
 * A reader of one sheet of an .xlsx workbook (ECMA-376, SpreadsheetML) for a list that its operator
 * publishes as a spreadsheet: the AI Incident Database export (spec D2.14). It stands on the two
 * readers made for third-party data, the zip reader (zip.ts) and the XML scanner (xmlScan.ts), and
 * on nothing else. A spreadsheet library inflates every part of a workbook with no limit of its own
 * and has had advisories for prototype pollution and for patterns that take exponential time;
 * these two inflate only the parts they are asked for, within limits, and read in time in
 * proportion to the size of what they read.
 *
 * Two steps, so that a download keeps the text of the one sheet it needs and a parse needs no zip.
 * `readSheetParts` finds the sheet by its name: the workbook names it and gives the id of its
 * relationship, the relationships name its part, and the part must be exactly
 * `xl/worksheets/sheet<N>.xml`. A target with `..`, one outside that folder and one that is not a
 * sheet's name is not the list (NotTheListError), whatever the workbook says. A target is read as
 * the package format reads it: relative to `xl/`, or from the root of the package when it starts
 * with a slash, which is how the writer of the AIID export (openpyxl) writes it. Only four parts
 * are inflated: the workbook, its relationships, `xl/sharedStrings.xml` when there is one, and that
 * sheet. `sheetRowsOf` then reads the cells of the sheet's XML.
 *
 * A cell is placed by its own reference (`AA12`), so a row need not start at column A and a row
 * without a cell is an empty array; nothing depends on the order of the cells. Its value is a
 * string (`inlineStr`, `s` shared, `str`, `d`), a number (`n` or no type) or null (an empty cell,
 * an error value, a type it does not know, a value it cannot read). A boolean is 1 or 0. A cell it
 * cannot place (no reference, or one that is not a reference) is an error, because its value would
 * belong to another row. Styles are not read: a date is the number its cell holds
 * (`dayOfExcelSerial`).
 *
 * What a sheet may hold is limited twice. The zip limits bound what is inflated; `maxRows` and
 * `maxColumns` bound what is kept, so that a sheet of a few cells at the far corner cannot cost
 * millions of empty ones. A sheet past a limit is ZipError `too_large`, which the sync maps to
 * `too_large`.
 */
import { NotTheListError } from "./connectors/types";
import { type XmlElement, scanElements } from "./xmlScan";
import { type ZipEntry, type ZipLimits, ZipError, readZip } from "./zip";

/** What a cell holds; a boolean is 1 or 0, and an empty cell is null. */
export type CellValue = string | number | null;

/** How much of a sheet is kept (see the module comment). */
export interface SheetLimits {
  /** The last row a cell may be in. */
  maxRows: number;
  /** The last column a cell may be in (`A` is 1). */
  maxColumns: number;
}

export interface XlsxLimits extends SheetLimits {
  zip: ZipLimits;
}

/** The parts of a workbook that a sheet is read from. */
export interface SheetParts {
  sheetXml: string;
  /** The text of `xl/sharedStrings.xml`; null when the workbook has none. */
  sharedStringsXml: string | null;
  /** Whether the workbook counts its dates from 1904: a serial then means another day. */
  date1904: boolean;
}

/**
 * The cells of a sheet. Row `n` of the sheet is `rows[n - 1]`, an array as long as its last cell,
 * with null for a cell it lacks. `errors` counts what the document got wrong (a cell without a
 * place, a document that is malformed or cut short, a sheet whose root is not `worksheet`) and
 * `root` is the name of its root element.
 */
export interface SheetRows {
  rows: CellValue[][];
  errors: number;
  root: string | null;
}

const WORKBOOK = "xl/workbook.xml";
const WORKBOOK_RELATIONSHIPS = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS = "xl/sharedStrings.xml";
/** The parts that name the sheets are small; a bigger one is no workbook's. */
const MAX_PACKAGE_PART_BYTES = 1024 * 1024;

const WORKSHEET_PATH = /^xl\/worksheets\/sheet[0-9]{1,9}\.xml$/;
const CELL_REFERENCE = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/;
const SHARED_INDEX = /^[0-9]{1,9}$/;
/** A number as XML Schema writes it. Each digit run is read once, so the time is that of the text. */
const NUMBER = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const MAX_NUMBER_CHARS = 40;

const textOrNull = (text: string): string | null => (text === "" ? null : text);

/** The part of a zip that was read, as text; null when the zip has none of that name. */
function partText(entries: readonly ZipEntry[], name: string): string | null {
  const found = entries.filter((entry) => entry.name === name);
  // Two parts of one name are read differently by different readers: that is not a workbook's.
  if (found.length > 1) throw new NotTheListError();
  return found.length === 1 ? found[0].data.toString("utf8") : null;
}

/** Whether an attribute of a workbook says yes. */
const isOn = (value: string | undefined): boolean => value === "1" || value === "true";

/** The id of the relationship of the sheet with this name, and whether the workbook counts from 1904. */
function sheetNamed(workbook: string, name: string): { relationshipId: string; date1904: boolean } {
  const ids: string[] = [];
  const sheets = scanElements(workbook, "sheet", (sheet) => {
    if (sheet.attributes.name === name) ids.push(sheet.attributes.id ?? "");
  });
  let date1904 = false;
  scanElements(workbook, "workbookPr", (properties) => {
    date1904 = isOn(properties.attributes.date1904?.toLowerCase());
  });
  // A name that two sheets share is read differently by different readers.
  if (sheets.root !== "workbook" || sheets.errors > 0 || ids.length !== 1 || ids[0] === "") {
    throw new NotTheListError();
  }
  return { relationshipId: ids[0], date1904 };
}

/**
 * The part a target names, as the package format resolves it: relative to the folder of the part
 * that owns the relationships (`xl/`), or from the root of the package with a leading slash. It is
 * a sheet's part or it is null; nothing with `..`, a second slash, a backslash or an escape is.
 */
function worksheetPathOf(target: string): string | null {
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  return WORKSHEET_PATH.test(path) ? path : null;
}

/** The part of the sheet whose relationship has this id. */
function sheetPathOf(relationships: string, id: string): string {
  const targets: Array<string | null> = [];
  const scan = scanElements(relationships, "Relationship", (relationship) => {
    if (relationship.attributes.Id !== id) return;
    const external = relationship.attributes.TargetMode?.toLowerCase() === "external";
    targets.push(external ? null : worksheetPathOf(relationship.attributes.Target ?? ""));
  });
  const path = targets[0];
  if (scan.root !== "Relationships" || scan.errors > 0 || targets.length !== 1 || !path) {
    throw new NotTheListError();
  }
  return path;
}

/**
 * The XML of the sheet with this name, the shared strings of the workbook when it has any, and
 * whether it counts dates from 1904. Only the four parts of the module comment are inflated, within
 * `limits`. A zip that cannot be read is a ZipError; a workbook without such a sheet, or with a
 * relationship that leads anywhere but to a sheet's part, is a NotTheListError.
 */
export function readSheetParts(buffer: Buffer, sheetName: string, limits: ZipLimits): SheetParts {
  // The sheet comes before the workbook in some zips (the AIID export's), so it cannot be accepted
  // in the same pass that finds it. The first pass reads the two small parts that name it.
  const named = readZip(buffer, (name) => name === WORKBOOK || name === WORKBOOK_RELATIONSHIPS, {
    maxEntries: limits.maxEntries,
    maxEntryBytes: Math.min(limits.maxEntryBytes, MAX_PACKAGE_PART_BYTES),
    maxTotalBytes: Math.min(limits.maxTotalBytes, 2 * MAX_PACKAGE_PART_BYTES),
  });
  const workbook = partText(named, WORKBOOK);
  const relationships = partText(named, WORKBOOK_RELATIONSHIPS);
  if (workbook === null || relationships === null) throw new NotTheListError();
  const { relationshipId, date1904 } = sheetNamed(workbook, sheetName);
  const path = sheetPathOf(relationships, relationshipId);

  const read = readZip(buffer, (name) => name === path || name === SHARED_STRINGS, limits);
  const sheetXml = partText(read, path);
  if (sheetXml === null) throw new NotTheListError();
  return { sheetXml, sharedStringsXml: partText(read, SHARED_STRINGS), date1904 };
}

/** The text of an inline string (`is`) or a shared one (`si`), plain or in runs; phonetic runs are left out. */
function itemText(item: XmlElement): string {
  let text = "";
  for (const child of item.children) {
    if (child.name === "t") {
      text += child.text;
    } else if (child.name === "r") {
      for (const part of child.children) if (part.name === "t") text += part.text;
    }
  }
  return text;
}

function sharedStringsOf(xml: string): { strings: string[]; errors: number } {
  const strings: string[] = [];
  const scan = scanElements(xml, "si", (item) => strings.push(itemText(item)));
  return { strings, errors: scan.errors + (scan.root === "sst" ? 0 : 1) };
}

/** The cell's position: its column and row, from 1; null for a reference that is not one. */
function placeOf(reference: string | undefined): { row: number; column: number } | null {
  const match = reference === undefined ? null : CELL_REFERENCE.exec(reference);
  if (match === null) return null;
  let column = 0;
  for (const letter of match[1]) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { row: Number(match[2]), column };
}

function valueOf(cell: XmlElement, strings: readonly string[]): CellValue {
  const raw = cell.children.find((child) => child.name === "v")?.text ?? "";
  switch (cell.attributes.t ?? "n") {
    case "inlineStr": {
      const inline = cell.children.find((child) => child.name === "is");
      return inline === undefined ? null : textOrNull(itemText(inline));
    }
    case "s": {
      const index = raw.trim();
      return SHARED_INDEX.test(index) ? textOrNull(strings[Number(index)] ?? "") : null;
    }
    case "str":
    case "d":
      return textOrNull(raw);
    case "n": {
      const text = raw.trim();
      return text.length <= MAX_NUMBER_CHARS && NUMBER.test(text) && Number.isFinite(Number(text))
        ? Number(text)
        : null;
    }
    case "b": {
      const text = raw.trim().toLowerCase();
      if (text === "1" || text === "true") return 1;
      return text === "0" || text === "false" ? 0 : null;
    }
    default:
      // `e` is an error value (#N/A), and no value either.
      return null;
  }
}

/**
 * The cells of a sheet's XML (see the module comment), with the shared strings of its workbook for
 * the cells that point into them. A cell in a row or a column past the limits is a ZipError
 * `too_large`.
 */
export function sheetRowsOf(
  sheetXml: string,
  sharedStringsXml: string | null,
  limits: SheetLimits,
): SheetRows {
  let errors = 0;
  let strings: string[] = [];
  if (sharedStringsXml !== null) {
    const shared = sharedStringsOf(sharedStringsXml);
    strings = shared.strings;
    errors += shared.errors;
  }
  const rows: CellValue[][] = [];
  const scan = scanElements(sheetXml, "c", (cell) => {
    const place = placeOf(cell.attributes.r);
    if (place === null) {
      errors += 1;
      return;
    }
    if (place.row > limits.maxRows || place.column > limits.maxColumns) {
      throw new ZipError("too_large");
    }
    while (rows.length < place.row) rows.push([]);
    const row = rows[place.row - 1];
    while (row.length < place.column - 1) row.push(null);
    row[place.column - 1] = valueOf(cell, strings);
  });
  return {
    rows,
    errors: errors + scan.errors + (scan.root === "worksheet" ? 0 : 1),
    root: scan.root,
  };
}

/** The cells of the sheet with this name in a workbook in memory (see `readSheetParts` and `sheetRowsOf`). */
export function readXlsxSheet(buffer: Buffer, sheetName: string, limits: XlsxLimits): SheetRows {
  const parts = readSheetParts(buffer, sheetName, limits.zip);
  return sheetRowsOf(parts.sheetXml, parts.sharedStringsXml, limits);
}

/** The first serial that is a day without doubt: 1900-03-01. */
const FIRST_SERIAL = 61;
/** 9999-12-31, the last day a spreadsheet counts. */
const LAST_SERIAL = 2_958_465;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Day 0 of the serials from 61 on, which absorb the leap day that the 1900 system invents. */
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * The day (YYYY-MM-DD) a serial of the 1900 date system counts (25569 is 1970-01-01), without the
 * time of day. That system takes 1900 for a leap year, so its serials 1 to 59 and 61 on are a day
 * apart and its 60 is a day that never was: a serial before 61 is no day here, and neither is one
 * that is not a finite number or lies past 9999-12-31.
 */
export function dayOfExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const days = Math.floor(serial);
  if (days < FIRST_SERIAL || days > LAST_SERIAL) return null;
  return new Date(SERIAL_EPOCH_MS + days * DAY_MS).toISOString().slice(0, 10);
}
