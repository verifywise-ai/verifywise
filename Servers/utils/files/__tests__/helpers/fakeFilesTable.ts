/**
 * A stand-in for sequelize.query over a small files table, for unit tests
 * that check a bias audit stance PDF answers exactly as a missing file does.
 *
 * It applies the organization, `id = :x` and `project_id = :x` comparisons
 * (and `:fileIds` lists), and the visible-file predicate (VISIBLE_FILE_SQL),
 * and nothing else. The predicate counts only
 * when it appears at least once per reference to the files table, so a
 * UNION or subquery that leaves one branch unfiltered is treated as
 * unfiltered. A tool's answer over a table holding only a stance PDF
 * therefore equals its answer over an empty table only when every branch of
 * every query the tool sends applies the predicate.
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

const FILES_REFERENCE = /\b(?:FROM|JOIN|UPDATE|INTO)\s+files\b/gi;
const VISIBLE_PREDICATE = /\bIS DISTINCT FROM :stanceSource\b/g;

/**
 * Whether every reference to the files table in the statement carries the
 * visible-file predicate. A statement with no files reference counts as
 * filtered (it cannot return a files row).
 */
export function everyFilesReferenceFiltered(sql: string): boolean {
  const references = sql.match(FILES_REFERENCE)?.length ?? 0;
  const predicates = sql.match(VISIBLE_PREDICATE)?.length ?? 0;
  return predicates >= references;
}

/** Whether the statement has `[alias.]column = :key`. */
function comparesColumn(sql: string, column: string, key: string): boolean {
  return new RegExp(`(?<![\\w.])(?:\\w+\\.)?${column}\\s*=\\s*:${key}\\b`).test(sql);
}

export function fakeFilesQuery(table: FakeFileRow[]) {
  return async (sql: string, options: any = {}): Promise<any> => {
    const r = options.replacements ?? {};
    const organizationId = r.organizationId ?? r.organization_id;
    let rows = table.filter((row) => row.organization_id === organizationId);
    if (sql.match(VISIBLE_PREDICATE) && everyFilesReferenceFiltered(sql)) {
      rows = rows.filter((row) => row.source !== r.stanceSource);
    }
    // A replacement filters by file id only when the statement compares an
    // id column to it; `project_id = :x` filters by project.
    const idKey = ["id", "fileId", "file_id"].find(
      (key) => r[key] !== undefined && comparesColumn(sql, "id", key),
    );
    if (idKey) rows = rows.filter((row) => row.id === Number(r[idKey]));
    for (const key of Object.keys(r).filter((k) => comparesColumn(sql, "project_id", k))) {
      rows = rows.filter((row) => row.project_id === Number(r[key]));
    }
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
