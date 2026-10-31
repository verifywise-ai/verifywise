import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/changeHistory.base.utils", () => ({
  getEntityChangeHistory: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: () => (data: unknown) => data }),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import {
  getAnnexCategoryChangeHistoryById,
  getControlEUChangeHistoryById,
  getSubcontrolEUChangeHistoryById,
} from "../frameworkControlChangeHistory.ctrl";
import { getEntityChangeHistory } from "../../utils/changeHistory.base.utils";

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("framework control change history read paths (issue #4977)", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    [getControlEUChangeHistoryById, "control_eu"],
    [getSubcontrolEUChangeHistoryById, "subcontrol_eu"],
    [getAnnexCategoryChangeHistoryById, "annex_category"],
  ])("serves %#: %s history, tenant-scoped, with clamped paging", async (handler, entity) => {
    const payload = { data: [], hasMore: false, total: 0 };
    (getEntityChangeHistory as jest.Mock).mockResolvedValue(payload as never);
    const req: any = {
      params: { id: "7" },
      query: { limit: "abc", offset: "-3" },
      organizationId: 1,
      t: (s: string) => s,
    };
    const res = createRes();

    await handler(req, res);

    expect(getEntityChangeHistory).toHaveBeenCalledWith(entity, 7, 1, 100, 0);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  it("rejects an invalid id with 400 without querying", async () => {
    const req: any = { params: { id: "0" }, query: {}, organizationId: 1, t: (s: string) => s };
    const res = createRes();

    await getControlEUChangeHistoryById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getEntityChangeHistory).not.toHaveBeenCalled();
  });

  it("answers 500 when the read fails", async () => {
    (getEntityChangeHistory as jest.Mock).mockRejectedValue(new Error("boom") as never);
    const req: any = { params: { id: "7" }, query: {}, organizationId: 1, t: (s: string) => s };
    const res = createRes();

    await getAnnexCategoryChangeHistoryById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
