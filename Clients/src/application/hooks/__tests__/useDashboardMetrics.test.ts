import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDashboardCache, useDashboardMetrics, CACHE_KEY } from "../useDashboardMetrics";

const mockGetAllEntities = vi.fn();
const mockGetEntityById = vi.fn();

vi.mock("../../repository/entity.repository", () => ({
  getAllEntities: (...args: unknown[]) => mockGetAllEntities(...args),
  getEntityById: (...args: unknown[]) => mockGetEntityById(...args),
}));

type MockFn = ReturnType<typeof vi.fn>;

function setCache(cache: any) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function assertNotNull<T>(value: T | null | undefined, name: string): asserts value is T {
  expect(value, `${name} should not be null`).not.toBeNull();
  expect(value, `${name} should not be undefined`).not.toBeUndefined();
}

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
      JSON.stringify({ riskMetrics: { data: { total: 5 }, timestamp: Date.now() } })
    );
    expect(hasDashboardCache()).toBe(true);
  });

  it("should return false when cache is an empty object", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({}));
    expect(hasDashboardCache()).toBe(false);
  });

  it("should return false when localStorage throws", () => {
    const original = localStorage.getItem;
    localStorage.getItem = () => { throw new Error("Storage disabled"); };
    expect(hasDashboardCache()).toBe(false);
    localStorage.getItem = original;
  });
});

