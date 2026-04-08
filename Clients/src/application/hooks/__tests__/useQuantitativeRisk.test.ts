import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBenchmarks, useBenchmarkFilters, useOrgPortfolio, useProjectPortfolio, usePortfolioTrend } from "../useQuantitativeRisk";
import * as quantitativeRiskRepository from "../../repository/quantitativeRisk.repository";

vi.mock("../../repository/quantitativeRisk.repository", () => ({
  getAllBenchmarks: vi.fn(),
  getBenchmarkFilters: vi.fn(),
  getOrgPortfolio: vi.fn(),
  getProjectPortfolio: vi.fn(),
  getPortfolioTrend: vi.fn(),
}));

const mockGetAllBenchmarks = quantitativeRiskRepository.getAllBenchmarks as unknown as ReturnType<typeof vi.fn>;
const mockGetBenchmarkFilters = quantitativeRiskRepository.getBenchmarkFilters as unknown as ReturnType<typeof vi.fn>;
const mockGetOrgPortfolio = quantitativeRiskRepository.getOrgPortfolio as unknown as ReturnType<typeof vi.fn>;
const mockGetProjectPortfolio = quantitativeRiskRepository.getProjectPortfolio as unknown as ReturnType<typeof vi.fn>;
const mockGetPortfolioTrend = quantitativeRiskRepository.getPortfolioTrend as unknown as ReturnType<typeof vi.fn>;

describe("useQuantitativeRisk hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("useBenchmarks", () => {
    it("should fetch benchmarks with default parameters", async () => {
      const mockBenchmarks = [
        { id: 1, name: "Benchmark 1", score: 85 },
        { id: 2, name: "Benchmark 2", score: 90 },
      ];
      mockGetAllBenchmarks.mockResolvedValue(mockBenchmarks);

      const { result } = renderHook(() => useBenchmarks());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.benchmarks).toEqual(mockBenchmarks);
      expect(mockGetAllBenchmarks).toHaveBeenCalledWith(undefined, undefined);
    });

    it("should fetch benchmarks with filters", async () => {
      const mockBenchmarks = [{ id: 1, name: "Tech Industry Benchmark" }];
      mockGetAllBenchmarks.mockResolvedValue(mockBenchmarks);

      const { result } = renderHook(() => useBenchmarks("technology", "high-risk"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.benchmarks).toEqual(mockBenchmarks);
      expect(mockGetAllBenchmarks).toHaveBeenCalledWith("technology", "high-risk");
    });

    it("should handle fetch error", async () => {
      mockGetAllBenchmarks.mockRejectedValue(new Error("Failed to fetch"));

      const { result } = renderHook(() => useBenchmarks());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.benchmarks).toEqual([]);
    });

    it("should refetch benchmarks", async () => {
      mockGetAllBenchmarks.mockResolvedValue([{ id: 1 }]);

      const { result } = renderHook(() => useBenchmarks());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetAllBenchmarks.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetAllBenchmarks).toHaveBeenCalledTimes(2);
    });
  });

  describe("useBenchmarkFilters", () => {
    it("should fetch benchmark filters", async () => {
      const mockFilters = {
        industries: ["Technology", "Healthcare", "Finance"],
        aiRiskTypes: ["High Risk", "Limited Risk", "Minimal Risk"],
      };
      mockGetBenchmarkFilters.mockResolvedValue(mockFilters);

      const { result } = renderHook(() => useBenchmarkFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.filters).toEqual(mockFilters);
    });

    it("should handle fetch error", async () => {
      mockGetBenchmarkFilters.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => useBenchmarkFilters());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.filters).toEqual({ industries: [], aiRiskTypes: [] });
    });
  });

  describe("useOrgPortfolio", () => {
    it("should fetch org portfolio", async () => {
      const mockPortfolio = {
        totalRisks: 10,
        highRisks: 3,
        mediumRisks: 5,
        lowRisks: 2,
      };
      mockGetOrgPortfolio.mockResolvedValue(mockPortfolio);

      const { result } = renderHook(() => useOrgPortfolio());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.portfolio).toEqual(mockPortfolio);
    });

    it("should handle fetch error", async () => {
      mockGetOrgPortfolio.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => useOrgPortfolio());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.portfolio).toBeNull();
    });
  });

  describe("useProjectPortfolio", () => {
    it("should fetch project portfolio", async () => {
      const mockPortfolio = { id: 1, riskScore: 75 };
      mockGetProjectPortfolio.mockResolvedValue(mockPortfolio);

      const { result } = renderHook(() => useProjectPortfolio(123));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.portfolio).toEqual(mockPortfolio);
      expect(mockGetProjectPortfolio).toHaveBeenCalledWith(123);
    });

    it("should not fetch when projectId is undefined", async () => {
      const { result } = renderHook(() => useProjectPortfolio(undefined));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.portfolio).toBeNull();
      expect(mockGetProjectPortfolio).not.toHaveBeenCalled();
    });

    it("should handle fetch error", async () => {
      mockGetProjectPortfolio.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => useProjectPortfolio(123));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.portfolio).toBeNull();
    });
  });

  describe("usePortfolioTrend", () => {
    it("should fetch portfolio trend with default days", async () => {
      const mockSnapshots = [
        { date: "2024-01-01", score: 80 },
        { date: "2024-01-02", score: 82 },
      ];
      mockGetPortfolioTrend.mockResolvedValue(mockSnapshots);

      const { result } = renderHook(() => usePortfolioTrend());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.snapshots).toEqual(mockSnapshots);
      expect(mockGetPortfolioTrend).toHaveBeenCalledWith(30, undefined);
    });

    it("should fetch portfolio trend with custom days and projectId", async () => {
      const mockSnapshots = [{ date: "2024-01-01", score: 85 }];
      mockGetPortfolioTrend.mockResolvedValue(mockSnapshots);

      const { result } = renderHook(() => usePortfolioTrend(60, 456));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.snapshots).toEqual(mockSnapshots);
      expect(mockGetPortfolioTrend).toHaveBeenCalledWith(60, 456);
    });

    it("should handle fetch error", async () => {
      mockGetPortfolioTrend.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => usePortfolioTrend());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.snapshots).toEqual([]);
    });
  });
});
