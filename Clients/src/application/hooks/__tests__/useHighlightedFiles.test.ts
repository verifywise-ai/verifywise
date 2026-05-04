import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/file.repository", () => ({
  getHighlightedFiles: vi.fn(),
}));

import { useHighlightedFiles } from "../useHighlightedFiles";
import { getHighlightedFiles } from "../../repository/file.repository";

const mockGetHighlighted = vi.mocked(getHighlightedFiles);

describe("useHighlightedFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches highlighted files on mount", async () => {
    mockGetHighlighted.mockResolvedValue({
      dueForUpdate: [1, 2],
      pendingApproval: [3],
      recentlyModified: [4, 5],
    });

    const { result } = renderHook(() => useHighlightedFiles({ refreshInterval: 0 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dueForUpdate.has(1)).toBe(true);
    expect(result.current.pendingApproval.has(3)).toBe(true);
    expect(result.current.recentlyModified.has(5)).toBe(true);
  });

  it("getHighlightType returns correct priority", async () => {
    mockGetHighlighted.mockResolvedValue({
      dueForUpdate: [1],
      pendingApproval: [1, 2],
      recentlyModified: [3],
    });

    const { result } = renderHook(() => useHighlightedFiles({ refreshInterval: 0 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // dueForUpdate takes priority
    expect(result.current.getHighlightType(1)).toBe("dueForUpdate");
    expect(result.current.getHighlightType(2)).toBe("pendingApproval");
    expect(result.current.getHighlightType(3)).toBe("recentlyModified");
    expect(result.current.getHighlightType(99)).toBeNull();
  });

  it("isHighlighted returns true for highlighted files", async () => {
    mockGetHighlighted.mockResolvedValue({
      dueForUpdate: [10],
      pendingApproval: [],
      recentlyModified: [],
    });

    const { result } = renderHook(() => useHighlightedFiles({ refreshInterval: 0 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isHighlighted(10)).toBe(true);
    expect(result.current.isHighlighted(99)).toBe(false);
  });

  it("handles error gracefully", async () => {
    mockGetHighlighted.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useHighlightedFiles({ refreshInterval: 0 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load highlighted files");
  });
});
