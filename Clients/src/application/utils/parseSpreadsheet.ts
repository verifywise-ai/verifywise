/** Reads the first worksheet of an Excel file into plain values, in the browser. */

export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

export type SpreadsheetValue = string | number | boolean | null;

export interface ParsedSpreadsheetRow {
  /** The row's line in the spreadsheet, so blank lines do not shift error messages. */
  row_number: number;
  values: Record<string, SpreadsheetValue>;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: ParsedSpreadsheetRow[];
}

/** A problem with the file itself. The message is written for the user. */
export class SpreadsheetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetParseError";
  }
}

/** Whole dates lose their time part; anything else stays a full timestamp. */
function dateToString(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const iso = date.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

/**
 * Turns an exceljs cell value into a plain value: rich text and hyperlinks
 * become their text, formulas their result, dates a string. A formula that
 * ended in an error (#REF!, #N/A) counts as blank, so it can't be imported as
 * text. Blank strings are null.
 */
export function flattenCellValue(value: unknown): SpreadsheetValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateToString(value) || null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value !== "object") return null;

  const cell = value as Record<string, unknown>;
  if (Array.isArray(cell.richText)) {
    const parts = cell.richText as Array<{ text?: unknown }>;
    return flattenCellValue(parts.map((part) => String(part?.text ?? "")).join(""));
  }
  if ("formula" in cell || "sharedFormula" in cell || "result" in cell) {
    return flattenCellValue(cell.result);
  }
  if ("hyperlink" in cell) {
    const text = flattenCellValue(cell.text);
    if (text !== null) return text;
    return flattenCellValue(String(cell.hyperlink ?? "").replace(/^mailto:/i, ""));
  }
  if ("text" in cell) return flattenCellValue(cell.text);
  return null;
}

/** The part of an exceljs worksheet this module reads. */
export interface WorksheetLike {
  eachRow(
    options: { includeEmpty: boolean },
    callback: (
      row: { cellCount: number; getCell(column: number): { value: unknown } },
      rowNumber: number,
    ) => void,
  ): void;
}

/**
 * The first row with any content is the header row. Columns with a blank header
 * are ignored, and a repeated header keeps its first column.
 */
export function readWorksheet(worksheet: WorksheetLike): ParsedSpreadsheet {
  let columns: Array<{ column: number; header: string }> | null = null;
  const rows: ParsedSpreadsheetRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (columns === null) {
      const found: Array<{ column: number; header: string }> = [];
      const seen = new Set<string>();
      for (let column = 1; column <= row.cellCount; column += 1) {
        const header = flattenCellValue(row.getCell(column).value);
        if (header === null || seen.has(String(header))) continue;
        seen.add(String(header));
        found.push({ column, header: String(header) });
      }
      if (found.length > 0) columns = found;
      return;
    }

    const values: Record<string, SpreadsheetValue> = {};
    let hasContent = false;
    for (const { column, header } of columns) {
      const value = flattenCellValue(row.getCell(column).value);
      values[header] = value;
      if (value !== null) hasContent = true;
    }
    if (hasContent) rows.push({ row_number: rowNumber, values });
  });

  const headers = (columns ?? ([] as Array<{ header: string }>)).map(({ header }) => header);
  return { headers, rows };
}

export async function parseSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new SpreadsheetParseError("Choose an Excel file (.xlsx).");
  }
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new SpreadsheetParseError("The file is larger than 10 MB.");
  }

  // Loaded on demand: exceljs is ~280 KiB gz, only needed to parse an upload.
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new SpreadsheetParseError(
      "The file could not be read. Check that it is a valid Excel file.",
    );
  }

  // By position: getWorksheet(1) looks up an internal id, which is not always the first tab.
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new SpreadsheetParseError("The file has no worksheets.");
  }
  return readWorksheet(worksheet as unknown as WorksheetLike);
}
