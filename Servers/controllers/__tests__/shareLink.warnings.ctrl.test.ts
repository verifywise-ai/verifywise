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

import { createShareLink, getShareLinksForResource, updateShareLink } from "../shareLink.ctrl";
import { sequelize } from "../../database/db";

const LIST =
  "This link lists your organization's 100 most recently created policies, whatever their status: drafts, policies under review, deprecated and archived policies included.";
const ALL_FIELDS =
  "Share all fields is on: anyone with this link can read every column of the policies it shows, the full policy text included.";
const EXPORT = "Data export is on: anyone with this link can download what it shows.";

const queryMock = sequelize.query as unknown as jest.Mock;
const transactionMock = sequelize.transaction as unknown as jest.Mock;

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const t = (s: string) => `t:${s}`;

const link = (resourceId: number, shareAllFields: boolean) => ({
  id: 4,
  organization_id: 9,
  share_token: "tok",
  resource_type: "policy",
  resource_id: resourceId,
  created_by: 1,
  settings: { shareAllFields, allowDataExport: false },
  is_enabled: true,
  expires_at: null,
});

describe("share link responses carry translated policy exposure warnings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transactionMock.mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() } as never);
  });

  it("on create", async () => {
    queryMock.mockResolvedValueOnce([[link(0, true)], 1] as never);
    const res = createRes();
    await createShareLink(
      {
        body: { resource_type: "policy", resource_id: 0, settings: { shareAllFields: true } },
        organizationId: 9,
        userId: 1,
        t,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect((res.json.mock.calls[0][0] as any).warnings).toEqual([t(LIST), t(ALL_FIELDS)]);
  });

  it("on update", async () => {
    queryMock
      .mockResolvedValueOnce([link(7, false)] as never)
      .mockResolvedValueOnce([[link(7, true)], 1] as never);
    const res = createRes();
    await updateShareLink(
      {
        params: { id: "4" },
        body: { settings: { shareAllFields: true } },
        organizationId: 9,
        userId: 1,
        t,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json.mock.calls[0][0] as any).warnings).toEqual([t(ALL_FIELDS)]);
  });

  it("on the list of a resource's links, and none for a model", async () => {
    queryMock.mockResolvedValueOnce([link(0, false)] as never);
    const res = createRes();
    await getShareLinksForResource(
      { params: { resourceType: "policy", resourceId: "0" }, organizationId: 9, t } as any,
      res,
    );
    expect((res.json.mock.calls[0][0] as any)[0].warnings).toEqual([t(LIST)]);

    queryMock.mockResolvedValueOnce([
      { ...link(0, false), settings: { shareAllFields: false } },
      { ...link(0, true), is_enabled: false },
    ] as never);
    const res3 = createRes();
    await getShareLinksForResource(
      { params: { resourceType: "policy", resourceId: "0" }, organizationId: 9, t } as any,
      res3,
    );
    const listed = res3.json.mock.calls[0][0] as any[];
    expect(listed[0].warnings).toEqual([t(LIST), t(EXPORT)]);
    expect(listed[1].warnings).toEqual([]);

    queryMock.mockResolvedValueOnce([{ ...link(0, true), resource_type: "model" }] as never);
    const res2 = createRes();
    await getShareLinksForResource(
      { params: { resourceType: "model", resourceId: "0" }, organizationId: 9, t } as any,
      res2,
    );
    expect((res2.json.mock.calls[0][0] as any)[0].warnings).toEqual([]);
  });
});
