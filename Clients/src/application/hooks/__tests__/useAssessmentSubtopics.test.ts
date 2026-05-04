import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/assesment.repository", () => ({
  getAssessmentTopicById: vi.fn(),
}));

import useAssessmentSubtopics from "../useAssessmentSubtopics";
import { getAssessmentTopicById } from "../../repository/assesment.repository";

const mockGetTopic = vi.mocked(getAssessmentTopicById);

describe("useAssessmentSubtopics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches subtopics for a topic", async () => {
    mockGetTopic.mockResolvedValue({
      data: {
        subTopics: [
          { id: 1, name: "Subtopic A" },
          { id: 2, name: "Subtopic B" },
        ],
      },
    });

    const { result } = renderHook(() => useAssessmentSubtopics({ activeAssessmentTopicId: 5 }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentSubtopics).toHaveLength(2);
  });

  it("does not fetch when topicId is undefined", () => {
    renderHook(() => useAssessmentSubtopics({ activeAssessmentTopicId: undefined }));
    expect(mockGetTopic).not.toHaveBeenCalled();
  });

  it("sets empty array on error", async () => {
    mockGetTopic.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useAssessmentSubtopics({ activeAssessmentTopicId: 1 }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentSubtopics).toEqual([]);
  });
});
