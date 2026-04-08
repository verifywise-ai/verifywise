import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useAssessmentSubtopics from "../useAssessmentSubtopics";

vi.mock("../../repository/assesment.repository", () => ({
  getAssessmentTopicById: vi.fn(),
}));

import { getAssessmentTopicById } from "../../repository/assesment.repository";

type MockFn = ReturnType<typeof vi.fn>;

describe("useAssessmentSubtopics", () => {
  const originalAbortController = globalThis.AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.AbortController = originalAbortController;
  });

  it("does not fetch when activeAssessmentTopicId is undefined (early return)", async () => {
    renderHook(() =>
      useAssessmentSubtopics({
        activeAssessmentTopicId: undefined,
        projectFrameworkId: 1,
        refreshKey: false,
      })
    );

    // allow effect to run
    await Promise.resolve();

    expect(getAssessmentTopicById).not.toHaveBeenCalled();
  });

  it("does not fetch when AbortController signal is already aborted (covers signal.aborted return)", async () => {
    class AbortedController {
      signal = { aborted: true } as AbortSignal;
      abort() {}
    }
    globalThis.AbortController = AbortedController as any;

    renderHook(() =>
      useAssessmentSubtopics({
        activeAssessmentTopicId: 123,
        projectFrameworkId: 1,
        refreshKey: false,
      })
    );

    await Promise.resolve();

    expect(getAssessmentTopicById).not.toHaveBeenCalled();
  });

  it("sets subtopics from response.data.subTopics and sets loading false (success)", async () => {
    (getAssessmentTopicById as unknown as MockFn).mockResolvedValueOnce({
      data: { subTopics: [{ id: 1, name: "S1" }] },
    });

    const { result } = renderHook(() =>
      useAssessmentSubtopics({
        activeAssessmentTopicId: 10,
        projectFrameworkId: 77,
        refreshKey: false,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAssessmentTopicById).toHaveBeenCalledTimes(1);
    expect(getAssessmentTopicById).toHaveBeenCalledWith({
      topicId: 10,
      projectFrameworkId: 77,
      signal: expect.any(Object),
    });

    expect(result.current.assessmentSubtopics).toEqual([{ id: 1, name: "S1" }]);
  });

  it("sets [] when response has no data", async () => {
    (getAssessmentTopicById as unknown as MockFn).mockResolvedValueOnce({});

    const { result } = renderHook(() =>
      useAssessmentSubtopics({
        activeAssessmentTopicId: 11,
        projectFrameworkId: 1,
        refreshKey: false,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentSubtopics).toEqual([]);
  });

  it("ignores canceled error (no console.error) and finishes loading", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (getAssessmentTopicById as unknown as MockFn).mockRejectedValueOnce({
      message: "canceled",
    });

    const { result } = renderHook(() =>
      useAssessmentSubtopics({
        activeAssessmentTopicId: 12,
        projectFrameworkId: 1,
        refreshKey: false,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(result.current.assessmentSubtopics).toEqual([]); // stays empty

    consoleSpy.mockRestore();
  });

  it("ignores AbortError (no console.error) and finishes loading", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (getAssessmentTopicById as unknown as MockFn).mockRejectedValueOnce({
      name: "AbortError",
    });

    const { result } = renderHook(() =>
      useAssessmentSubtopics({
        activeAssessmentTopicId: 13,
        projectFrameworkId: 1,
        refreshKey: false,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(result.current.assessmentSubtopics).toEqual([]);

    consoleSpy.mockRestore();
  });

  it("logs and sets [] on non-abort error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (getAssessmentTopicById as unknown as MockFn).mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() =>
      useAssessmentSubtopics({
        activeAssessmentTopicId: 14,
        projectFrameworkId: 1,
        refreshKey: false,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith("Failed to fetch subtopics data:", expect.any(Error));
    expect(result.current.assessmentSubtopics).toEqual([]);

    consoleSpy.mockRestore();
  });

  it("refetches when refreshKey changes (dependency branch)", async () => {
    (getAssessmentTopicById as unknown as MockFn).mockResolvedValue({
      data: { subTopics: [{ id: 2, name: "S2" }] },
    });

    const { rerender } = renderHook(
      ({ refreshKey }) =>
        useAssessmentSubtopics({
          activeAssessmentTopicId: 99,
          projectFrameworkId: 1,
          refreshKey,
        }),
      { initialProps: { refreshKey: false } }
    );

    await waitFor(() => expect(getAssessmentTopicById).toHaveBeenCalledTimes(1));

    rerender({ refreshKey: true });

    await waitFor(() => expect(getAssessmentTopicById).toHaveBeenCalledTimes(2));
  });
});
