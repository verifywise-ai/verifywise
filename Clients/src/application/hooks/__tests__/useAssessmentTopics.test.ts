import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/assesment.repository", () => ({
  getAllAssessmentTopics: vi.fn(),
}));

import useAssessmentTopics from "../useAssessmentTopcis";
import { getAllAssessmentTopics } from "../../repository/assesment.repository";

const mockGetAll = vi.mocked(getAllAssessmentTopics);

describe("useAssessmentTopics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all assessment topics", async () => {
    mockGetAll.mockResolvedValue([
      { id: 1, title: "Topic A" },
      { id: 2, title: "Topic B" },
    ]);

    const { result } = renderHook(() => useAssessmentTopics());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentTopics).toHaveLength(2);
  });

  it("sets empty array on error", async () => {
    mockGetAll.mockRejectedValue(new Error("API error"));

    const { result } = renderHook(() => useAssessmentTopics());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentTopics).toEqual([]);
  });
});
