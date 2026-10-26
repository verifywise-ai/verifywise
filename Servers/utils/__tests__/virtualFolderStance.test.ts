/**
 * The shared folder writers hide bias audit stance PDFs themselves: a stance
 * id is never filed or unfiled, and answers exactly as a missing id.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  everyFilesReferenceFiltered,
  fakeFilesQuery,
  STANCE_SOURCE,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
const statements: string[] = [];
let model: MappingModel | null = null;
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (sql: string, options: any) => {
      statements.push(sql);
      return model ? model.query(sql, options) : fakeFilesQuery(table)(sql, options);
    },
  },
}));

/**
 * Which files rows a statement treats as visible, read from the predicate as
 * written: its alias must name the files table in that statement (Postgres
 * would reject anything else), `IS NOT DISTINCT FROM` is the inverse, and no
 * predicate means every row.
 */
function visibilityOf(sql: string): (row: FakeFileRow) => boolean {
  const m = sql.match(/(\w+)\.source IS (NOT )?DISTINCT FROM :stanceSource/);
  if (!m) return () => true;
  const [, alias, not] = m;
  const declared =
    new RegExp(`(?:FROM|JOIN)\\s+files\\s+${alias}\\b`).test(sql) ||
    (alias === "files" && /(?:FROM|JOIN)\s+files\s+(?:WHERE|ON)\b/.test(sql));
  if (!declared) throw new Error(`missing FROM-clause entry for table "${alias}"`);
  return not ? (row) => row.source === STANCE_SOURCE : (row) => row.source !== STANCE_SOURCE;
}

/** Files, folders and folder mappings, for the folder count and bulk update statements. */
class MappingModel {
  constructor(
    public files: FakeFileRow[],
    public folders: Array<{ id: number; organization_id: number }>,
    public mappings: Array<{ organization_id: number; file_id: number; folder_id: number }>,
  ) {}

  query(sql: string, options: any): unknown {
    const r = options.replacements;
    const visible = visibilityOf(sql);
    const isVisibleFile = (id: number) =>
      this.files.some((f) => f.id === id && f.organization_id === r.organizationId && visible(f));
    if (/COUNT\(ffm\.id\)/.test(sql)) {
      return this.folders
        .filter(
          (vf) => vf.organization_id === r.organizationId && (r.id === undefined || vf.id === r.id),
        )
        .map((vf) => ({
          ...vf,
          file_count: this.mappings.filter(
            (m) =>
              m.folder_id === vf.id &&
              m.organization_id === r.organizationId &&
              isVisibleFile(m.file_id),
          ).length,
        }));
    }
    if (/^\s*DELETE FROM file_folder_mappings/.test(sql)) {
      this.mappings = this.mappings.filter(
        (m) =>
          !(
            m.organization_id === r.organizationId &&
            m.file_id === r.fileId &&
            isVisibleFile(m.file_id)
          ),
      );
      return [];
    }
    if (/^\s*INSERT INTO file_folder_mappings/.test(sql) && /virtual_folders vf/.test(sql)) {
      if (!isVisibleFile(r.fileId)) return [];
      for (const vf of this.folders) {
        if (vf.organization_id === r.organizationId && r.folderIds.includes(vf.id)) {
          this.mappings.push({
            organization_id: r.organizationId,
            file_id: r.fileId,
            folder_id: vf.id,
          });
        }
      }
      return [];
    }
    throw new Error(`unmodelled statement: ${sql}`);
  }
}

import {
  assignFilesToFolderQuery,
  bulkUpdateFileFoldersQuery,
  getAllFoldersQuery,
  getFolderByIdQuery,
  getFolderTreeQuery,
  removeFileFromFolderQuery,
} from "../virtualFolder.utils";

const ORG = 1;

async function stanceAndMissing(run: () => Promise<unknown>) {
  table = [stanceRow()];
  const stance = await run();
  table = [];
  const missing = await run();
  return { stance, missing };
}

