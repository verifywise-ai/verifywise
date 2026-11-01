import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/changeHistory.base.utils", () => ({
  getEntityChangeHistory: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: () => (data: unknown) => data }),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn() }));

import { getEvidenceHubChangeHistoryById } from "../evidenceHubChangeHistory.ctrl";
import { getEntityChangeHistory } from "../../utils/changeHistory.base.utils";

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("getEvidenceHubChangeHistoryById (issue #4977)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a non-numeric id with 400 without querying", async () => {
    const req: any = { params: { id: "abc" }, query: {}, organizationId: 1, t: (s: string) => s };
    const res = createRes();

    await getEvidenceHubChangeHistoryById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getEntityChangeHistory).not.toHaveBeenCalled();
  });

  it("returns tenant-scoped paginated history for a valid id", async () => {
    const payload = { data: [{ id: 1, field_name: "Name" }], hasMore: false, total: 1 };
    (getEntityChangeHistory as jest.Mock).mockResolvedValue(payload as never);
    const req: any = {
      params: { id: "7" },
      query: { limit: "50", offset: "10" },
      organizationId: 1,
      t: (s: string) => s,
    };
    const res = createRes();

    await getEvidenceHubChangeHistoryById(req, res);

    expect(getEntityChangeHistory).toHaveBeenCalledWith("evidence_hub", 7, 1, 50, 10);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  it("defaults limit and offset when not provided", async () => {
    (getEntityChangeHistory as jest.Mock).mockResolvedValue({
      data: [],
      hasMore: false,
      total: 0,
    } as never);
    const req: any = { params: { id: "7" }, query: {}, organizationId: 1, t: (s: string) => s };
    const res = createRes();

    await getEvidenceHubChangeHistoryById(req, res);

    expect(getEntityChangeHistory).toHaveBeenCalledWith("evidence_hub", 7, 1, 100, 0);
  });
});
