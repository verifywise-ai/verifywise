jest.mock("../../utils/regulationImpact.utils", () => ({
  getImpactRow: jest.fn(),
  runImpactAnalysis: jest.fn(),
}));
jest.mock("../../utils/regulationsTracker.utils", () => ({}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(), logSuccess: jest.fn(), logFailure: jest.fn(),
}));
import { getImpactRow, runImpactAnalysis } from "../../utils/regulationImpact.utils";
import { getImpactAnalysis, refreshImpactAnalysis } from "../regulationsTracker.ctrl";

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
beforeEach(() => jest.clearAllMocks());

describe("getImpactAnalysis", () => {
  it("returns 200 with the row and a stale flag computed against current hash", async () => {
    (getImpactRow as jest.Mock).mockResolvedValue({
      regulation_hash: "h1", status: "ok",
      result: { systems: [], controls: [], policies: [], vendors: [], assessments: [], generatedAt: "x" },
      refreshed_at: "t",
    });
    const req: any = { organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 200 with null when there is no analysis row", async () => {
    (getImpactRow as jest.Mock).mockResolvedValue(null);
    const req: any = { organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });
});

describe("refreshImpactAnalysis", () => {
  it("403s for non-admins", async () => {
    const req: any = { organizationId: 7, role: "Editor", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(runImpactAnalysis).not.toHaveBeenCalled();
  });

  it("runs analysis for admins and returns 200", async () => {
    (runImpactAnalysis as jest.Mock).mockResolvedValue({ status: "ok", result: null, counts: {} });
    const req: any = { organizationId: 7, role: "Admin", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(runImpactAnalysis).toHaveBeenCalledWith(7, "eu");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
