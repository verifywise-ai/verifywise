/**
 * The repository's by-id file readers and writers hide bias audit stance PDFs
 * themselves, so no caller needs a check of its own. Each one must answer a
 * stance PDF exactly as a missing file: the same answer over a table holding
 * only a stance PDF as over an empty one, and the stance row untouched.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  everyFilesReferenceFiltered,
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../../utils/files/__tests__/helpers/fakeFilesTable";

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
  deleteFileById,
  getFileById,
  getFilePreview,
  getFileVersionHistory,
  getFileWithMetadata,
  updateFileMetadata,
  updateFileReviewStatus,
} from "../file.repository";

const ORG = 1;
const STANCE_ID = 2;
const GROUP = "11111111-1111-4111-8111-111111111111";
const tx = {} as any;

/** The answer over a table holding only a stance PDF, and over an empty one. */
async function stanceAndMissing(run: () => Promise<unknown>) {
  table = [stanceRow({ file_group_id: GROUP })];
  const row = table[0];
  const stance = await run();
  const stanceRowAfter = table.includes(row) ? { ...row } : null;
  table = [];
  const missing = await run();
  return { stance, missing, stanceRowAfter };
}

describe("file.repository by-id functions and bias audit stance PDFs", () => {
  beforeEach(() => {
    table = [];
    statements.length = 0;
  });

  it("getFileById still returns a visible file (sanity)", async () => {
    table = [visibleRow()];
    expect(await getFileById(1, ORG)).toMatchObject({ id: 1 });
  });

  it.each([
    ["getFileById", () => getFileById(STANCE_ID, ORG)],
    ["getFileWithMetadata", () => getFileWithMetadata(STANCE_ID, ORG)],
    ["getFilePreview", () => getFilePreview(STANCE_ID, ORG)],
    ["getFileVersionHistory", () => getFileVersionHistory(GROUP, ORG)],
    [
      "updateFileMetadata",
      () => updateFileMetadata(STANCE_ID, { description: "x", last_modified_by: 3 } as any, ORG),
    ],
    ["updateFileReviewStatus", () => updateFileReviewStatus(STANCE_ID, "approved", ORG)],
    ["deleteFileById", () => deleteFileById(STANCE_ID, ORG, tx)],
  ])("%s answers a stance PDF as a missing file and leaves it alone", async (_name, run) => {
    const { stance, missing, stanceRowAfter } = await stanceAndMissing(
      run as () => Promise<unknown>,
    );
    expect(stance).toEqual(missing);
    expect(stanceRowAfter).toEqual(stanceRow({ file_group_id: GROUP }));
  });

  it.each([["deleteFileById", () => deleteFileById(STANCE_ID, ORG, tx)]])(
    "%s runs one filtered DELETE FROM files; mappings and links cascade",
    async (_n, run) => {
      table = [stanceRow()];
      await (run as () => Promise<unknown>)();
      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(/^\s*DELETE FROM files\b/);
      expect(everyFilesReferenceFiltered(statements[0])).toBe(true);
    },
  );

  it("deleteFileById still deletes a visible file", async () => {
    table = [visibleRow()];
    expect(await deleteFileById(1, ORG, tx)).toBe(true);
    expect(table).toHaveLength(0);
  });
});
