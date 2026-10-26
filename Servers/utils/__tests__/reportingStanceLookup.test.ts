/**
 * The report delete route (DELETE /reporting/:id) looks a file up with
 * getReportByIdQuery before deleting it. A bias audit stance PDF must answer
 * that lookup exactly as a missing file does, so the route returns the same
 * 404 instead of a stance-specific 409.
 */

import { describe, expect, it, jest } from "@jest/globals";
import {
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
jest.mock("../../database/db", () => ({
  sequelize: { query: (sql: string, options: any) => fakeFilesQuery(table)(sql, options) },
}));

import { getReportByIdQuery } from "../reporting.utils";

describe("getReportByIdQuery and bias audit stance PDFs", () => {
  it("still finds a visible file (sanity)", async () => {
    table = [visibleRow()];
    expect(await getReportByIdQuery(1, 1)).toEqual(table[0]);
  });

  it("answers a stance PDF exactly as a missing file", async () => {
    table = [stanceRow()];
    const stance = await getReportByIdQuery(2, 1);
    table = [];
    const missing = await getReportByIdQuery(2, 1);
    expect(stance).toEqual(missing);
    expect(stance).toBeUndefined();
  });
});