describe("folder writers and bias audit stance PDFs", () => {
  beforeEach(() => {
    table = [];
    model = null;
    statements.length = 0;
  });

  it("assignFilesToFolderQuery still files a visible file (sanity)", async () => {
    table = [visibleRow()];
    expect(await assignFilesToFolderQuery(ORG, 3, [1], 9)).toBe(1);
  });

  it("assignFilesToFolderQuery files nothing for a stance PDF, as for a missing id", async () => {
    const { stance, missing } = await stanceAndMissing(() =>
      assignFilesToFolderQuery(ORG, 3, [2], 9),
    );
    expect(stance).toBe(0);
    expect(stance).toEqual(missing);
  });

  it("removeFileFromFolderQuery answers a stance PDF as a missing file", async () => {
    const { stance, missing } = await stanceAndMissing(() => removeFileFromFolderQuery(ORG, 3, 2));
    expect(stance).toBe(false);
    expect(stance).toEqual(missing);
  });

  it("both writers scope the mapping to a visible file", async () => {
    await assignFilesToFolderQuery(ORG, 3, [2], 9);
    await removeFileFromFolderQuery(ORG, 3, 2);
    for (const sql of statements) {
      expect(sql).toMatch(/\bFROM\s+files\b/);
      expect(everyFilesReferenceFiltered(sql)).toBe(true);
    }
  });

  /** Every statement that reads or writes folder mappings is scoped to visible files. */
  const expectMappingsScoped = () => {
    const mappingStatements = statements.filter((sql) => /file_folder_mappings/.test(sql));
    expect(mappingStatements.length).toBeGreaterThan(0);
    for (const sql of mappingStatements) {
      expect(sql).toMatch(/\b(?:FROM|JOIN)\s+files\b/);
      expect(everyFilesReferenceFiltered(sql)).toBe(true);
    }
  };

  it.each([
    ["getAllFoldersQuery", () => getAllFoldersQuery(ORG)],
    ["getFolderByIdQuery", () => getFolderByIdQuery(ORG, 3)],
    ["getFolderTreeQuery", () => getFolderTreeQuery(ORG)],
  ])("%s counts only mappings of visible files", async (_name, run) => {
    await (run as () => Promise<unknown>)();
    expectMappingsScoped();
  });

  it("bulkUpdateFileFoldersQuery deletes and inserts mappings only for a visible file", async () => {
    table = [stanceRow()];
    await bulkUpdateFileFoldersQuery(ORG, 2, [3, 4], 9);
    expect(statements.filter((sql) => /file_folder_mappings/.test(sql))).toHaveLength(2);
    expectMappingsScoped();
  });

  describe("behaviour over files, folders and mappings", () => {
    const files = () => [
      visibleRow({ id: 1 }),
      visibleRow({ id: 3 }),
      stanceRow({ id: 2 }),
      visibleRow({ id: 9, organization_id: 2 }),
    ];
    const folders = [
      { id: 10, organization_id: ORG },
      { id: 11, organization_id: ORG },
      { id: 99, organization_id: 2 },
    ];

    it("counts a folder's visible files, not its stance PDF", async () => {
      model = new MappingModel(files(), folders, [
        { organization_id: ORG, file_id: 1, folder_id: 10 },
        { organization_id: ORG, file_id: 3, folder_id: 10 },
        { organization_id: ORG, file_id: 2, folder_id: 10 },
      ]);
      expect((await getFolderByIdQuery(ORG, 10))?.file_count).toBe(2);
      const all = await getAllFoldersQuery(ORG);
      expect(all.map((f) => [f.id, f.file_count])).toEqual([
        [10, 2],
        [11, 0],
      ]);
    });

    it("bulk update replaces a visible file's folders with the organization's own", async () => {
      model = new MappingModel(files(), folders, [
        { organization_id: ORG, file_id: 1, folder_id: 10 },
        { organization_id: ORG, file_id: 2, folder_id: 10 },
      ]);
      await bulkUpdateFileFoldersQuery(ORG, 1, [11, 99], 9);
      expect(model.mappings).toEqual([
        { organization_id: ORG, file_id: 2, folder_id: 10 },
        { organization_id: ORG, file_id: 1, folder_id: 11 },
      ]);
    });

    it("bulk update leaves a stance PDF's mappings alone and adds none", async () => {
      const before = [{ organization_id: ORG, file_id: 2, folder_id: 10 }];
      model = new MappingModel(files(), folders, [...before]);
      await bulkUpdateFileFoldersQuery(ORG, 2, [11], 9);
      expect(model.mappings).toEqual(before);
    });
  });
});
