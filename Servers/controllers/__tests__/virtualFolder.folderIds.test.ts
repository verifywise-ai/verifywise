/**
 * PATCH /files/:id/folders validates folder_ids before touching the
 * database: each must be a positive integer that fits the INTEGER column.
 * Strings and booleans are refused (as file_ids are), never coerced.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => tx), query: jest.fn() },
}));
const mockBulk = jest.fn<any>().mockResolvedValue(undefined);
jest.mock("../../utils/virtualFolder.utils", () => ({
  bulkUpdateFileFoldersQuery: (...args: unknown[]) => mockBulk(...args),
  getFileFoldersQuery: jest.fn<any>().mockResolvedValue([]),
}));
jest.mock("../../utils/files/visibleFiles", () => ({
  allFilesVisibleQuery: jest.fn<any>().mockResolvedValue(true),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: (_t, code) => (d: unknown) => ({ code, data: d }) }),
}));

import { updateFileFolders } from "../virtualFolder.ctrl";

function call(folderIds: unknown) {
  const req: any = {
    role: "Admin",
    organizationId: 1,
    userId: 3,
    t: (k: string) => k,
    params: { id: "2" },
    body: { folder_ids: folderIds },
  };
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return updateFileFolders(req, res).then(() => res);
}

describe("updateFileFolders folder_ids validation", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["a boolean", [true]],
    ["a numeric string", ["1"]],
    ["zero", [0]],
    ["a negative id", [-1]],
    ["a fraction", [1.5]],
    ["an id past INTEGER", [2147483648]],
    ["not an array", 1],
  ])("refuses %s with 400 and writes nothing", async (_name, folderIds) => {
    const res = await call(folderIds);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockBulk).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalled();
  });

  it.each([
    ["valid ids", [1, 2147483647]],
    ["an empty list (clears the file's folders)", []],
  ])("accepts %s", async (_name, folderIds) => {
    const res = await call(folderIds);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBulk).toHaveBeenCalledWith(1, 2, folderIds, 3, tx);
  });
});
