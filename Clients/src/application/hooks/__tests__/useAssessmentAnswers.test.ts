import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/assesment.repository", () => ({
  getAssessmentAnswers: vi.fn(),
}));

import useAssessmentAnswers from "../useAssessmentAnswers";
import { getAssessmentAnswers } from "../../repository/assesment.repository";

const mockGetAnswers = vi.mocked(getAssessmentAnswers);

describe("useAssessmentAnswers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and transforms assessment answers", async () => {
    mockGetAnswers.mockResolvedValue({
      data: {
        message: {
          topics: [
            {
              id: 1,
              assessment_id: "a1",
              title: "Topic 1",
              subTopics: [
                {
                  id: 10,
                  topic_id: 1,
                  name: "Sub 1",
                  questions: [
                    {
                      id: 100,
                      subtopic_id: "10",
                      question: "Q1",
                      answer_type: "text",
                      evidence_file_required: false,
                      hint: "",
                      is_required: true,
                      priority_level: "high priority",
                      answer: "Yes",
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => useAssessmentAnswers({ assessmentId: "a1" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.topics).toHaveLength(1);
    expect(result.current.topics[0].subtopics[0].questions[0].questionText).toBe("Q1");
  });

  it("does not fetch when assessmentId is null", () => {
    renderHook(() => useAssessmentAnswers({ assessmentId: null }));
    expect(mockGetAnswers).not.toHaveBeenCalled();
  });

  it("sets error when no topics found", async () => {
    mockGetAnswers.mockResolvedValue({ data: { message: { topics: [] } } });

    const { result } = renderHook(() => useAssessmentAnswers({ assessmentId: "a1" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toContain("No assessment answers found");
  });
});
