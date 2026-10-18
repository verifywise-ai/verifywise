/**
 * The shared file reader and deleter in fileUpload.utils hide bias audit
 * stance PDFs themselves: a stance id answers exactly as a missing id, and
 * the stance row is never deleted.
 */

import {
  everyFilesReferenceFiltered,
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "./files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
const calls: Array<{ sql: string; options: any }> = [];
jest.mock("../database/db", () => ({
  sequelize: {
    query: (sql: string, options: any) => {
      calls.push({ sql, options });
      return fakeFilesQuery(table)(sql, options);
    },
  },
}));

import { canUserAccessFile, deleteFileById, getFileById } from "./fileUpload.utils";

const tx = {} as any;
const ORG = 1;

beforeEach(() => {
  table = [];
  calls.length = 0;
});

describe("deleteFileById", () => {
  it("is a silent no-op for a stance PDF, exactly as for a missing id", async () => {
    table = [stanceRow()];
    const stance = await deleteFileById(2, ORG, tx);
    expect(table).toEqual([stanceRow()]);
    table = [];
    const missing = await deleteFileById(2, ORG, tx);
    expect(stance).toBe(false);
    expect(stance).toEqual(missing);
  });

  it("scopes the mapping, link and file deletes to a visible file, in the transaction", async () => {
    table = [stanceRow()];
    await deleteFileById(2, ORG, tx);
    expect(calls.map((c) => c.sql.match(/DELETE FROM (\w+)/)?.[1])).toEqual([
      "file_folder_mappings",
      "file_entity_links",
      "files",
    ]);
    for (const { sql, options } of calls) {
      expect(sql).toMatch(/\bFROM\s+files\b/);
      expect(everyFilesReferenceFiltered(sql)).toBe(true);
      expect(options.transaction).toBe(tx);
    }
  });

  it("deletes any other file", async () => {
    table = [visibleRow()];
    expect(await deleteFileById(1, ORG, tx)).toBe(true);
    expect(table).toEqual([]);
  });
});

describe("getFileById", () => {
  it("answers a stance PDF exactly as a missing file", async () => {
    table = [stanceRow()];
    const stance = await getFileById(2, ORG);
    table = [];
    expect(stance).toEqual(await getFileById(2, ORG));
  });

  it("still returns a visible file", async () => {
    table = [visibleRow()];
    expect(await getFileById(1, ORG)).toMatchObject({ id: 1 });
  });
});

describe("canUserAccessFile", () => {
  it("denies a stance PDF exactly as a missing file, even to its uploader", async () => {
    table = [stanceRow({ uploaded_by: 3 })];
    const stance = await canUserAccessFile(2, 3, "Editor", ORG, ORG);
    table = [];
    const missing = await canUserAccessFile(2, 3, "Editor", ORG, ORG);
    expect(stance).toBe(false);
    expect(stance).toEqual(missing);
  });

  it("still grants a visible file", async () => {
    table = [visibleRow({ uploaded_by: 3 })];
    expect(await canUserAccessFile(1, 3, "Editor", ORG, ORG)).toBe(true);
  });
});
