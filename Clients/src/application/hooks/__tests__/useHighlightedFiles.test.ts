import { renderHook, waitFor } from "@testing-library/react";
import { useHighlightedFiles } from "../useHighlightedFiles";
import * as fileRepository from "../../repository/file.repository";

const mockGetHighlightedFiles = fileRepository.getHighlightedFiles as jest.Mock;

vi.mock("../../repository/file.repository", () => ({
  getHighlightedFiles: vi.fn(),
}));

describe("useHighlightedFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start with loading true and empty data", async () => {
      mockGetHighlightedFiles.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useHighlightedFiles());

      expect(result.current.loading).toBe(true);
      expect(result.current.dueForUpdate.size).toBe(0);
      expect(result.current.pendingApproval.size).toBe(0);
      expect(result.current.recentlyModified.size).toBe(0);
    });
  });

  describe("successful fetch", () => {
    it("should return highlighted files data", async () => {
      const mockData = {
        dueForUpdate: [1, 2],
        pendingApproval: [3],
        recentlyModified: [4, 5],
      };

      mockGetHighlightedFiles.mockResolvedValue(mockData);

      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.dueForUpdate).toEqual(new Set([1, 2]));
      expect(result.current.pendingApproval).toEqual(new Set([3]));
      expect(result.current.recentlyModified).toEqual(new Set([4, 5]));
      expect(result.current.error).toBeNull();
    });

    it("should handle empty data", async () => {
      mockGetHighlightedFiles.mockResolvedValue({
        dueForUpdate: [],
        pendingApproval: [],
        recentlyModified: [],
      });

      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.dueForUpdate.size).toBe(0);
      expect(result.current.pendingApproval.size).toBe(0);
      expect(result.current.recentlyModified.size).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGetHighlightedFiles.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load highlighted files");
    });
  });

  describe("helper functions", () => {
    beforeEach(async () => {
      const mockData = {
        dueForUpdate: [1, 2],
        pendingApproval: [3],
        recentlyModified: [4, 5],
      };

      mockGetHighlightedFiles.mockResolvedValue(mockData);

      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should get highlight type correctly", async () => {
      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.getHighlightType(1)).toBe("dueForUpdate");
      expect(result.current.getHighlightType(3)).toBe("pendingApproval");
      expect(result.current.getHighlightType(4)).toBe("recentlyModified");
      expect(result.current.getHighlightType(999)).toBeNull();
    });

    it("should check if file is highlighted", async () => {
      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isHighlighted(1)).toBe(true);
      expect(result.current.isHighlighted(999)).toBe(false);
    });

    it("should get all highlight types for a file", async () => {
      mockGetHighlightedFiles.mockResolvedValue({
        dueForUpdate: [1],
        pendingApproval: [1],
        recentlyModified: [1],
      });

      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.getHighlightTypes(1)).toEqual([
        "dueForUpdate",
        "pendingApproval",
        "recentlyModified",
      ]);
    });

    it("should handle string file IDs", async () => {
      const { result } = renderHook(() => useHighlightedFiles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isHighlighted("1")).toBe(true);
      expect(result.current.getHighlightType("2")).toBe("dueForUpdate");
    });
  });

  describe("options", () => {
    it("should pass options to repository", async () => {
      mockGetHighlightedFiles.mockResolvedValue({
        dueForUpdate: [],
        pendingApproval: [],
        recentlyModified: [],
      });

      renderHook(() =>
        useHighlightedFiles({
          daysUntilExpiry: 60,
          recentDays: 14,
          refreshInterval: 0,
        })
      );

      expect(mockGetHighlightedFiles).toHaveBeenCalledWith({
        daysUntilExpiry: 60,
        recentDays: 14,
      });
    });
  });

  describe("refresh", () => {
    it("should provide refresh function", async () => {
      mockGetHighlightedFiles.mockResolvedValue({
        dueForUpdate: [],
        pendingApproval: [],
        recentlyModified: [],
      });

      const { result } = renderHook(() => useHighlightedFiles({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe("function");
    });
  });
});
