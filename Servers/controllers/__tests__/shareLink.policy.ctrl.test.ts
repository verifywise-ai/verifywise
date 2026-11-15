import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: () => (data: unknown) => data }),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn() }));

import { getSharedDataByToken } from "../shareLink.ctrl";
import { sequelize } from "../../database/db";

const queryMock = sequelize.query as unknown as jest.Mock;

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function shareLink(resourceId: number) {
  return {
    id: 1,
    organization_id: 9,
    resource_type: "policy",
    resource_id: resourceId,
    is_enabled: true,
    expires_at: null,
    settings: { shareAllFields: true },
  };
}

async function runView(resourceId: number) {
  queryMock.mockReset();
  queryMock
    .mockResolvedValueOnce([shareLink(resourceId)] as never)
    .mockResolvedValueOnce([{ id: 3, title: "Policy" }] as never);
  const req: any = { params: { token: "tok" }, organizationId: 9, userId: 1, t: (s: string) => s };
  await getSharedDataByToken(req, createRes());
  return queryMock.mock.calls[1] as [string, { bind: unknown[] }];
}

describe("getSharedDataByToken policy share links", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads policy_manager for the table view, scoped to the link's organization", async () => {
    const [sql, opts] = await runView(0);
    expect(sql).toMatch(/FROM policy_manager\b/);
    expect(sql).not.toMatch(/FROM policies\b/);
    expect(sql).toMatch(/organization_id = \$1/);
    expect(opts.bind).toEqual([9]);
  });

  it("reads policy_manager for a single record, scoped to the link's organization", async () => {
    const [sql, opts] = await runView(3);
    expect(sql).toMatch(/FROM policy_manager\b/);
    expect(sql).not.toMatch(/FROM policies\b/);
    expect(sql).toMatch(/id = \$1 AND organization_id = \$2/);
    expect(opts.bind).toEqual([3, 9]);
  });
});
