import { renderHook, act } from "@testing-library/react";
import { useLinkedRisks } from "../useLinkedRisks";

const mockGetEntityById = vi.fn();

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getEntityById: (...args: unknown[]) => mockGetEntityById(...args),
}));

function setup(onAlert = vi.fn()) {
  const { result } = renderHook(() => useLinkedRisks({ onAlert }));
  return { result, onAlert };
}

describe("useLinkedRisks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyLinkedRisks", () => {
    it("sets linkedRiskObjects and derives currentRisks from their ids", () => {
      const { result } = setup();
      const risks = [
        { id: 1, risk_name: "Risk A" },
        { id: 2, risk_name: "Risk B" },
      ];

      act(() => {
        result.current.applyLinkedRisks(risks);
      });

      expect(result.current.linkedRiskObjects).toEqual(risks);
      expect(result.current.currentRisks).toEqual([1, 2]);
    });
  });

  describe("handleViewRiskDetails", () => {
    it("fetches the risk and populates riskFormData, opening the detail modal", async () => {
      mockGetEntityById.mockResolvedValue({
        data: {
          risk_name: "Data leak",
          risk_owner: 4,
          ai_lifecycle_phase: 2,
          risk_description: "Potential leak of PII",
          risk_category: [3],
          impact: "High",
          assessment_mapping: 1,
          controls_mapping: 1,
          likelihood_score: 3,
          severity_score: 4,
          risk_level: 5,
          review_notes: "Needs review",
          applicable_projects: [1],
          applicable_frameworks: [2],
        },
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleViewRiskDetails({ id: 1, risk_name: "Data leak" });
      });

      expect(mockGetEntityById).toHaveBeenCalledWith({ routeUrl: "/projectRisks/1" });
      expect(result.current.isRiskDetailModalOpen).toBe(true);
      expect(result.current.selectedRiskForView).toEqual({ id: 1, risk_name: "Data leak" });
      expect(result.current.riskFormData).toEqual(
        expect.objectContaining({
          riskName: "Data leak",
          actionOwner: 4,
          riskDescription: "Potential leak of PII",
          likelihood: 3,
          riskSeverity: 4,
        }),
      );
    });

    it("applies fallback defaults for missing fields", async () => {
      mockGetEntityById.mockResolvedValue({ data: {} });
      const { result } = setup();

      await act(async () => {
        await result.current.handleViewRiskDetails({ id: 2, risk_name: "Untitled" });
      });

      expect(result.current.riskFormData).toEqual(
        expect.objectContaining({
          riskName: "",
          actionOwner: 0,
          riskCategory: [1],
          likelihood: 1,
          riskSeverity: 1,
          applicableProjects: [],
          applicableFrameworks: [],
        }),
      );
    });

    it("alerts with an error and does not open the modal when the fetch fails", async () => {
      mockGetEntityById.mockRejectedValue(new Error("network error"));
      const { result, onAlert } = setup();

      await act(async () => {
        await result.current.handleViewRiskDetails({ id: 3, risk_name: "Risk C" });
      });

      expect(result.current.isRiskDetailModalOpen).toBe(false);
      expect(onAlert).toHaveBeenCalledWith({
        variant: "error",
        body: "Failed to load risk details",
      });
    });

    it("does not open the modal when the response has no data", async () => {
      mockGetEntityById.mockResolvedValue({ data: null });
      const { result } = setup();

      await act(async () => {
        await result.current.handleViewRiskDetails({ id: 4, risk_name: "Risk D" });
      });

      expect(result.current.isRiskDetailModalOpen).toBe(false);
    });
  });

  describe("handleRiskDetailModalClose", () => {
    it("closes the modal and clears the selected risk and form data", async () => {
      mockGetEntityById.mockResolvedValue({ data: { risk_name: "Risk A" } });
      const { result } = setup();

      await act(async () => {
        await result.current.handleViewRiskDetails({ id: 1, risk_name: "Risk A" });
      });
      act(() => {
        result.current.handleRiskDetailModalClose();
      });

      expect(result.current.isRiskDetailModalOpen).toBe(false);
      expect(result.current.selectedRiskForView).toBeNull();
      expect(result.current.riskFormData).toBeUndefined();
    });
  });

  describe("handleUnlinkRisk", () => {
    it("queues the risk id for deletion and alerts", () => {
      const { result, onAlert } = setup();

      act(() => {
        result.current.handleUnlinkRisk(5);
      });

      expect(result.current.deletedRisks).toEqual([5]);
      expect(onAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "info",
          body: expect.stringContaining("marked for removal"),
        }),
      );
    });
  });

  describe("resetPending", () => {
    it("clears selectedRisks and deletedRisks", () => {
      const { result } = setup();

      act(() => {
        result.current.setSelectedRisks([1, 2]);
        result.current.setDeletedRisks([3]);
      });
      act(() => {
        result.current.resetPending();
      });

      expect(result.current.selectedRisks).toEqual([]);
      expect(result.current.deletedRisks).toEqual([]);
    });
  });

  describe("setIsLinkedRisksModalOpen / setCurrentRisks", () => {
    it("toggles the linked-risks popup open state", () => {
      const { result } = setup();

      act(() => {
        result.current.setIsLinkedRisksModalOpen(true);
      });

      expect(result.current.isLinkedRisksModalOpen).toBe(true);
    });

    it("allows the parent to override currentRisks directly", () => {
      const { result } = setup();

      act(() => {
        result.current.setCurrentRisks([9, 10]);
      });

      expect(result.current.currentRisks).toEqual([9, 10]);
    });
  });
});
