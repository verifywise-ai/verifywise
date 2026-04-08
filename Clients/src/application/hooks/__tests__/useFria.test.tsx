import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFria } from "../useFria";
import * as friaRepository from "../../repository/fria.repository";

vi.mock("../../repository/fria.repository", () => ({
  friaRepository: {
    getFria: vi.fn(),
    updateFria: vi.fn(),
    updateRights: vi.fn(),
    addRiskItem: vi.fn(),
    updateRiskItem: vi.fn(),
    deleteRiskItem: vi.fn(),
    linkModel: vi.fn(),
    unlinkModel: vi.fn(),
    submitFria: vi.fn(),
  },
}));

const mockGetFria = friaRepository.friaRepository.getFria as unknown as ReturnType<typeof vi.fn>;
const mockUpdateFria = friaRepository.friaRepository.updateFria as unknown as ReturnType<typeof vi.fn>;
const mockUpdateRights = friaRepository.friaRepository.updateRights as unknown as ReturnType<typeof vi.fn>;
const mockAddRiskItem = friaRepository.friaRepository.addRiskItem as unknown as ReturnType<typeof vi.fn>;
const mockUpdateRiskItem = friaRepository.friaRepository.updateRiskItem as unknown as ReturnType<typeof vi.fn>;
const mockDeleteRiskItem = friaRepository.friaRepository.deleteRiskItem as unknown as ReturnType<typeof vi.fn>;
const mockLinkModel = friaRepository.friaRepository.linkModel as unknown as ReturnType<typeof vi.fn>;
const mockUnlinkModel = friaRepository.friaRepository.unlinkModel as unknown as ReturnType<typeof vi.fn>;
const mockSubmitFria = friaRepository.friaRepository.submitFria as unknown as ReturnType<typeof vi.fn>;

const mockFriaData = {
  assessment: {
    id: 1,
    project_id: 1,
    version: 1,
    status: "draft",
    completion_pct: 50,
    risk_score: 0,
    risk_level: "low",
    rights_flagged: 0,
  },
  rights: [
    { id: 1, right_key: "privacy", right_title: "Privacy", charter_ref: "A1", flagged: false, severity: 1, confidence: 0.8, impact_pathway: null, mitigation: null },
  ],
  riskItems: [
    { id: 1, fria_id: 1, risk_description: "Test risk", likelihood: "medium", severity: "high", existing_controls: null, further_action: null, linked_project_risk_id: null, linked_risk_name: null, sort_order: 0 },
  ],
  modelLinks: [],
};

