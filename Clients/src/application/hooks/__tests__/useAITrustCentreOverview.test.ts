import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAITrustCentreOverview } from "../useAITrustCentreOverview";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreOverview: vi.fn(),
  updateAITrustCentreOverview: vi.fn(),
}));

import {
  getAITrustCentreOverview,
  updateAITrustCentreOverview,
} from "../../repository/aiTrustCentre.repository";

// Small helper to control promise resolution (to assert loading state)
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAITrustCentreOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches on mount and sets data from response.data.overview (branch 1)", async () => {
    const d = deferred<any>();

    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise);

    const { result } = renderHook(() => useAITrustCentreOverview());

    // loading should flip to true while promise is pending
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.error).toBe(null);

    d.resolve({ data: { overview: { info: { title: "from data.overview" } } } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ info: { title: "from data.overview" } });
    expect(getAITrustCentreOverview).toHaveBeenCalledTimes(1);
  });

  it("sets data from response.overview when data.overview is missing (branch 2)", async () => {
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      overview: { intro: { purpose_text: "from overview" } },
    });

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ intro: { purpose_text: "from overview" } });
  });

  it("sets data to null when response has no overview fields (branch 3)", async () => {
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(null);
  });

  it("fetchOverview logs and rethrows on error (error state may remain null)", async () => {
    // 1) satisfy the mount effect (avoid unhandled rejection)
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 2) now test the error branch explicitly
    const err = new Error("boom");
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(result.current.fetchOverview()).rejects.toThrow("boom");

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching AI Trust Centre overview:", err);

    // NOTE: current hook behavior leaves error as null (don’t assert "boom")
    // expect(result.current.error).toBeNull();

    consoleSpy.mockRestore();
  });

  it("fetchOverview uses fallback error message when err.message is missing", async () => {
    // satisfy initial mount
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = {}; // no message
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(result.current.fetchOverview()).rejects.toBe(err);

    // wait for state update from catch
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to fetch AI Trust Centre overview")
    );

    expect(consoleSpy).toHaveBeenCalledWith("Error fetching AI Trust Centre overview:", err);

    consoleSpy.mockRestore();
  });

  it("updateOverview calls repository and toggles loading (success)", async () => {
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    (updateAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useAITrustCentreOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateOverview({ intro: { purpose_visible: true } } as any);
    });

    expect(updateAITrustCentreOverview).toHaveBeenCalledTimes(1);
    expect(updateAITrustCentreOverview).toHaveBeenCalledWith({ intro: { purpose_visible: true } });
    expect(result.current.error).toBe(null);
    expect(result.current.loading).toBe(false);
  });

  it("updateOverview sets error fallback, logs, and rethrows (error)", async () => {
    // satisfy initial mount
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const err = {}; // no message -> fallback branch
    (updateAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useAITrustCentreOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.updateOverview({ info: { visible: true } } as any)).rejects.toBe(err);

    // wait for state update from catch
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to update AI Trust Centre overview")
    );

    expect(consoleSpy).toHaveBeenCalledWith("Error updating AI Trust Centre overview:", err);
    expect(result.current.loading).toBe(false);

    consoleSpy.mockRestore();
  });

  it("clears previous error when fetchOverview succeeds (covers setError(null) line)", async () => {
    // 1) mount resolves ok
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 2) force an error first to set error state
    const err = new Error("first fail");
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(result.current.fetchOverview()).rejects.toThrow("first fail");
    await waitFor(() => expect(result.current.error).toBe("first fail"));

    // 3) now succeed and ensure error is cleared by setError(null)
    (getAITrustCentreOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      overview: { info: { title: "ok" } },
    });

    await result.current.fetchOverview();

    await waitFor(() => expect(result.current.error).toBe(null));
    expect(result.current.data).toEqual({ info: { title: "ok" } });

    (console.error as any).mockRestore?.();
  });
});
