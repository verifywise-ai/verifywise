/**
 * The evidence file list excludes bias audit stance PDFs through the
 * visible-file predicate itself, for every role. (The fake files table does
 * not model the `NOT ILIKE '%report%'` filter, so only the predicate can
 * hide the stance row here.)
 */
import { fakeFilesQuery, stanceRow, visibleRow, type FakeFileRow } from "./helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
jest.mock("../../../database/db", () => ({
  sequelize: { query: (sql: string, options: any) => fakeFilesQuery(table)(sql, options) },
}));
jest.mock("../attachLinkProjections", () => ({ attachLinkProjections: jest.fn() }));

import getUserFilesMetaDataQuery from "../getUserFilesMetaData.utils";

describe.each(["Admin", "Editor"])("getUserFilesMetaDataQuery as %s", (role) => {
  it("still lists a visible file (sanity)", async () => {
    table = [visibleRow()];
    expect(await getUserFilesMetaDataQuery(role, 3, 1)).toHaveLength(1);
  });

  it("answers a stance PDF exactly as a missing file", async () => {
    table = [stanceRow()];
    const stance = await getUserFilesMetaDataQuery(role, 3, 1);
    table = [];
    expect(stance).toEqual(await getUserFilesMetaDataQuery(role, 3, 1));
  });
});
