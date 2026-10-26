/**
 * Model lifecycle item files keep bias audit stance PDFs out.
 *
 * A stance PDF is served only by the bias audit stance endpoint. attachFile
 * must refuse it exactly as it refuses a missing file, and the lifecycle read
 * must not list one linked before this rule existed.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../../../utils/files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
const mockQuery = jest.fn<any>();
jest.mock("../../../database/db", () => ({
  sequelize: { query: (sql: string, options: any) => mockQuery(sql, options) },
}));

jest.mock("../../../utils/auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn<any>().mockResolvedValue(undefined),
}));

import { attachFile, getLifecycleForModel } from "../modelLifecycle.service";

const ORG = 1;

describe("model lifecycle files and bias audit stance PDFs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    table = [];
    mockQuery.mockImplementation((sql: string, options: any) =>
      fakeFilesQuery(table)(sql, options),
    );
  });

  it("attachFile refuses a stance PDF exactly as a missing file and writes nothing", async () => {
    // The controller answers null with the same 404 "File not found".
    table = [stanceRow()];
    const stance = await attachFile(ORG, 7, 3, 9, 2);
    table = [];
    const missing = await attachFile(ORG, 7, 3, 9, 2);

    expect(stance).toBeNull();
    expect(missing).toBeNull();
    const writes = mockQuery.mock.calls.filter(([sql]) => /^\s*INSERT/i.test(String(sql)));
    expect(writes).toHaveLength(0);
  });

  it("getLifecycleForModel lists a visible linked file but not a stance PDF", async () => {
    // Joined item-file rows, as the files query sees them.
    table = [visibleRow({ value_id: 10, file_id: 1 }), stanceRow({ value_id: 10, file_id: 2 })];
    mockQuery.mockImplementation((sql: string, options: any) => {
      if (sql.includes("FROM model_lifecycle_phases")) return Promise.resolve([{ id: 1 }]);
      if (sql.includes("FROM model_lifecycle_items")) return Promise.resolve([{ id: 3 }]);
      if (sql.includes("FROM model_lifecycle_values"))
        return Promise.resolve([{ id: 10, item_id: 3 }]);
      if (sql.includes("FROM model_lifecycle_item_files"))
        return fakeFilesQuery(table)(sql, options);
      return Promise.resolve([]);
    });

    const phases = await getLifecycleForModel(ORG, 7);

    const files = phases[0].items[0].value.files;
    expect(files.map((f: any) => f.file_id)).toEqual([1]);
  });
});
