import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomAxios from "../../../infrastructure/api/customAxios";
import {
  getAllBenchmarks,
  getBenchmarkById,
  getBenchmarkFilters,
  applyBenchmarkToRisk,
  getOrgPortfolio,
  getProjectPortfolio,
  getPortfolioTrend,
  getRiskAssessmentMode,
  updateRiskAssessmentMode,
} from "../quantitativeRisk.repository";

vi.mock("../../../infrastructure/api/customAxios", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quantitativeRisk.repository", () => {
  // ==================== getAllBenchmarks ====================

  describe("getAllBenchmarks", () => {
    it("should call GET /risk-benchmarks without query params when no args provided", async () => {
      const mockData = [{ id: 1, name: "Benchmark A" }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getAllBenchmarks();

      expect(CustomAxios.get).toHaveBeenCalledWith("/risk-benchmarks");
      expect(result).toEqual(mockData);
    });

    it("should include industry query param when provided", async () => {
      const mockData = [{ id: 2, name: "Benchmark B" }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getAllBenchmarks("healthcare");

      expect(CustomAxios.get).toHaveBeenCalledWith("/risk-benchmarks?industry=healthcare");
      expect(result).toEqual(mockData);
    });

    it("should include aiRiskType query param when provided", async () => {
      const mockData = [{ id: 3, name: "Benchmark C" }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getAllBenchmarks(undefined, "high");

      expect(CustomAxios.get).toHaveBeenCalledWith("/risk-benchmarks?ai_risk_type=high");
      expect(result).toEqual(mockData);
    });

    it("should include both query params when both are provided", async () => {
      const mockData = [{ id: 4, name: "Benchmark D" }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getAllBenchmarks("finance", "medium");

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/risk-benchmarks?industry=finance&ai_risk_type=medium",
      );
      expect(result).toEqual(mockData);
    });

    it("should return empty array when no benchmarks found", async () => {
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: [] },
      });

      const result = await getAllBenchmarks();

      expect(result).toEqual([]);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Network error"));

      await expect(getAllBenchmarks()).rejects.toThrow("Network error");
    });
  });

  // ==================== getBenchmarkById ====================

  describe("getBenchmarkById", () => {
    it("should call GET /risk-benchmarks/{id} and return data", async () => {
      const mockData = { id: 5, name: "Benchmark E" };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getBenchmarkById(5);

      expect(CustomAxios.get).toHaveBeenCalledWith("/risk-benchmarks/5");
      expect(result).toEqual(mockData);
    });

    it("should handle different IDs", async () => {
      const mockData = { id: 42, name: "Benchmark X" };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getBenchmarkById(42);

      expect(CustomAxios.get).toHaveBeenCalledWith("/risk-benchmarks/42");
      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Benchmark not found"));

      await expect(getBenchmarkById(999)).rejects.toThrow("Benchmark not found");
    });
  });

  // ==================== getBenchmarkFilters ====================

  describe("getBenchmarkFilters", () => {
    it("should call GET /risk-benchmarks/filters and return data", async () => {
      const mockData = {
        industries: ["healthcare", "finance"],
        ai_risk_types: ["high", "medium", "low"],
      };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getBenchmarkFilters();

      expect(CustomAxios.get).toHaveBeenCalledWith("/risk-benchmarks/filters");
      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Server error"));

      await expect(getBenchmarkFilters()).rejects.toThrow("Server error");
    });
  });

  // ==================== applyBenchmarkToRisk ====================

  describe("applyBenchmarkToRisk", () => {
    it("should call POST /quantitative-risks/{riskId}/apply-benchmark/{benchmarkId} and return data", async () => {
      const mockData = { success: true };
      vi.mocked(CustomAxios.post).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await applyBenchmarkToRisk(10, 20);

      expect(CustomAxios.post).toHaveBeenCalledWith("/quantitative-risks/10/apply-benchmark/20");
      expect(result).toEqual(mockData);
    });

    it("should handle different riskId and benchmarkId values", async () => {
      const mockData = { applied: true, riskId: 99, benchmarkId: 88 };
      vi.mocked(CustomAxios.post).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await applyBenchmarkToRisk(99, 88);

      expect(CustomAxios.post).toHaveBeenCalledWith("/quantitative-risks/99/apply-benchmark/88");
      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.post).mockRejectedValue(new Error("Risk not found"));

      await expect(applyBenchmarkToRisk(999, 1)).rejects.toThrow("Risk not found");
    });
  });

  // ==================== getOrgPortfolio ====================

  describe("getOrgPortfolio", () => {
    it("should call GET /quantitative-risks/portfolio/org and return data", async () => {
      const mockData = { totalRisks: 15, averageScore: 3.5 };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getOrgPortfolio();

      expect(CustomAxios.get).toHaveBeenCalledWith("/quantitative-risks/portfolio/org");
      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Unauthorized"));

      await expect(getOrgPortfolio()).rejects.toThrow("Unauthorized");
    });
  });

  // ==================== getProjectPortfolio ====================

  describe("getProjectPortfolio", () => {
    it("should call GET /quantitative-risks/portfolio/project/{projectId} and return data", async () => {
      const mockData = { totalRisks: 5, averageScore: 2.8 };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getProjectPortfolio(7);

      expect(CustomAxios.get).toHaveBeenCalledWith("/quantitative-risks/portfolio/project/7");
      expect(result).toEqual(mockData);
    });

    it("should handle different project IDs", async () => {
      const mockData = { totalRisks: 10, averageScore: 4.0 };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getProjectPortfolio(42);

      expect(CustomAxios.get).toHaveBeenCalledWith("/quantitative-risks/portfolio/project/42");
      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Project not found"));

      await expect(getProjectPortfolio(999)).rejects.toThrow("Project not found");
    });
  });

  // ==================== getPortfolioTrend ====================

  describe("getPortfolioTrend", () => {
    it("should call GET /quantitative-risks/portfolio/trend without query params when no args provided", async () => {
      const mockData = [{ date: "2026-04-01", score: 3.2 }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getPortfolioTrend();

      expect(CustomAxios.get).toHaveBeenCalledWith("/quantitative-risks/portfolio/trend");
      expect(result).toEqual(mockData);
    });

    it("should include days query param when provided", async () => {
      const mockData = [{ date: "2026-04-01", score: 3.5 }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getPortfolioTrend(30);

      expect(CustomAxios.get).toHaveBeenCalledWith("/quantitative-risks/portfolio/trend?days=30");
      expect(result).toEqual(mockData);
    });

    it("should include projectId query param when provided", async () => {
      const mockData = [{ date: "2026-04-01", score: 2.0 }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getPortfolioTrend(undefined, 5);

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/quantitative-risks/portfolio/trend?projectId=5",
      );
      expect(result).toEqual(mockData);
    });

    it("should include both query params when both are provided", async () => {
      const mockData = [{ date: "2026-04-01", score: 4.1 }];
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getPortfolioTrend(90, 12);

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/quantitative-risks/portfolio/trend?days=90&projectId=12",
      );
      expect(result).toEqual(mockData);
    });

    it("should return empty array when no snapshots found", async () => {
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: [] },
      });

      const result = await getPortfolioTrend();

      expect(result).toEqual([]);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Server error"));

      await expect(getPortfolioTrend(30)).rejects.toThrow("Server error");
    });
  });

  // ==================== getRiskAssessmentMode ====================

  describe("getRiskAssessmentMode", () => {
    it("should call GET /quantitative-risks/assessment-mode and return data", async () => {
      const mockData = { risk_assessment_mode: "qualitative" };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getRiskAssessmentMode();

      expect(CustomAxios.get).toHaveBeenCalledWith("/quantitative-risks/assessment-mode");
      expect(result).toEqual(mockData);
    });

    it("should return quantitative mode", async () => {
      const mockData = { risk_assessment_mode: "quantitative" };
      vi.mocked(CustomAxios.get).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getRiskAssessmentMode();

      expect(result).toEqual({ risk_assessment_mode: "quantitative" });
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(new Error("Unauthorized"));

      await expect(getRiskAssessmentMode()).rejects.toThrow("Unauthorized");
    });
  });

  // ==================== updateRiskAssessmentMode ====================

  describe("updateRiskAssessmentMode", () => {
    it("should call PUT /quantitative-risks/assessment-mode with mode and return data", async () => {
      const mockData = { risk_assessment_mode: "quantitative" };
      vi.mocked(CustomAxios.put).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await updateRiskAssessmentMode("quantitative");

      expect(CustomAxios.put).toHaveBeenCalledWith("/quantitative-risks/assessment-mode", {
        mode: "quantitative",
      });
      expect(result).toEqual(mockData);
    });

    it("should handle switching to qualitative mode", async () => {
      const mockData = { risk_assessment_mode: "qualitative" };
      vi.mocked(CustomAxios.put).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await updateRiskAssessmentMode("qualitative");

      expect(CustomAxios.put).toHaveBeenCalledWith("/quantitative-risks/assessment-mode", {
        mode: "qualitative",
      });
      expect(result).toEqual(mockData);
    });

    it("should propagate errors", async () => {
      vi.mocked(CustomAxios.put).mockRejectedValue(new Error("Forbidden"));

      await expect(updateRiskAssessmentMode("quantitative")).rejects.toThrow("Forbidden");
    });
  });
});
