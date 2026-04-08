import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useAssessmentTopics from "../useAssessmentTopcis";

// The hook imports: "../repository/assesment.repository"
// From tests folder, that becomes: "../../repository/assesment.repository"
vi.mock("../../repository/assesment.repository", () => ({
  getAllAssessmentTopics: vi.fn(),
}));

import { getAllAssessmentTopics } from "../../repository/assesment.repository";

type MockFn = ReturnType<typeof vi.fn>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAssessmentTopcis / useAssessmentTopics", () => {
  const originalAbortController = globalThis.AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.AbortController = originalAbortController;
  });

  it("early returns when signal is already aborted (does not call repository)", async () => {
    class AbortedController {
      signal = { aborted: true } as AbortSignal;
      abort() {}
    }
    globalThis.AbortController = AbortedController as any;

    const { result } = renderHook(() => useAssessmentTopics());

    // effect runs but fetchAssessmentTopics returns immediately
    await Promise.resolve();

    expect(getAllAssessmentTopics).not.toHaveBeenCalled();
    // loading starts true and stays true due to early return
    expect(result.current.loading).toBe(true);
    expect(result.current.assessmentTopics).toEqual([]);
  });

  it("sets assessmentTopics when repository returns a truthy response and finishes loading", async () => {
    const topics = [{ id: 1, title: "T1" }] as any[];
    (getAllAssessmentTopics as unknown as MockFn).mockResolvedValueOnce(topics);

    const { result } = renderHook(() => useAssessmentTopics());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAllAssessmentTopics).toHaveBeenCalledTimes(1);
    expect(result.current.assessmentTopics).toEqual(topics);
  });

  it("sets assessmentTopics to [] when repository returns falsy response", async () => {
    (getAllAssessmentTopics as unknown as MockFn).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAssessmentTopics());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assessmentTopics).toEqual([]);
  });

  it("on error: logs, sets assessmentTopics to [], and finishes loading (covers catch + finally)", async () => {
    const d = deferred<any>();
    (getAllAssessmentTopics as unknown as MockFn).mockReturnValueOnce(d.promise);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useAssessmentTopics());

    // while pending it should still be loading
    await waitFor(() => expect(result.current.loading).toBe(true));

    const err = new Error("boom");
    d.reject(err);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(consoleSpy).toHaveBeenCalledWith("Failed to fetch topics data:", err);
    expect(result.current.assessmentTopics).toEqual([]);

    consoleSpy.mockRestore();
  });
});
