/**
 * The file-manager `:id` routes answer a bias audit stance PDF exactly as a
 * missing file: same status, same body, same logging, no write. There is no
 * route guard for this; the handlers rely on the repository readers, which
 * hide stance rows. So these tests run the real repository over a fake files
 * table and compare each handler's answer over a table holding only a stance
 * PDF with its answer over an empty table.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../../utils/files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: (sql: string, options: any) => fakeFilesQuery(table)(sql, options),
  },
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/approvalRequest.utils", () => ({
  createApprovalRequestQuery: jest.fn(),
  rejectApprovalRequestOnEntityDelete: jest.fn(),
}));
jest.mock("../../services/notification.service", () => ({
  notifyStepApprovers: jest.fn(),
  notifyRequesterRejected: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({
  getUserProjects: jest.fn<any>().mockResolvedValue([]),
}));
jest.mock("../../utils/project.utils", () => ({ getProjectByIdQuery: jest.fn() }));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  trackEntityChanges: jest.fn<any>().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/fileIngestion/textExtractor", () => ({
  extractText: jest.fn<any>().mockResolvedValue(""),
  normalizeText: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: (_t, code) => (d: unknown) => ({ code, data: d }) }),
}));

import { logFailure, logProcessing, logSuccess } from "../../utils/logger/logHelper";
import {
  downloadFile,
  getFileMetadata,
  getFileVersionHistory,
  previewFile,
  removeFile,
  updateMetadata,
} from "../fileManager.ctrl";

const STANCE_ID = "2";

function createReq(overrides: Record<string, any> = {}): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: { id: STANCE_ID },
    query: {},
    headers: {},
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  for (const m of ["status", "json", "send", "setHeader", "end", "type"]) {
    res[m] = jest.fn<any>().mockReturnValue(res);
  }
  return res;
}

const logs = () => [logFailure, logSuccess, logProcessing].map((m) => (m as jest.Mock).mock.calls);

/** Everything the handler did, over the given table. */
async function observe(
  rows: FakeFileRow[],
  handler: (req: any, res: any) => Promise<unknown>,
  req: any,
) {
  jest.clearAllMocks();
  table = rows;
  const res = createRes();
  await handler(req, res);
  const calls: Record<string, unknown> = {};
  for (const m of ["status", "json", "send", "setHeader", "end"]) calls[m] = res[m].mock.calls;
  return { calls, logs: JSON.parse(JSON.stringify(logs())) };
}

describe("file-manager :id routes and bias audit stance PDFs", () => {
  beforeEach(() => {
    table = [];
  });

  it("GET /:id still downloads a visible file (sanity)", async () => {
    const { calls } = await observe(
      [visibleRow({ id: 2, uploaded_by: 1 })],
      downloadFile,
      createReq(),
    );
    expect(calls.status).toEqual([]);
    expect(calls.end).toEqual([[Buffer.from("policy pdf bytes")]]);
  });

  it.each([
    ["GET /:id (download)", downloadFile, {}],
    ["GET /:id/metadata", getFileMetadata, {}],
    ["GET /:id/versions", getFileVersionHistory, {}],
    ["GET /:id/versions with bad pagination", getFileVersionHistory, { query: { page: "0" } }],
    ["PATCH /:id/metadata", updateMetadata, { body: { description: "x" } }],
    ["GET /:id/preview", previewFile, {}],
    ["DELETE /:id", removeFile, {}],
  ])("%s answers a stance PDF exactly as a missing file", async (_name, handler, overrides) => {
    const stance = await observe([stanceRow()], handler as any, createReq(overrides));
    const missing = await observe([], handler as any, createReq(overrides));
    expect(stance).toEqual(missing);
  });

  it.each([
    ["PATCH /:id/metadata", updateMetadata, { body: { description: "x" } }],
    ["DELETE /:id", removeFile, {}],
  ])("%s leaves the stance row untouched", async (_name, handler, overrides) => {
    table = [stanceRow()];
    const row = table[0];
    await (handler as any)(createReq(overrides), createRes());
    expect(table).toEqual([stanceRow()]);
    expect(row.updated).toBeUndefined();
  });
});
