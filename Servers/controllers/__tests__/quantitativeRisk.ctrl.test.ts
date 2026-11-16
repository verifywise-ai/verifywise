jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/quantitativeRisk.utils");
jest.mock("../../utils/riskBenchmark.utils");
jest.mock("../../utils/risk.utils");
jest.mock("../../utils/logger/fileLogger", () => ({ logStructured: jest.fn() }));
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../utils/riskVisibility.utils", () => ({
  ...jest.requireActual("../../utils/riskVisibility.utils"),
  isRiskVisibleQuery: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ getProjectAccessQuery: jest.fn() }));

import { applyBenchmark, getPortfolioTrendHandler } from "../quantitativeRisk.ctrl";
import { sequelize } from "../../database/db";
import {
  computeDerivedFields,
  getPortfolioTrend,
  recordPortfolioSnapshot,
} from "../../utils/quantitativeRisk.utils";
import { applyBenchmarkToRiskQuery, getBenchmarkByIdQuery } from "../../utils/riskBenchmark.utils";
import { getRiskByIdQuery } from "../../utils/risk.utils";
import { isRiskVisibleQuery } from "../../utils/riskVisibility.utils";
import { getProjectAccessQuery } from "../../utils/project.utils";

const mockVisible = isRiskVisibleQuery as jest.Mock;
const mockAccess = getProjectAccessQuery as jest.Mock;
const mockApply = applyBenchmarkToRiskQuery as jest.Mock;
const mockBenchmark = getBenchmarkByIdQuery as jest.Mock;
const mockTrend = getPortfolioTrend as jest.Mock;

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const req = (overrides: Record<string, unknown> = {}) =>
  ({
    userId: 5,
    role: "Editor",
    organizationId: 7,
    params: {},
    query: {},
    t: (s: string) => s,
    ...overrides,
  }) as any;

beforeEach(() => {
  jest.resetAllMocks();
  (computeDerivedFields as jest.Mock).mockReturnValue({});
  (recordPortfolioSnapshot as jest.Mock).mockResolvedValue(undefined);
  (sequelize.query as jest.Mock).mockResolvedValue([[], 1]);
  (getRiskByIdQuery as jest.Mock).mockResolvedValue({ id: 3 });
  mockBenchmark.mockResolvedValue({ id: 2, category: "Privacy" });
});

describe("applyBenchmark", () => {
  const benchmarkReq = (role = "Editor") =>
    req({ role, params: { riskId: "3", benchmarkId: "2" } });

  it("answers a hidden risk exactly like a missing one and writes nothing", async () => {
    mockVisible.mockResolvedValue(false);
    const r = res();

    await applyBenchmark(benchmarkReq(), r);

    expect(mockVisible).toHaveBeenCalledWith(3, 7, { userId: 5, role: "Editor" });
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith({ message: "Not Found", data: "Risk not found" });
    expect(mockApply).not.toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  it("gives a missing risk the same response", async () => {
    mockVisible.mockResolvedValue(true);
    mockApply.mockResolvedValue(false);
    const r = res();

    await applyBenchmark(benchmarkReq("Admin"), r);

    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith({ message: "Not Found", data: "Risk not found" });
  });

  it("applies the benchmark to a visible risk", async () => {
    mockVisible.mockResolvedValue(true);
    mockApply.mockResolvedValue(true);
    const r = res();

    await applyBenchmark(benchmarkReq(), r);

    expect(mockApply).toHaveBeenCalledWith(3, 2, 7);
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

describe("getPortfolioTrendHandler", () => {
  it.each(["denied", "not_found"])(
    "gives a non-Admin no snapshots when access to the use case is %s",
    async (access) => {
      mockAccess.mockResolvedValue(access);
      const r = res();

      await getPortfolioTrendHandler(req({ query: { projectId: "11" } }), r);

      expect(mockAccess).toHaveBeenCalledWith(11, { userId: 5, role: "Editor" }, 7);
      expect(mockTrend).not.toHaveBeenCalled();
      expect(r.status).toHaveBeenCalledWith(200);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
    },
  );

  it("gives a viewer with access the use case trend", async () => {
    mockAccess.mockResolvedValue("allowed");
    mockTrend.mockResolvedValue([{ id: 1 }]);
    const r = res();

    await getPortfolioTrendHandler(req({ query: { projectId: "11", days: "7" } }), r);

    expect(mockTrend).toHaveBeenCalledWith(7, 7, 11);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: [{ id: 1 }] }));
  });

  it("does not check access for an Admin", async () => {
    mockTrend.mockResolvedValue([{ id: 1 }]);
    const r = res();

    await getPortfolioTrendHandler(req({ role: "Admin", query: { projectId: "11" } }), r);

    expect(mockAccess).not.toHaveBeenCalled();
    expect(mockTrend).toHaveBeenCalledWith(7, 30, 11);
  });

  it("keeps the organization trend organization-wide", async () => {
    mockTrend.mockResolvedValue([{ id: 1 }]);
    const r = res();

    await getPortfolioTrendHandler(req(), r);

    expect(mockAccess).not.toHaveBeenCalled();
    expect(mockTrend).toHaveBeenCalledWith(7, 30, undefined);
  });
});
