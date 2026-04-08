import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useAssessmentAnswers from "../useAssessmentAnswers";

// NOTE:
// The hook imports "../repository/assesment.repository" (relative to the hook file).
// From this test file path, that specifier doesn't exist, so we mock it as a VIRTUAL module.
vi.mock(
  "../../repository/assesment.repository",
  () => ({
    getAssessmentAnswers: vi.fn(),
}));

import { getAssessmentAnswers } from "../../repository/assesment.repository";

type MockFn = ReturnType<typeof vi.fn>;

const makeApiResponse = (topics: any[]) => ({
  data: {
    message: {
      topics,
    },
  },
});

describe("useAssessmentAnswers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when assessmentId is null/undefined (effect guard)", async () => {
    const { result, rerender } = renderHook(
      ({ assessmentId }) => useAssessmentAnswers({ assessmentId }),
      { initialProps: { assessmentId: null as any } }
    );

    // It starts in loading=true, but no fetch is triggered, so it stays true.
    // (This matches current implementation.)
    expect(getAssessmentAnswers).not.toHaveBeenCalled();
    expect(result.current.error).toBe(null);
    expect(result.current.topics).toEqual([]);

    // still no fetch on undefined
    rerender({ assessmentId: undefined as any });
    expect(getAssessmentAnswers).not.toHaveBeenCalled();
  });

  it("maps topics when response has topics > 0 (covers evidence_files provided + missing)", async () => {
    (getAssessmentAnswers as unknown as MockFn).mockResolvedValueOnce(
      makeApiResponse([
        {
          id: 1,
          assessment_id: "A1",
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
                  hint: "H",
                  is_required: true,
                  priority_level: "high priority",
                  // evidence_files missing -> should become []
                  answer: "Ans",
                },
                {
                  id: 101,
                  subtopic_id: "10",
                  question: "Q2",
                  answer_type: "file",
                  evidence_file_required: true,
                  hint: "H2",
                  is_required: false,
                  priority_level: "low priority",
                  evidence_files: [new File(["x"], "evidence.txt", { type: "text/plain" })],
                  answer: "Ans2",
                },
              ],
            },
          ],
        },
      ])
    );

    const { result } = renderHook(() => useAssessmentAnswers({ assessmentId: "A1" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getAssessmentAnswers).toHaveBeenCalledTimes(1);
    expect(getAssessmentAnswers).toHaveBeenCalledWith({ assessmentId: "A1" });

    expect(result.current.error).toBe(null);
    expect(result.current.topics).toHaveLength(1);

    const topic = result.current.topics[0];
    expect(topic).toMatchObject({
      id: 1,
      assessmentId: "A1",
      title: "Topic 1",
    });

    const sub = topic.subtopics[0];
    expect(sub).toMatchObject({
      id: 10,
      topicId: 1,
      name: "Sub 1",
    });

    const [q1, q2] = sub.questions;
    expect(q1).toMatchObject({
      id: 100,
      subtopicId: "10",
      questionText: "Q1",
      answerType: "text",
      evidenceFileRequired: false,
      hint: "H",
      isRequired: true,
      priorityLevel: "high priority",
      answer: "Ans",
    });
    expect(q1.evidenceFiles).toEqual([]); // <-- branch: evidence_files || []

    expect(q2.evidenceFiles).toHaveLength(1); // provided
  });

  it("sets error when topics list is empty", async () => {
    (getAssessmentAnswers as unknown as MockFn).mockResolvedValueOnce(makeApiResponse([]));

    const { result } = renderHook(() => useAssessmentAnswers({ assessmentId: "A2" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.topics).toEqual([]);
    expect(result.current.error).toBe("No assessment answers found for this project.");
  });

  it("handles fetch error when thrown value is an Error (sets error.message)", async () => {
    const err = new Error("Network down");
    (getAssessmentAnswers as unknown as MockFn).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useAssessmentAnswers({ assessmentId: "A3" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Network down");
    expect(consoleSpy).toHaveBeenCalledWith("An error occurred:", err);

    consoleSpy.mockRestore();
  });

  it("handles fetch error when thrown value is not an Error (uses String(error))", async () => {
    const err = { code: 500, msg: "boom" };
    (getAssessmentAnswers as unknown as MockFn).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useAssessmentAnswers({ assessmentId: "A4" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(String(err));
    expect(consoleSpy).toHaveBeenCalledWith("An error occurred:", err);

    consoleSpy.mockRestore();
  });
});
