/**
 * The shared folder writers hide bias audit stance PDFs themselves: a stance
 * id is never filed or unfiled, and answers exactly as a missing id.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  everyFilesReferenceFiltered,
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
const statements: string[] = [];
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (sql: string, options: any) => {
      statements.push(sql);
      return fakeFilesQuery(table)(sql, options);
    },
  },
}));

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
      expect(sql).toMatch(/\bFROM\s+files\b/);
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
});
