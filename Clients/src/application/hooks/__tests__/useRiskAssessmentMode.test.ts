import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../repository/quantitativeRisk.repository", () => ({
  getRiskAssessmentMode: vi.fn(),
  updateRiskAssessmentMode: vi.fn(),
}));

import { useRiskAssessmentMode } from "../useRiskAssessmentMode";
import {
  getRiskAssessmentMode,
  updateRiskAssessmentMode,
} from "../../repository/quantitativeRisk.repository";

const mockGetMode = vi.mocked(getRiskAssessmentMode);
const mockUpdateMode = vi.mocked(updateRiskAssessmentMode);

describe("useRiskAssessmentMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches mode on mount and sets state", async () => {
    mockGetMode.mockResolvedValue({ risk_assessment_mode: "quantitative" });

    const { result } = renderHook(() => useRiskAssessmentMode());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mode).toBe("quantitative");
    expect(result.current.isQuantitative).toBe(true);
  });

  it("defaults to qualitative on error", async () => {
    mockGetMode.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useRiskAssessmentMode());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mode).toBe("qualitative");
  });

  it("toggleMode switches from qualitative to quantitative", async () => {
    mockGetMode.mockResolvedValue({ risk_assessment_mode: "qualitative" });
    mockUpdateMode.mockResolvedValue({ risk_assessment_mode: "quantitative" });

    const { result } = renderHook(() => useRiskAssessmentMode());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleMode();
    });

    expect(result.current.mode).toBe("quantitative");
    expect(mockUpdateMode).toHaveBeenCalledWith("quantitative");
  });
});
