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

  it("should fetch vendor risk metrics with distribution", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/vendorRisks/all") {
        return {
          data: [
            { id: 1, risk_level: "Very high", vendor_name: "V1" },
            { id: 2, risk_level: "High", vendor_name: "V2" },
            { id: 3, risk_level: "Medium", vendor_name: "V3" },
            { id: 4, risk_level: "Low", vendor_name: "V4" },
            { id: 5, risk_level: "Very low", vendor_name: "V5" },
            { id: 6, risk_level: "Unknown", vendor_name: "V6" },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.vendorRiskMetrics).not.toBeNull();
    expect(result.current.vendorRiskMetrics!.total).toBe(6);
    expect(result.current.vendorRiskMetrics!.distribution.veryHigh).toBe(1);
    expect(result.current.vendorRiskMetrics!.distribution.high).toBe(1);
    expect(result.current.vendorRiskMetrics!.distribution.medium).toBe(2);
    expect(result.current.vendorRiskMetrics!.distribution.low).toBe(1);
    expect(result.current.vendorRiskMetrics!.distribution.veryLow).toBe(1);
  });

  it("should fetch policy metrics and status distribution", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/policies") {
        return {
          data: {
            data: [
              { id: "1", title: "P1", status: "draft" },
              { id: "2", title: "P2", status: "pending_review" },
              { id: "3", title: "P3", status: "approved" },
              { id: "4", title: "P4", status: "published" },
              { id: "5", title: "P5", status: "archived" },
              { id: "6", title: "P6", status: "deprecated" },
            ],
          },
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.policyMetrics).not.toBeNull();
    expect(result.current.policyMetrics!.total).toBe(6);
    expect(result.current.policyMetrics!.pendingReviewCount).toBe(1);
    expect(result.current.policyStatusMetrics).not.toBeNull();
    expect(result.current.policyStatusMetrics!.distribution.draft).toBe(1);
    expect(result.current.policyStatusMetrics!.distribution.underReview).toBe(1);
    expect(result.current.policyStatusMetrics!.distribution.approved).toBe(1);
    expect(result.current.policyStatusMetrics!.distribution.published).toBe(1);
    expect(result.current.policyStatusMetrics!.distribution.archived).toBe(1);
    expect(result.current.policyStatusMetrics!.distribution.deprecated).toBe(1);
  });

  it("should fetch incident metrics and status distribution", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/ai-incident-managements") {
        return {
          data: [
            { id: 1, status: "Open", severity: "High" },
            { id: 2, status: "Investigating", severity: "Medium" },
            { id: 3, status: "Mitigated", severity: "Low" },
            { id: 4, status: "Closed", severity: "Low" },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.incidentMetrics).not.toBeNull();
    expect(result.current.incidentMetrics!.total).toBe(4);
    expect(result.current.incidentMetrics!.openCount).toBe(1);
    expect(result.current.incidentStatusMetrics!.distribution.open).toBe(1);
    expect(result.current.incidentStatusMetrics!.distribution.investigating).toBe(1);
    expect(result.current.incidentStatusMetrics!.distribution.mitigated).toBe(1);
    expect(result.current.incidentStatusMetrics!.distribution.closed).toBe(1);
  });

  it("should fetch model risk metrics with distribution", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/modelRisks") {
        return {
          data: [
            { id: 1, risk_level: "Critical" },
            { id: 2, risk_level: "High" },
            { id: 3, risk_level: "Medium" },
            { id: 4, risk_level: "Low" },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.modelRiskMetrics).not.toBeNull();
    expect(result.current.modelRiskMetrics!.total).toBe(4);
    expect(result.current.modelRiskMetrics!.distribution.critical).toBe(1);
    expect(result.current.modelRiskMetrics!.distribution.high).toBe(1);
    expect(result.current.modelRiskMetrics!.distribution.medium).toBe(1);
    expect(result.current.modelRiskMetrics!.distribution.low).toBe(1);
  });

  it("should fetch training metrics with completion percentage", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/training") {
        return {
          data: [
            { id: 1, status: "completed", numberOfPeople: 10 },
            { id: 2, status: "in progress", numberOfPeople: 5 },
            { id: 3, status: "planned", numberOfPeople: 3 },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.trainingMetrics).not.toBeNull();
    expect(result.current.trainingMetrics!.total).toBe(3);
    expect(result.current.trainingMetrics!.completionPercentage).toBe(33);
    expect(result.current.trainingMetrics!.totalPeople).toBe(18);
    expect(result.current.trainingMetrics!.distribution.completed).toBe(1);
    expect(result.current.trainingMetrics!.distribution.inProgress).toBe(1);
    expect(result.current.trainingMetrics!.distribution.planned).toBe(1);
  });

  it("should fetch model metrics (evidenceHub + lifecycle)", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/evidenceHub") {
        return {
          data: [
            {
              evidence_files: [{ id: 1 }],
              mapped_model_ids: [1],
            },
          ],
        };
      }
      if (routeUrl === "/modelInventory") {
        return {
          data: [
            { id: 1, status: "Approved" },
            { id: 2, status: "Pending" },
            { id: 3, status: "Restricted" },
            { id: 4, status: "Blocked" },
          ],
        };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.evidenceHubMetrics).not.toBeNull();
    expect(result.current.evidenceHubMetrics!.total).toBe(1);
    expect(result.current.evidenceHubMetrics!.totalFiles).toBe(1);
    expect(result.current.evidenceHubMetrics!.totalModels).toBe(4);
    expect(result.current.modelLifecycleMetrics).not.toBeNull();
    expect(result.current.modelLifecycleMetrics!.total).toBe(4);
    expect(result.current.modelLifecycleMetrics!.distribution.approved).toBe(1);
    expect(result.current.modelLifecycleMetrics!.distribution.pending).toBe(1);
    expect(result.current.modelLifecycleMetrics!.distribution.restricted).toBe(1);
    expect(result.current.modelLifecycleMetrics!.distribution.blocked).toBe(1);
  });

  it("should handle governance score fallback when API returns unexpected format", async () => {
    mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
      if (routeUrl === "/compliance/score") {
        return { data: {} };
      }
      return { data: [] };
    });

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.governanceScoreMetrics).not.toBeNull();
    expect(result.current.governanceScoreMetrics!.score).toBe(0);
    expect(result.current.governanceScoreMetrics!.modules).toHaveLength(5);
  });

  it("should revalidate when cache is stale", async () => {
    const staleTimestamp = Date.now() - 60 * 1000;
    const cacheData: Record<string, any> = {};
    const criticalKeys = [
      "trainingMetrics",
      "policyStatusMetrics",
      "incidentStatusMetrics",
      "evidenceHubMetrics",
      "modelLifecycleMetrics",
    ];
    criticalKeys.forEach((key) => {
      cacheData[key] = { data: { total: 1 }, timestamp: staleTimestamp };
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    const { result } = renderHook(() => useDashboardMetrics());

    await waitFor(() => {
      // isRevalidating should become true then false as stale data is revalidated
      expect(result.current.isRevalidating).toBe(false);
    });

    // Network calls should have been made since cache is stale
    expect(mockGetAllEntities).toHaveBeenCalled();
  });
});
