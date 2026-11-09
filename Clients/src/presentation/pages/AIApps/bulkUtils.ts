import type {
  ParsedSpreadsheet,
  SpreadsheetValue,
} from "../../../application/utils/parseSpreadsheet";
import type {
  IAiAppAnswersRow,
  IAiAppImportRow,
  IAiAppQuestion,
  IAiAppRowError,
} from "../../../domain/interfaces/i.aiAppBulk";

/** The API's limit for one import, one bulk action or one worksheet upload. */
export const MAX_BULK_ROWS = 1000;

const text = (value: SpreadsheetValue | undefined): string =>
  value === null || value === undefined ? "" : String(value);

/** Case and spacing never distinguish two columns. */
const comparable = (header: string): string => header.trim().toLowerCase().replace(/\s+/g, " ");

/** Also drops markers people add to a template, such as "Name *" or "Status (optional)". */
const importColumn = (header: string): string =>
  comparable(
    header
      .replace(/\([^)]*\)/g, "")
      .replace(/\*/g, "")
      .replace(/[_-]/g, " "),
  );

type ImportField = Exclude<keyof IAiAppImportRow, "row_number">;

const IMPORT_COLUMNS: Record<string, ImportField> = {
  "name": "name",
  "ai app": "name",
  "ai app name": "name",
  "app name": "name",
  "description": "description",
  "vendor": "vendor",
  "vendor name": "vendor",
  "owner": "owner_email",
  "owner email": "owner_email",
  "status": "status",
  "department": "departments",
  "departments": "departments",
  "training": "required_training",
  "required training": "required_training",
};

export interface MappedImport {
  rows: IAiAppImportRow[];
  hasNameColumn: boolean;
}

/** Turns spreadsheet rows into import rows. The server validates every value. */
export function mapImportRows(parsed: ParsedSpreadsheet): MappedImport {
  const columnFor = new Map<ImportField, string>();
  for (const header of parsed.headers) {
    const field = IMPORT_COLUMNS[importColumn(header)];
    if (field && !columnFor.has(field)) columnFor.set(field, header);
  }
  const read = (values: Record<string, SpreadsheetValue>, field: ImportField) => {
    const column = columnFor.get(field);
    return column ? text(values[column]) : "";
  };

  return {
    hasNameColumn: columnFor.has("name"),
    rows: parsed.rows.map(({ row_number, values }) => ({
      row_number,
      name: read(values, "name"),
      description: read(values, "description"),
      vendor: read(values, "vendor"),
      owner_email: read(values, "owner_email"),
      status: read(values, "status"),
      departments: read(values, "departments"),
      required_training: read(values, "required_training"),
    })),
  };
}

export const ASSESSMENT_ID_COLUMN = "Assessment ID";

export interface MappedWorksheet {
  rows: IAiAppAnswersRow[];
  errors: IAiAppRowError[];
  /** Expected columns the file does not have. */
  missingColumns: string[];
}

/**
 * Accepts 3 or a label such as "3 - Moderate". Anything else is sent as written
 * so the server reports it against its row.
 */
function readScore(value: SpreadsheetValue): number | string {
  if (typeof value === "number") return value;
  const raw = String(value);
  const match = raw.match(/^(\d+(?:\.\d+)?)(?:\s*-.*)?$/);
  return match ? Number(match[1]) : raw;
}

/** Matches worksheet columns to question keys by label. */
export function mapWorksheetRows(
  parsed: ParsedSpreadsheet,
  questions: IAiAppQuestion[],
): MappedWorksheet {
  const headerFor = new Map(parsed.headers.map((header) => [comparable(header), header]));
  const idHeader = headerFor.get(comparable(ASSESSMENT_ID_COLUMN));
  const columns = questions.map((question) => ({
    key: question.key,
    label: question.label,
    header: headerFor.get(comparable(question.label)),
  }));

  const missingColumns = [
    ...(idHeader ? [] : [ASSESSMENT_ID_COLUMN]),
    ...columns.filter((column) => !column.header).map((column) => column.label),
  ];
  if (missingColumns.length > 0 || !idHeader) return { rows: [], errors: [], missingColumns };

  const rows: IAiAppAnswersRow[] = [];
  const errors: IAiAppRowError[] = [];
  for (const { row_number, values } of parsed.rows) {
    const id = Number(values[idHeader]);
    if (values[idHeader] === null || !Number.isInteger(id) || id <= 0) {
      errors.push({
        row: row_number,
        field: ASSESSMENT_ID_COLUMN,
        message: "Enter the assessment ID from the worksheet.",
      });
      continue;
    }
    const answers: IAiAppAnswersRow["answers"] = {};
    for (const { key, header } of columns) {
      const value = header ? values[header] : null;
      if (value !== null && value !== undefined) answers[key] = readScore(value);
    }
    rows.push({ row_number, assessment_id: id, answers });
  }
  return { rows, errors, missingColumns };
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
