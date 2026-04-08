import { renderHook, waitFor, act } from "@testing-library/react";
import { useRiskAssessmentMode } from "../useRiskAssessmentMode";
import * as quantitativeRiskRepository from "../../repository/quantitativeRisk.repository";

const mockGetRiskAssessmentMode = quantitativeRiskRepository.getRiskAssessmentMode as jest.Mock;
const mockUpdateRiskAssessmentMode = quantitativeRiskRepository.updateRiskAssessmentMode as jest.Mock;

vi.mock("../../repository/quantitativeRisk.repository", () => ({
  getRiskAssessmentMode: vi.fn(),
  updateRiskAssessmentMode: vi.fn(),
}));

describe("useRiskAssessmentMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with default mode as qualitative", async () => {
      mockGetRiskAssessmentMode.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useRiskAssessmentMode());

      expect(result.current.mode).toBe("qualitative");
      expect(result.current.isQuantitative).toBe(false);
    });

    it("should start with loading true", async () => {
      mockGetRiskAssessmentMode.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useRiskAssessmentMode());

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("successful fetch", () => {
    it("should set mode to quantitative when server returns quantitative", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "quantitative",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe("quantitative");
      expect(result.current.isQuantitative).toBe(true);
    });

    it("should set mode to qualitative when server returns qualitative", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "qualitative",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe("qualitative");
      expect(result.current.isQuantitative).toBe(false);
    });

    it("should set mode even when server returns invalid mode (TypeScript casting)", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "invalid",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe("invalid");
    });
  });

  describe("toggleMode", () => {
    it("should toggle from qualitative to quantitative", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "qualitative",
      });
      mockUpdateRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "quantitative",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe("qualitative");

      await act(async () => {
        await result.current.toggleMode();
      });

      expect(mockUpdateRiskAssessmentMode).toHaveBeenCalledWith("quantitative");
      expect(result.current.mode).toBe("quantitative");
    });

    it("should toggle from quantitative to qualitative", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "quantitative",
      });
      mockUpdateRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "qualitative",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleMode();
      });

      expect(mockUpdateRiskAssessmentMode).toHaveBeenCalledWith("qualitative");
      expect(result.current.mode).toBe("qualitative");
    });

    it("should throw error when update fails", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "qualitative",
      });
      mockUpdateRiskAssessmentMode.mockRejectedValue(new Error("Update failed"));

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(result.current.toggleMode()).rejects.toThrow("Update failed");
    });
  });

  describe("setMode", () => {
    it("should set mode directly to quantitative", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "qualitative",
      });
      mockUpdateRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "quantitative",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.setMode("quantitative");
      });

      expect(mockUpdateRiskAssessmentMode).toHaveBeenCalledWith("quantitative");
      expect(result.current.mode).toBe("quantitative");
    });

    it("should set mode directly to qualitative", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "quantitative",
      });
      mockUpdateRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "qualitative",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.setMode("qualitative");
      });

      expect(mockUpdateRiskAssessmentMode).toHaveBeenCalledWith("qualitative");
      expect(result.current.mode).toBe("qualitative");
    });
  });

  describe("refetch", () => {
    it("should provide refetch function", async () => {
      mockGetRiskAssessmentMode.mockResolvedValue({
        risk_assessment_mode: "qualitative",
      });

      const { result } = renderHook(() => useRiskAssessmentMode());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe("function");
    });
  });
});
