/**
 * A stand-in for sequelize.query over a small files table, for unit tests
 * that check a bias audit stance PDF answers exactly as a missing file does.
 *
 * It applies the organization, the file id replacements and the visible-file
 * predicate (VISIBLE_FILE_SQL), and nothing else. A tool's answer over a
 * table holding only a stance PDF therefore equals its answer over an empty
 * table only when every query the tool sends applies the predicate.
 *
 * UPDATE marks the matched rows (`updated`) and DELETE removes them, so a
 * test can also check a write left the stance row alone.
 */

export const STANCE_SOURCE = "Bias audit stance report";

export interface FakeFileRow {
  id: number;
  organization_id: number;
  source: string | null;
  updated?: number;
  [column: string]: unknown;
}

export const stanceRow = (overrides: Partial<FakeFileRow> = {}): FakeFileRow => ({
  id: 2,
  organization_id: 1,
  filename: "stance-v1.pdf",
  type: "application/pdf",
  size: 2048,
  project_id: 5,
  model_id: null,
  content: Buffer.from("stance pdf bytes"),
  source: STANCE_SOURCE,
  ...overrides,
});

export const visibleRow = (overrides: Partial<FakeFileRow> = {}): FakeFileRow => ({
  id: 1,
  organization_id: 1,
  filename: "policy.pdf",
  type: "application/pdf",
  size: 1024,
  project_id: 5,
  model_id: null,
  content: Buffer.from("policy pdf bytes"),
  source: "File Manager",
  ...overrides,
});

export function fakeFilesQuery(table: FakeFileRow[]) {
  return async (sql: string, options: any = {}): Promise<any> => {
    const r = options.replacements ?? {};
    const organizationId = r.organizationId ?? r.organization_id;
    let rows = table.filter((row) => row.organization_id === organizationId);
    if (sql.includes("IS DISTINCT FROM :stanceSource")) {
      rows = rows.filter((row) => row.source !== r.stanceSource);
    }
    const id = r.id ?? r.fileId ?? r.file_id;
    if (id !== undefined) rows = rows.filter((row) => row.id === Number(id));
    if (Array.isArray(r.fileIds)) rows = rows.filter((row) => r.fileIds.includes(row.id));

    if (/^\s*UPDATE\b/i.test(sql)) {
      rows.forEach((row) => (row.updated = (row.updated ?? 0) + 1));
    } else if (/^\s*DELETE\s+FROM\s+files\b/i.test(sql)) {
      rows.forEach((row) => table.splice(table.indexOf(row), 1));
    }
    // allFilesVisibleQuery
    if (sql.includes("COUNT(*)::text AS count")) {
      return [{ count: String(rows.length) }];
    }
    if (options.type === "SELECT" || options.mapToModel) return rows;
    return [rows, rows.length];
  };
}
