import { renderHook, waitFor, act } from "@testing-library/react";
import { hasDashboardCache, useDashboardMetrics, CACHE_KEY } from "../useDashboardMetrics";

// Mock the entity repository
vi.mock("../../repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
  getEntityById: vi.fn(),
}));

import { getAllEntities, getEntityById } from "../../repository/entity.repository";

const mockGetAllEntities = vi.mocked(getAllEntities);
const mockGetEntityById = vi.mocked(getEntityById);

describe("hasDashboardCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should return false when localStorage is empty", () => {
    expect(hasDashboardCache()).toBe(false);
  });

  it("should return true when cache has entries", () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ riskMetrics: { data: { total: 5 }, timestamp: Date.now() } }),
    );
    expect(hasDashboardCache()).toBe(true);
  });

  it("should return false when cache is an empty object", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({}));
    expect(hasDashboardCache()).toBe(false);
  });

  it("should return false when localStorage throws", () => {
    const original = localStorage.getItem;
    localStorage.getItem = () => {
      throw new Error("Storage disabled");
    };
    expect(hasDashboardCache()).toBe(false);
    localStorage.getItem = original;
  });
});

describe("useDashboardMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: all API calls resolve with empty data
    mockGetAllEntities.mockResolvedValue({ data: [] });
    mockGetEntityById.mockResolvedValue({ data: {} });
  });

  it("should set loading=false after all groups complete", async () => {
    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("should fetch risk metrics from /projectRisks endpoint", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/projectRisks") {
        return {
          data: [
            { id: 1, risk_name: "Risk A", current_risk_level: "High", mitigation_status: "Open" },
            { id: 2, risk_name: "Risk B", current_risk_level: "Low", mitigation_status: "Open" },
            {
              id: 3,
              risk_name: "Risk C",
              current_risk_level: "Medium",
              mitigation_status: "Completed",
            },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.riskMetrics).not.toBeNull();
    expect(result.current.riskMetrics!.total).toBe(3);
    expect(result.current.riskMetrics!.distribution.high).toBe(1);
    expect(result.current.riskMetrics!.distribution.low).toBe(1);
    expect(result.current.riskMetrics!.distribution.resolved).toBe(1);
  });

  it("should fetch vendor metrics from /vendors endpoint", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/vendors") {
        return {
          data: [
            { id: 1, name: "Vendor A", status: "Active" },
            { id: 2, name: "Vendor B", status: "Inactive" },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.vendorMetrics).not.toBeNull();
    expect(result.current.vendorMetrics!.total).toBe(2);
  });

  it("should handle API error gracefully via Promise.allSettled", async () => {
    // Suppress expected console noise from error-handling code paths
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetAllEntities.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should not crash — fallback values are set
    expect(result.current.error).toBeNull();
  });

  it("should use cached data when cache is fresh", async () => {
    // Seed all critical keys so shouldSkipFetch returns true
    const freshTimestamp = Date.now();
    const cacheData: Record<string, any> = {};
    const criticalKeys = [
      "trainingMetrics",
      "policyStatusMetrics",
      "incidentStatusMetrics",
      "evidenceHubMetrics",
      "modelLifecycleMetrics",
    ];
    criticalKeys.forEach((key) => {
      cacheData[key] = { data: { total: 1 }, timestamp: freshTimestamp };
    });
    // Also seed risk so we see it from cache
    cacheData.riskMetrics = {
      data: { total: 10, distribution: { high: 5, medium: 3, low: 2, resolved: 0 }, recent: [] },
      timestamp: freshTimestamp,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should load from cache without making network calls
    expect(result.current.riskMetrics).not.toBeNull();
    expect(result.current.riskMetrics!.total).toBe(10);
    // No network calls should have been made when cache is fully fresh
    expect(mockGetAllEntities).not.toHaveBeenCalled();
  });

  it("should expose individual fetch functions", async () => {
    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.fetchRiskMetrics).toBe("function");
    expect(typeof result.current.fetchVendorMetrics).toBe("function");
    expect(typeof result.current.fetchPolicyMetrics).toBe("function");
    expect(typeof result.current.fetchIncidentMetrics).toBe("function");
    expect(typeof result.current.fetchModelRiskMetrics).toBe("function");
    expect(typeof result.current.fetchTrainingMetrics).toBe("function");
    expect(typeof result.current.fetchGovernanceScoreMetrics).toBe("function");
    expect(typeof result.current.fetchTaskMetrics).toBe("function");
    expect(typeof result.current.fetchAllMetrics).toBe("function");
  });

  it("should track progress steps during sequential fetch groups", async () => {
    // Use a slow mock to observe progress
    let resolvers: (() => void)[] = [];
    mockGetAllEntities.mockImplementation(
      () =>
        new Promise<any>((resolve) => {
          resolvers.push(() => resolve({ data: [] }));
        }),
    );
    mockGetEntityById.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useDashboardMetrics());

    // Progress starts at 0
    expect(result.current.progressStep).toBe(0);
    expect(result.current.progressSteps).toHaveLength(5);
    expect(result.current.progressSteps[0].label).toContain("risks");
  });

  it("should return governance score metrics with module breakdown", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/compliance/score") {
        return {
          data: {
            overallScore: 78.5,
            modules: {
              riskManagement: { score: 85, weight: 0.3 },
              vendorManagement: { score: 72, weight: 0.3 },
              projectGovernance: { score: 80, weight: 0.25 },
              modelLifecycle: { score: 65, weight: 0.1 },
              policyDocumentation: { score: 70, weight: 0.05 },
            },
          },
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.governanceScoreMetrics).not.toBeNull();
    expect(result.current.governanceScoreMetrics!.score).toBe(78.5);
    expect(result.current.governanceScoreMetrics!.modules).toHaveLength(5);
  });

  it("should cache fetched data in localStorage", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/tasks") {
        return {
          data: [
            { id: 1, title: "Task 1", status: "Open", priority: "High", created_at: "2026-01-01" },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const cached = JSON.parse(localStorage.getItem(CACHE_KEY)!);
    expect(cached.taskMetrics).toBeDefined();
    expect(cached.taskMetrics.data.total).toBe(1);
  });

  it("should call individual fetch function and update state", async () => {
    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Reset mocks, then call individual fetch
    vi.clearAllMocks();
    mockGetAllEntities.mockResolvedValue({
      data: [{ id: 1, risk_name: "New Risk", current_risk_level: "High" }],
    });

    await act(async () => {
      await result.current.fetchRiskMetrics();
    });

    expect(result.current.riskMetrics).not.toBeNull();
    expect(result.current.riskMetrics!.total).toBe(1);
    expect(mockGetAllEntities).toHaveBeenCalledWith({ routeUrl: "/projectRisks" });
  });
});
