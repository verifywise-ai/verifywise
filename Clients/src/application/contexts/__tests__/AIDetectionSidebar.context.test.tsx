import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import {
  AIDetectionSidebarProvider,
  useAIDetectionSidebarContext,
  useAIDetectionSidebarContextSafe,
} from "../AIDetectionSidebar.context";

const mockGetScans = vi.fn().mockResolvedValue({
  scans: [
    { id: 1, repository_owner: "org", repository_name: "repo1" },
    { id: 2, repository_owner: "org", repository_name: "repo2" },
  ],
  pagination: { total: 2 },
});

const mockGetActiveScan = vi.fn().mockResolvedValue(null);
const mockGetScanStatus = vi.fn().mockResolvedValue({ status: "completed" });
const mockGetRepositoryCount = vi.fn().mockResolvedValue(5);

vi.mock("../../repository/aiDetection.repository", () => ({
  getScans: (...args: unknown[]) => mockGetScans(...args),
  getActiveScan: (...args: unknown[]) => mockGetActiveScan(...args),
  getScanStatus: (...args: unknown[]) => mockGetScanStatus(...args),
}));

vi.mock("../../repository/aiDetectionRepository.repository", () => ({
  getRepositoryCount: (...args: unknown[]) => mockGetRepositoryCount(...args),
}));

vi.mock("../../../domain/ai-detection/types", () => ({}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AIDetectionSidebarProvider, null, children);
}

describe("AIDetectionSidebarContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("useAIDetectionSidebarContext", () => {
    it("should throw when used outside provider", () => {
      expect(() => {
        renderHook(() => useAIDetectionSidebarContext());
      }).toThrow("useAIDetectionSidebarContext must be used within AIDetectionSidebarProvider");
    });

    it("should provide default values", () => {
      const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });
      expect(result.current.activeTab).toBe("scan");
      expect(result.current.historyCount).toBe(0);
      expect(result.current.recentScans).toEqual([]);
      expect(result.current.scanNotification).toBeNull();
    });

    it("should load recent scans and repository count on mount", async () => {
      vi.useRealTimers();
      const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });
      await waitFor(() => {
        expect(result.current.historyCount).toBe(2);
      });
      expect(result.current.recentScans).toEqual([
        { id: 1, name: "org/repo1" },
        { id: 2, name: "org/repo2" },
      ]);
      expect(result.current.repositoryCount).toBe(5);
    });

    it("should update activeTab", () => {
      const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });
      act(() => {
        result.current.setActiveTab("history");
      });
      expect(result.current.activeTab).toBe("history");
    });

    it("should clear scan notification", () => {
      const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });
      act(() => {
        result.current.clearScanNotification();
      });
      expect(result.current.scanNotification).toBeNull();
    });

    it("should start tracking a scan and generate notification on completion", async () => {
      vi.useRealTimers();
      mockGetScanStatus.mockResolvedValueOnce({ status: "completed" });

      const { result } = renderHook(() => useAIDetectionSidebarContext(), { wrapper });

      act(() => {
        result.current.startTrackingScan(10, "org/myrepo");
      });

      await waitFor(() => {
        expect(result.current.scanNotification).not.toBeNull();
      });

      expect(result.current.scanNotification?.status).toBe("completed");
      expect(result.current.scanNotification?.repositoryName).toBe("org/myrepo");
    });
  });

  describe("useAIDetectionSidebarContextSafe", () => {
    it("should return null when used outside provider", () => {
      const { result } = renderHook(() => useAIDetectionSidebarContextSafe());
      expect(result.current).toBeNull();
    });

    it("should return context when used within provider", () => {
      const { result } = renderHook(() => useAIDetectionSidebarContextSafe(), { wrapper });
      expect(result.current).not.toBeNull();
    });
  });
});