describe("useDashboardMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetAllEntities.mockReset();
    mockGetEntityById.mockReset();
    mockGetAllEntities.mockResolvedValue({ data: [] });
    mockGetEntityById.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("basic loading and data fetching", () => {
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
              { id: 3, risk_name: "Risk C", current_risk_level: "Medium", mitigation_status: "Completed" },
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
  });

  describe("cache behavior", () => {
    it("should use cached data when cache is fresh", async () => {
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
      cacheData.riskMetrics = {
        data: { total: 10, distribution: { high: 5, medium: 3, low: 2, resolved: 0 }, recent: [] },
        timestamp: freshTimestamp,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.riskMetrics).not.toBeNull();
      expect(result.current.riskMetrics!.total).toBe(10);
      expect(mockGetAllEntities).not.toHaveBeenCalled();
    });

    it("skips fetching on mount when critical cache keys are fresh", async () => {
      const now = Date.now();

      setCache({
        trainingMetrics: { data: { total: 1 }, timestamp: now },
        policyStatusMetrics: { data: { total: 2 }, timestamp: now },
        incidentStatusMetrics: { data: { total: 3 }, timestamp: now },
        evidenceHubMetrics: { data: { total: 4 }, timestamp: now },
        modelLifecycleMetrics: { data: { total: 5 }, timestamp: now },
      });

      const { result } = renderHook(() => useDashboardMetrics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockGetAllEntities).not.toHaveBeenCalled();
      expect(mockGetEntityById).not.toHaveBeenCalled();
    });

    it("should trigger revalidation when hasAnyCache is true but forceRefresh is true", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.fetchAllMetrics(true);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should handle fetchAllMetrics throwing an error", async () => {
      mockGetAllEntities.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it("should set isRevalidating to false after fetch completes", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isRevalidating).toBe(false);
    });
  });

  describe("state values", () => {
    it("should have default values for all state variables", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progressStep).toBeDefined();
      expect(result.current.progressSteps).toBeDefined();
      expect(Array.isArray(result.current.progressSteps)).toBe(true);
      expect(result.current.progressSteps.length).toBeGreaterThan(0);
    });

    it("should return null for uninitialized metrics when cache is empty", async () => {
      localStorage.clear();
      mockGetAllEntities.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.riskMetrics || null).toBeDefined();
      expect(result.current.vendorRiskMetrics || null).toBeDefined();
      expect(result.current.vendorMetrics || null).toBeDefined();
    });
  });

  describe("individual fetch functions", () => {
    it("should fetch evidence metrics", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/files") {
          return {
            data: [
              { id: 1, filename: "file1.pdf", uploaded_time: "2024-01-01" },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchEvidenceMetrics();
      });

      expect(result.current.evidenceMetrics).not.toBeNull();
    });

    it("should fetch vendor risk metrics", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/vendorRisks/all") {
          return {
            data: [
              { id: 1, risk_name: "VRisk A", risk_level: "High" },
              { id: 2, risk_name: "VRisk B", risk_level: "Low" },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchVendorRiskMetrics();
      });

      expect(result.current.vendorRiskMetrics).not.toBeNull();
      expect(result.current.vendorRiskMetrics!.total).toBe(2);
    });

    it("should fetch policy metrics with status distribution", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/policies") {
          return {
            data: {
              data: [
                { id: 1, title: "Policy A", status: "draft" },
                { id: 2, title: "Policy B", status: "approved" },
                { id: 3, title: "Policy C", status: "pending_review" },
              ],
            },
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchPolicyMetrics();
      });

      expect(result.current.policyMetrics).not.toBeNull();
      expect(result.current.policyStatusMetrics).not.toBeNull();
    });

    it("should fetch incident metrics with status distribution", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/ai-incident-managements") {
          return {
            data: [
              { id: 1, incident_id: "INC-001", status: "Open", severity: "High" },
              { id: 2, incident_id: "INC-002", status: "Closed", severity: "Low" },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchIncidentMetrics();
      });

      expect(result.current.incidentMetrics).not.toBeNull();
      expect(result.current.incidentStatusMetrics).not.toBeNull();
    });

    it("should fetch model risk metrics", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/modelRisks") {
          return {
            data: [
              { id: 1, risk_name: "MRisk A", risk_level: "Critical" },
              { id: 2, risk_name: "MRisk B", risk_level: "Medium" },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchModelRiskMetrics();
      });

      expect(result.current.modelRiskMetrics).not.toBeNull();
    });

    it("should fetch training metrics", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/training") {
          return {
            data: [
              { id: 1, training_name: "Training A", status: "Completed", numberOfPeople: 10 },
              { id: 2, training_name: "Training B", status: "In Progress", numberOfPeople: 5 },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchTrainingMetrics();
      });

      expect(result.current.trainingMetrics).not.toBeNull();
    });

    it("should fetch task metrics", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/tasks") {
          return {
            data: [
              { id: 1, title: "Task A", status: "Open", created_at: "2024-01-01" },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchTaskMetrics();
      });

      expect(result.current.taskMetrics).not.toBeNull();
    });

    it("should fetch governance score metrics", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/compliance/score") {
          return {
            data: {
              overallScore: 85,
              modules: {
                riskManagement: { score: 80, weight: 0.3 },
                vendorManagement: { score: 90, weight: 0.3 },
              },
            },
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchGovernanceScoreMetrics();
      });

      expect(result.current.governanceScoreMetrics).not.toBeNull();
    });

    it("should handle governance score without expected format", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/compliance/score") {
          return { data: {} };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchGovernanceScoreMetrics();
      });

      expect(result.current.governanceScoreMetrics).not.toBeNull();
      expect(result.current.governanceScoreMetrics!.score).toBe(0);
    });
  });

  describe("cache with stale data", () => {
    it("should fetch when cache is stale", async () => {
      const staleTimestamp = Date.now() - 60000;
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

      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetAllEntities).toHaveBeenCalled();
    });

    it("should set isRevalidating when cache exists and forceRefresh is false", async () => {
      const now = Date.now();
      const cacheData: Record<string, any> = {};
      const criticalKeys = [
        "trainingMetrics",
        "policyStatusMetrics",
        "incidentStatusMetrics",
        "evidenceHubMetrics",
        "modelLifecycleMetrics",
      ];
      criticalKeys.forEach((key) => {
        cacheData[key] = { data: { total: 1 }, timestamp: now };
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isRevalidating).toBe(false);
    });

    it("should handle fetchAllMetrics with throw in one of the functions", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/projectRisks") {
          throw new Error("Network error");
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe("fetchModelMetrics", () => {
    it("should fetch evidence hub and model lifecycle metrics", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/evidenceHub") {
          return {
            data: [
              { evidence_files: ["file1.pdf", "file2.pdf"], mapped_model_ids: [1, 2] },
            ],
          };
        }
        if (routeUrl === "/modelInventory") {
          return {
            data: [
              { id: 1, name: "Model A", status: "approved" },
              { id: 2, name: "Model B", status: "pending" },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchModelMetrics();
      });

      expect(result.current.evidenceHubMetrics).not.toBeNull();
      expect(result.current.modelLifecycleMetrics).not.toBeNull();
    });
  });

  describe("fetchProjectMetrics", () => {
    it("should fetch use case metrics and organizational frameworks", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/projects") {
          return {
            data: [
              { id: 1, project_title: "Project A", is_organizational: false, created_at: "2024-01-01" },
            ],
          };
        }
        if (routeUrl === "/frameworks") {
          return { data: [{ id: 1, name: "ISO 27001" }] };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchProjectMetrics();
      });

      expect(result.current.useCaseMetrics).not.toBeNull();
    });

    it("should handle organizational project with frameworks", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/projects") {
          return {
            data: [
              {
                id: 1,
                project_title: "Org Project",
                is_organizational: true,
                framework: [{ framework_id: 1 }],
              },
            ],
          };
        }
        if (routeUrl === "/frameworks") {
          return { data: [{ id: 1, name: "ISO 27001" }] };
        }
        if (routeUrl === "/iso-27001/clauses/progress/1") {
          return { data: { totalSubclauses: 10, doneSubclauses: 5 } };
        }
        if (routeUrl === "/iso-27001/annexes/progress/1") {
          return { data: { totalAnnexControls: 5, doneAnnexControls: 2 } };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await act(async () => {
        await result.current.fetchProjectMetrics();
      });

      expect(result.current.organizationalFrameworks).not.toBeNull();
    });
  });

  describe("risk metrics edge cases", () => {
    it("should handle risks with unknown risk levels", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/projectRisks") {
          return {
            data: [
              { id: 1, risk_name: "Risk A", current_risk_level: "Unknown" },
              { id: 2, risk_name: "Risk B", risk_level_autocalculated: "medium" },
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
      expect(result.current.riskMetrics!.distribution.medium).toBe(2);
    });

    it("should handle risks with completed mitigation status", async () => {
      mockGetAllEntities.mockImplementation(async ({ routeUrl }: any) => {
        if (routeUrl === "/projectRisks") {
          return {
            data: [
              { id: 1, risk_name: "Risk A", mitigation_status: "Completed" },
              { id: 2, risk_name: "Risk B", mitigation_status: "Completed" },
            ],
          };
        }
        return { data: [] };
      });

      const { result } = renderHook(() => useDashboardMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.riskMetrics!.distribution.resolved).toBe(2);
    });
  });
});
