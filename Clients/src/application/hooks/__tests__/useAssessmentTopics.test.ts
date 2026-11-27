import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/assesment.repository", () => ({
  getAllAssessmentTopics: vi.fn(),
  getAssessmentsByProjectFrameworkId: vi.fn(),
}));

import useAssessmentTopics from "../useAssessmentTopcis";
import {
  getAllAssessmentTopics,
  getAssessmentsByProjectFrameworkId,
} from "../../repository/assesment.repository";

const mockGetAll = vi.mocked(getAllAssessmentTopics);
const mockGetTree = vi.mocked(getAssessmentsByProjectFrameworkId);

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

  it("does not update state when signal is aborted before resolution", async () => {
    mockGetAll.mockImplementation(
      (args_0?: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          args_0?.signal?.addEventListener("abort", () => {
            resolve([]);
          });
        }),
    );

    const { result, unmount } = renderHook(() => useAssessmentTopics());

    unmount();

    expect(result.current.assessmentTopics).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it("sets empty array when response is null", async () => {
    mockGetAll.mockResolvedValue(null);

    const { result } = renderHook(() => useAssessmentTopics());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentTopics).toEqual([]);
  });

  it("sets empty array when response is undefined", async () => {
    mockGetAll.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssessmentTopics());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentTopics).toEqual([]);
  });

  it("lists the topics of a project framework's own assessment", async () => {
    mockGetTree.mockResolvedValue({
      message: "OK",
      data: [
        { id: 6, title: "Transparency & user information", subTopics: [{ questions: [{}] }] },
        { id: 9, title: "Conformity assessment", subTopics: [{ questions: [{}, {}, {}] }] },
      ],
    });

    const { result } = renderHook(() => useAssessmentTopics({ projectFrameworkId: 42 }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetTree).toHaveBeenCalledWith(expect.objectContaining({ projectFrameworkId: 42 }));
    expect(mockGetAll).not.toHaveBeenCalled();
    expect(result.current.assessmentTopics.map((topic) => topic.id)).toEqual([6, 9]);
  });
});
