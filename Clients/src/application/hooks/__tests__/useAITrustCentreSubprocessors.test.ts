import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAITrustCentreSubprocessors } from "../useAITrustCentreSubprocessors";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreSubprocessors: vi.fn(),
  createAITrustCentreSubprocessor: vi.fn(),
  deleteAITrustCentreSubprocessor: vi.fn(),
  updateAITrustCentreSubprocessor: vi.fn(),
}));

import {
  getAITrustCentreSubprocessors,
  createAITrustCentreSubprocessor,
  deleteAITrustCentreSubprocessor,
  updateAITrustCentreSubprocessor,
} from "../../repository/aiTrustCentre.repository";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAITrustCentreSubprocessors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches on mount and uses response.data.data.subprocessors (nested)", async () => {
    const d = deferred<any>();
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise);

    const { result } = renderHook(() => useAITrustCentreSubprocessors());

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.error).toBe(null);

    d.resolve({
      data: {
        data: {
          subprocessors: [
            { id: 1, name: "A", purpose: "P", location: "L", url: "U", updated_at: "t" },
          ],
        },
      },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subprocessors).toEqual([
      { id: 1, name: "A", purpose: "P", location: "L", url: "U", updated_at: "t" },
    ]);
  });

  it("fetchSubprocessors uses response.data.subprocessors", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { subprocessors: [{ id: 2, name: "B", purpose: "P2", location: "L2", url: "U2" }] },
    });

    await act(async () => {
      await result.current.fetchSubprocessors();
    });

    expect(result.current.subprocessors).toEqual([
      { id: 2, name: "B", purpose: "P2", location: "L2", url: "U2" },
    ]);
  });

  it("fetchSubprocessors uses response.subprocessors", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      subprocessors: [{ id: 3, name: "C", purpose: "P3", location: "L3", url: "U3" }],
    });

    await act(async () => {
      await result.current.fetchSubprocessors();
    });

    expect(result.current.subprocessors).toEqual([
      { id: 3, name: "C", purpose: "P3", location: "L3", url: "U3" },
    ]);
  });

  it("fetchSubprocessors falls back to [] when no data exists", async () => {
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      subprocessors: [{ id: 9, name: "X", purpose: "PX", location: "LX", url: "UX" }],
    });

    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subprocessors.length).toBe(1);

    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    await act(async () => {
      await result.current.fetchSubprocessors();
    });

    expect(result.current.subprocessors).toEqual([]);
  });

  it("fetchSubprocessors error uses err.response.data.message (branch 1) and rethrows", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = { response: { data: { message: "API message" } } };
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.fetchSubprocessors();
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() => expect(result.current.error).toBe("API message"));
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching AI Trust Centre subprocessors:", err);

    consoleSpy.mockRestore();
  });

  it("createSubprocessor success calls repo and refreshes list", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ subprocessors: [] });
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (createAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    // refresh fetch after create
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      subprocessors: [{ id: 10, name: "New", purpose: "P", location: "L", url: "U" }],
    });

    await act(async () => {
      await result.current.createSubprocessor("New", "P", "L", "U");
    });

    expect(createAITrustCentreSubprocessor).toHaveBeenCalledWith("New", "P", "L", "U");
    expect(result.current.subprocessors).toEqual([{ id: 10, name: "New", purpose: "P", location: "L", url: "U" }]);
  });

  it("createSubprocessor error uses err.message (branch 2) and rethrows", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = new Error("create failed");
    (createAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.createSubprocessor("N", "P", "L", "U");
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() => expect(result.current.error).toBe("create failed"));
    expect(consoleSpy).toHaveBeenCalledWith("Error creating AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });

  it("deleteSubprocessor error uses fallback message (branch 3) and rethrows", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = {}; // no response message, no err.message -> fallback
    (deleteAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.deleteSubprocessor(123);
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to delete AI Trust Centre subprocessor")
    );
    expect(consoleSpy).toHaveBeenCalledWith("Error deleting AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });

  it("updateSubprocessor success calls repo and refreshes list", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ subprocessors: [] });
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (updateAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    // refresh after update
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      subprocessors: [{ id: 50, name: "Upd", purpose: "P", location: "L", url: "U" }],
    });

    await act(async () => {
      await result.current.updateSubprocessor(50, "Upd", "P", "L", "U");
    });

    expect(updateAITrustCentreSubprocessor).toHaveBeenCalledWith(50, "Upd", "P", "L", "U");
    expect(result.current.subprocessors).toEqual([{ id: 50, name: "Upd", purpose: "P", location: "L", url: "U" }]);
  });

  it("fetchSubprocessors uses fallback error message when err has no message fields (covers line 64)", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = {}; // no response.data.message, no err.message -> fallback line 64
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.fetchSubprocessors();
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to fetch AI Trust Centre subprocessors")
    );
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching AI Trust Centre subprocessors:", err);

    consoleSpy.mockRestore();
  });

  it("createSubprocessor uses fallback error message when err has no message fields (covers line 86)", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = {}; // no response.data.message, no err.message -> fallback line 86
    (createAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.createSubprocessor("N", "P", "L", "U");
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to create AI Trust Centre subprocessor")
    );
    expect(consoleSpy).toHaveBeenCalledWith("Error creating AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });

  it("deleteSubprocessor success refreshes list (covers lines 104-105)", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      subprocessors: [],
    });
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (deleteAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    // fetchSubprocessors called after delete (lines 104-105)
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      subprocessors: [{ id: 999, name: "AfterDelete", purpose: "P", location: "L", url: "U" }],
    });

    await act(async () => {
      await result.current.deleteSubprocessor(123);
    });

    expect(deleteAITrustCentreSubprocessor).toHaveBeenCalledWith(123);
    expect(result.current.subprocessors).toEqual([
      { id: 999, name: "AfterDelete", purpose: "P", location: "L", url: "U" },
    ]);
  });

  it("updateSubprocessor catch uses err.message when response message is missing (covers line 146)", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = new Error("Update failed (err.message)");
    (updateAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.updateSubprocessor(7, "N", "P", "L", "U");
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() => expect(result.current.error).toBe("Update failed (err.message)"));
    expect(consoleSpy).toHaveBeenCalledWith("Error updating AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });

  it("updateSubprocessor hits catch block and sets error message (covers lines 143-149)", async () => {
    // mount ok
    (getAITrustCentreSubprocessors as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreSubprocessors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = { response: { data: { message: "Update failed (API)" } } };
    (updateAITrustCentreSubprocessor as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.updateSubprocessor(7, "N", "P", "L", "U");
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() => expect(result.current.error).toBe("Update failed (API)"));
    expect(consoleSpy).toHaveBeenCalledWith("Error updating AI Trust Centre subprocessor:", err);

    consoleSpy.mockRestore();
  });
});
