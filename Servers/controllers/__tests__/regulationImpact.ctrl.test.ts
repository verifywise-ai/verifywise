jest.mock("../../utils/regulationImpact.utils", () => ({
  getImpactRow: jest.fn(),
  runImpactAnalysis: jest.fn(),
}));
jest.mock("../../utils/regulationsTracker.utils", () => ({
  getCountryRow: jest.fn(),
  getSettings: jest.fn().mockResolvedValue({ impact_enabled: true }),
  normalizeSlug: (s: string) => String(s).trim().toLowerCase(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(), logSuccess: jest.fn(), logFailure: jest.fn(),
}));
import { getImpactRow, runImpactAnalysis } from "../../utils/regulationImpact.utils";
import { getCountryRow, getSettings } from "../../utils/regulationsTracker.utils";
import { getImpactAnalysis, refreshImpactAnalysis } from "../regulationsTracker.ctrl";

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
beforeEach(() => jest.clearAllMocks());

describe("getImpactAnalysis", () => {
  const storedRow = {
    regulation_hash: "h1",
    status: "ok",
    result: { systems: [], controls: [], policies: [], vendors: [], assessments: [], generatedAt: "x" },
    refreshed_at: "t",
  };

  it("returns stale: true when catalog hash differs from stored hash", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    (getImpactRow as jest.Mock).mockResolvedValue(storedRow);
    // Different hash → stale
    (getCountryRow as jest.Mock).mockResolvedValue({ hash: "h2" });
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stale: true }),
      }),
    );
  });

  it("returns stale: false when catalog hash matches stored hash", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    (getImpactRow as jest.Mock).mockResolvedValue(storedRow);
    // Same hash → not stale
    (getCountryRow as jest.Mock).mockResolvedValue({ hash: "h1" });
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stale: false }),
      }),
    );
  });

  it("returns 200 with null when there is no analysis row", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    (getImpactRow as jest.Mock).mockResolvedValue(null);
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });

  // BUG 4: impact_enabled=false → return null even when a row exists
  it("returns 200/null when impact_enabled is false, even though a row exists", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: false });
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
    // getImpactRow must NOT have been called when impact is disabled
    expect(getImpactRow).not.toHaveBeenCalled();
  });
});

describe("refreshImpactAnalysis", () => {
  it("403s for non-admins", async () => {
    const req: any = { userId: 1, organizationId: 7, role: "Editor", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(runImpactAnalysis).not.toHaveBeenCalled();
  });

  // BUG 2: refreshImpactAnalysis must pass force=true so admin re-analysis is never a no-op
  it("runs analysis for admins with force=true and returns 200", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    (runImpactAnalysis as jest.Mock).mockResolvedValue({ status: "ok", result: null, counts: {}, cached: false });
    const req: any = { userId: 1, organizationId: 7, role: "Admin", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    // BUG 2 fix: force=true must be the third argument
    expect(runImpactAnalysis).toHaveBeenCalledWith(7, "eu", true);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 200 {status: disabled} and does NOT call runImpactAnalysis when impact_enabled is false", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: false });
    const req: any = { userId: 1, organizationId: 7, role: "Admin", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(runImpactAnalysis).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "disabled" } }));
  });
});
