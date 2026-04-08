import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAITrustCentreResources } from "../useAITrustCentreResources";

vi.mock("../../repository/aiTrustCentre.repository", () => ({
  getAITrustCentreResources: vi.fn(),
  createAITrustCentreResource: vi.fn(),
  deleteAITrustCentreResource: vi.fn(),
  updateAITrustCentreResource: vi.fn(),
}));

import {
  getAITrustCentreResources,
  createAITrustCentreResource,
  deleteAITrustCentreResource,
  updateAITrustCentreResource,
} from "../../repository/aiTrustCentre.repository";

// Helper to control promise resolution (assert loading / finally)
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAITrustCentreResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches on mount and reads response.data.data.resources (nested)", async () => {
    const d = deferred<any>();

    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise);

    const { result } = renderHook(() => useAITrustCentreResources());

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.error).toBe(null);

    d.resolve({
      data: { data: { resources: [{ id: 1, name: "A", description: "d", visible: true, file_id: 1, updated_at: "x" }] } },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resources).toEqual([
      { id: 1, name: "A", description: "d", visible: true, file_id: 1, updated_at: "x" },
    ]);
  });

  it("fetchResources reads response.data.resources", async () => {
    // mount
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // manual call
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { resources: [{ id: 2, name: "B", description: "d", visible: false, file_id: 2, updated_at: "y" }] },
    });

    await act(async () => {
      await result.current.fetchResources();
    });

    expect(result.current.resources).toEqual([
      { id: 2, name: "B", description: "d", visible: false, file_id: 2, updated_at: "y" },
    ]);
  });

  it("fetchResources reads response.resources", async () => {
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      resources: [{ id: 3, name: "C", description: "d", visible: true, file_id: 3, updated_at: "z" }],
    });

    await act(async () => {
      await result.current.fetchResources();
    });

    expect(result.current.resources).toEqual([
      { id: 3, name: "C", description: "d", visible: true, file_id: 3, updated_at: "z" },
    ]);
  });

  it("fetchResources falls back to [] when no resources exist", async () => {
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: { resources: [{ id: 9, name: "X", description: "d", visible: true, file_id: 9, updated_at: "t" }] } },
    });

    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resources.length).toBe(1);

    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    await act(async () => {
      await result.current.fetchResources();
    });

    expect(result.current.resources).toEqual([]);
  });

  it("fetchResources sets errorMessage from err.response.data.message and rethrows", async () => {
    // mount ok
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = { response: { data: { message: "API message" } } };
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.fetchResources();
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() => expect(result.current.error).toBe("API message"));
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching AI Trust Centre resources:", err);

    consoleSpy.mockRestore();
  });

  it("createResource uses default visible=true, calls repo, and refreshes list", async () => {
    // mount ok
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ resources: [] });
    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    (createAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    // refresh call result
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      resources: [{ id: 10, name: "R", description: "d", visible: true, file_id: 10, updated_at: "u" }],
    });

    const file = new File(["x"], "doc.txt", { type: "text/plain" });

    await act(async () => {
      await result.current.createResource(file, "Name", "Desc"); // visible omitted -> default true
    });

    expect(createAITrustCentreResource).toHaveBeenCalledWith(file, "Name", "Desc", true);
    expect(result.current.resources).toEqual([
      { id: 10, name: "R", description: "d", visible: true, file_id: 10, updated_at: "u" },
    ]);
  });

  it("deleteResource calls repo and refreshes list; error fallback uses err.message", async () => {
    // mount ok
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ resources: [] });
    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // success path first
    (deleteAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      resources: [{ id: 20, name: "AfterDel", description: "d", visible: true, file_id: 20, updated_at: "u" }],
    });

    await act(async () => {
      await result.current.deleteResource(123);
    });

    expect(deleteAITrustCentreResource).toHaveBeenCalledWith(123);
    expect(result.current.resources[0].name).toBe("AfterDel");

    // error path with err.message
    const err = new Error("delete failed");
    (deleteAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.deleteResource(999);
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() => expect(result.current.error).toBe("delete failed"));
    expect(consoleSpy).toHaveBeenCalledWith("Error deleting AI Trust Centre resource:", err);

    consoleSpy.mockRestore();
  });

  it("updateResource passes optional file + oldFileId, refreshes list, and fallback error message when no message fields", async () => {
    // mount ok
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ resources: [] });
    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // success
    (updateAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      resources: [{ id: 30, name: "AfterUpd", description: "d", visible: false, file_id: 30, updated_at: "u" }],
    });

    const file = new File(["y"], "new.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.current.updateResource(1, "N", "D", false, file, 777);
    });

    expect(updateAITrustCentreResource).toHaveBeenCalledWith(1, "N", "D", false, file, 777);
    expect(result.current.resources[0].name).toBe("AfterUpd");

    // error: no response.data.message, no err.message -> fallback string
    const err = {};
    (updateAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
      try {
        await result.current.updateResource(2, "N2", "D2", true);
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBe(err);
    await waitFor(() =>
      expect(result.current.error).toBe("Failed to update AI Trust Centre resource")
    );
    expect(consoleSpy).toHaveBeenCalledWith("Error updating AI Trust Centre resource:", err);

    consoleSpy.mockRestore();
  });

  it("fetchResources uses fallback error message when err has no message fields (covers line 64)", async () => {
    // mount resolves
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ resources: [] });

    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = {}; // no response.data.message, no err.message -> fallback line 64
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
        try {
        await result.current.fetchResources();
        } catch (e) {
        caught = e;
        }
    });

    expect(caught).toBe(err);

    await waitFor(() =>
        expect(result.current.error).toBe("Failed to fetch AI Trust Centre resources")
    );

    expect(consoleSpy).toHaveBeenCalledWith("Error fetching AI Trust Centre resources:", err);

    consoleSpy.mockRestore();
    });

    it("createResource hits catch block and uses response message (covers lines 88–94)", async () => {
    // mount resolves
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ resources: [] });

    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = { response: { data: { message: "Create failed (API)" } } };
    (createAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const file = new File(["x"], "doc.txt", { type: "text/plain" });

    let caught: any;
    await act(async () => {
        try {
        await result.current.createResource(file, "Name", "Desc", true);
        } catch (e) {
        caught = e;
        }
    });

    expect(caught).toBe(err);

    await waitFor(() => expect(result.current.error).toBe("Create failed (API)"));

    expect(consoleSpy).toHaveBeenCalledWith("Error creating AI Trust Centre resource:", err);

    consoleSpy.mockRestore();
    });

    it("deleteResource uses fallback error message when err has no message fields (covers line 115)", async () => {
    // mount resolves
    (getAITrustCentreResources as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ resources: [] });

    const { result } = renderHook(() => useAITrustCentreResources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const err = {}; // no response.data.message, no err.message -> fallback line 115
    (deleteAITrustCentreResource as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: any;
    await act(async () => {
        try {
        await result.current.deleteResource(123);
        } catch (e) {
        caught = e;
        }
    });

    expect(caught).toBe(err);

    await waitFor(() =>
        expect(result.current.error).toBe("Failed to delete AI Trust Centre resource")
    );

    expect(consoleSpy).toHaveBeenCalledWith("Error deleting AI Trust Centre resource:", err);

    consoleSpy.mockRestore();
    });
});
