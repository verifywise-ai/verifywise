import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/quantitativeRisk.repository", () => ({
  getAllBenchmarks: vi.fn(),
  getBenchmarkFilters: vi.fn(),
  getOrgPortfolio: vi.fn(),
  getProjectPortfolio: vi.fn(),
  getPortfolioTrend: vi.fn(),
}));

import { useBenchmarks, useBenchmarkFilters, useOrgPortfolio, useProjectPortfolio, usePortfolioTrend } from "../useQuantitativeRisk";
import { getAllBenchmarks, getBenchmarkFilters, getOrgPortfolio, getProjectPortfolio, getPortfolioTrend } from "../../repository/quantitativeRisk.repository";

const mockGetBenchmarks = vi.mocked(getAllBenchmarks);
const mockGetFilters = vi.mocked(getBenchmarkFilters);
const mockGetOrgPortfolio = vi.mocked(getOrgPortfolio);
const mockGetProjectPortfolio = vi.mocked(getProjectPortfolio);
const mockGetTrend = vi.mocked(getPortfolioTrend);

describe("useBenchmarks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches benchmarks", async () => {
    mockGetBenchmarks.mockResolvedValue([{ id: 1, industry: "finance" }] as any);

    const { result } = renderHook(() => useBenchmarks("finance"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.benchmarks).toHaveLength(1);
  });
});

describe("useBenchmarkFilters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches filters", async () => {
    mockGetFilters.mockResolvedValue({ industries: ["finance"], aiRiskTypes: ["bias"] });

    const { result } = renderHook(() => useBenchmarkFilters());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.filters.industries).toContain("finance");
  });
});

describe("useOrgPortfolio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches org portfolio", async () => {
    mockGetOrgPortfolio.mockResolvedValue({ riskScore: 72, modelCount: 5 } as any);

    const { result } = renderHook(() => useOrgPortfolio());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect((result.current.portfolio as any)?.riskScore).toBe(72);
  });
});

describe("useProjectPortfolio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches project portfolio", async () => {
    mockGetProjectPortfolio.mockResolvedValue({ riskScore: 45 } as any);

    const { result } = renderHook(() => useProjectPortfolio(1));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect((result.current.portfolio as any)?.riskScore).toBe(45);
  });

  it("returns null when projectId is undefined", async () => {
    const { result } = renderHook(() => useProjectPortfolio(undefined));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.portfolio).toBeNull();
  });
});

describe("usePortfolioTrend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches trend data", async () => {
    mockGetTrend.mockResolvedValue([{ date: "2024-01-01", score: 50 }] as any);

    const { result } = renderHook(() => usePortfolioTrend(30));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.snapshots).toHaveLength(1);
  });
});
