import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/assesment.repository", () => ({
  getAssessmentById: vi.fn(),
}));

import useAssessmentData from "../useAssessmentData";
import { getAssessmentById } from "../../repository/assesment.repository";

const mockGetById = vi.mocked(getAssessmentById);

describe("useAssessmentData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches assessment data", async () => {
    mockGetById.mockResolvedValue({ ok: true, data: [{ id: 1, name: "Framework A" }] });

    const { result } = renderHook(() => useAssessmentData({ selectedProjectId: "1" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentData).toEqual({ id: 1, name: "Framework A" });
  });

  it("does not fetch when selectedProjectId is empty", async () => {
    const { result: _result } = renderHook(() => useAssessmentData({ selectedProjectId: "" }));

    // Should not call the API
    expect(mockGetById).not.toHaveBeenCalled();
  });
});