describe("useFria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should return initial state when projectId is empty", async () => {
      const { result } = renderHook(() => useFria(""));

      expect(result.current.assessment).toBeNull();
      expect(result.current.rights).toEqual([]);
      expect(result.current.riskItems).toEqual([]);
      expect(result.current.modelLinks).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("should fetch fria data when projectId is provided", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.assessment).toEqual(mockFriaData.assessment);
      expect(result.current.rights).toEqual(mockFriaData.rights);
      expect(result.current.riskItems).toEqual(mockFriaData.riskItems);
    });

    it("should handle fetch error", async () => {
      mockGetFria.mockRejectedValue(new Error("Failed to load"));

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load");
      expect(result.current.assessment).toBeNull();
    });
  });

  describe("updateRights", () => {
    it("should update rights successfully", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockUpdateRights.mockResolvedValue([mockFriaData.rights[0]]);
      mockGetFria.mockResolvedValueOnce(mockFriaData).mockResolvedValueOnce({
        ...mockFriaData,
        assessment: { ...mockFriaData.assessment, risk_score: 5 },
      });

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateRights([{ id: 1, flagged: true }]);
      });

      expect(result.current.lastSaveStatus).toBe("saved");
      expect(mockUpdateRights).toHaveBeenCalledWith(1, [{ id: 1, flagged: true }]);
    });

    it("should handle update rights error", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockUpdateRights.mockRejectedValue(new Error("Failed to update rights"));

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateRights([{ id: 1 }]);
      });

      expect(result.current.lastSaveStatus).toBe("error");
    });

    it("should not update if no assessment", async () => {
      const { result } = renderHook(() => useFria("project-1"));

      await act(async () => {
        await result.current.updateRights([]);
      });

      expect(mockUpdateRights).not.toHaveBeenCalled();
    });
  });

  describe("risk items", () => {
    it("should add risk item", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      const newItem = { ...mockFriaData.riskItems[0], id: 2 };
      mockAddRiskItem.mockResolvedValue(newItem);
      mockGetFria.mockResolvedValueOnce(mockFriaData).mockResolvedValueOnce({
        ...mockFriaData,
        assessment: { ...mockFriaData.assessment, risk_score: 10 },
      });

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addRiskItem({ risk_description: "New risk" });
      });

      expect(result.current.riskItems).toHaveLength(2);
      expect(mockAddRiskItem).toHaveBeenCalledWith(1, { risk_description: "New risk" });
    });

    it("should update risk item", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      const updatedItem = { ...mockFriaData.riskItems[0], likelihood: "low" };
      mockUpdateRiskItem.mockResolvedValue(updatedItem);
      mockGetFria.mockResolvedValueOnce(mockFriaData).mockResolvedValueOnce(mockFriaData);

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateRiskItem(1, { likelihood: "low" });
      });

      expect(mockUpdateRiskItem).toHaveBeenCalledWith(1, 1, { likelihood: "low" });
    });

    it("should delete risk item", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockDeleteRiskItem.mockResolvedValue(undefined);
      mockGetFria.mockResolvedValueOnce(mockFriaData).mockResolvedValueOnce({
        ...mockFriaData,
        riskItems: [],
      });

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteRiskItem(1);
      });

      expect(result.current.riskItems).toHaveLength(0);
      expect(mockDeleteRiskItem).toHaveBeenCalledWith(1, 1);
    });
  });

  describe("model linking", () => {
    it("should link model", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockLinkModel.mockResolvedValue(undefined);
      mockGetFria.mockResolvedValue(mockFriaData);

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.linkModel(123);
      });

      expect(mockLinkModel).toHaveBeenCalledWith(1, 123);
    });

    it("should unlink model", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockUnlinkModel.mockResolvedValue(undefined);
      mockGetFria.mockResolvedValue(mockFriaData);

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.unlinkModel(123);
      });

      expect(mockUnlinkModel).toHaveBeenCalledWith(1, 123);
    });
  });

  describe("submitFria", () => {
    it("should submit fria", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockSubmitFria.mockResolvedValue(undefined);
      mockGetFria.mockResolvedValue(mockFriaData);

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.submitFria("Test reason");
      });

      expect(mockSubmitFria).toHaveBeenCalledWith(1, "Test reason");
    });

    it("should handle submit error", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockSubmitFria.mockRejectedValue(new Error("Submit failed"));

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.submitFria();
      });

      expect(result.current.error).toBe("Submit failed");
    });

    it("should set isSaving during submission", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockSubmitFria.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.submitFria();
      });

      await waitFor(() => {
        expect(result.current.isSaving).toBe(true);
      });
    });
  });

  describe("unlinkModel error handling", () => {
    it("should handle unlinkModel error", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockUnlinkModel.mockRejectedValue(new Error("Failed to unlink model"));

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.unlinkModel(123);
      });

      expect(result.current.error).toBe("Failed to unlink model");
    });
  });

  describe("updateAssessment", () => {
    it("should call updateFria with debounced data", async () => {
      mockGetFria.mockResolvedValue(mockFriaData);
      mockUpdateFria.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useFria("project-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateAssessment({ operational_context: "Test context" });
      });

      expect(mockUpdateFria).not.toHaveBeenCalled();
    });
  });

});
