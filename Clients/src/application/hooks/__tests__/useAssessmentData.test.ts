import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useAssessmentData from "../useAssessmentData";

vi.mock("../../repository/assesment.repository", () => ({
  getAssessmentById: vi.fn(),
}));

import { getAssessmentById } from "../../repository/assesment.repository";

type MockFn = ReturnType<typeof vi.fn>;

describe("useAssessmentData", () => {
  const originalAbortController = globalThis.AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // restore AbortController if a test replaced it
    globalThis.AbortController = originalAbortController;
  });

  it("does not fetch when selectedProjectId is empty (early return)", async () => {
    const { result } = renderHook(() =>
      useAssessmentData({ selectedProjectId: "" as any })
    );

    // effect runs, but fetchAssessmentData returns early
    await Promise.resolve();

    expect(getAssessmentById).not.toHaveBeenCalled();
    expect(result.current.assessmentData).toBe(null);

    // current implementation: loading starts true and stays true if it returns early
    expect(result.current.loading).toBe(true);
  });

  it("does not fetch when AbortController signal is already aborted (covers signal.aborted branch)", async () => {
    class AbortedController {
      signal = { aborted: true } as AbortSignal;
      abort() {}
    }

    // Force the hook to use an already-aborted signal
    globalThis.AbortController = AbortedController as any;

    const { result } = renderHook(() =>
      useAssessmentData({ selectedProjectId: "p1" })
    );

    await Promise.resolve();

    expect(getAssessmentById).not.toHaveBeenCalled();
    expect(result.current.assessmentData).toBe(null);

    // It returns before setLoading(false) in finally, so it stays true
    expect(result.current.loading).toBe(true);
  });

  it("sets assessmentData from response.data[0] and sets loading false (success)", async () => {
    (getAssessmentById as unknown as MockFn).mockResolvedValueOnce({
      ok: true,
      data: [{ id: "f1" }],
    });

    const { result } = renderHook(() =>
      useAssessmentData({ selectedProjectId: "p1" })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAssessmentById).toHaveBeenCalledTimes(1);
    expect(result.current.assessmentData).toEqual({ id: "f1" });
  });

  it("logs when response.ok is false (covers !response.ok branch) and still sets data if present", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (getAssessmentById as unknown as MockFn).mockResolvedValueOnce({
      ok: false,
      message: "Bad request",
      data: [{ id: "f2" }],
    });

    const { result } = renderHook(() =>
      useAssessmentData({ selectedProjectId: "p2" })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to fetch progress data: Bad request"
    );
    expect(result.current.assessmentData).toEqual({ id: "f2" });

    consoleSpy.mockRestore();
  });

  it("does not set assessmentData when response.data is missing, but sets loading false", async () => {
    (getAssessmentById as unknown as MockFn).mockResolvedValueOnce({
      ok: true,
      data: undefined,
    });

    const { result } = renderHook(() =>
      useAssessmentData({ selectedProjectId: "p3" })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assessmentData).toBe(null);
  });

  it("logs and sets loading false when request throws (covers catch + finally)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = new Error("network");
    (getAssessmentById as unknown as MockFn).mockRejectedValueOnce(err);

    const { result } = renderHook(() =>
      useAssessmentData({ selectedProjectId: "p4" })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to fetch assessment data:",
      err
    );

    consoleSpy.mockRestore();
  });
});
