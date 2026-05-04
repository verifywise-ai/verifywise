import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import {
  ShadowAISidebarProvider,
  useShadowAISidebarContext,
  useShadowAISidebarContextSafe,
} from "../ShadowAISidebar.context";

vi.mock("../../repository/shadowAi.repository", () => ({
  getTools: vi.fn().mockResolvedValue({
    total: 3,
    tools: [
      { id: 1, name: "Tool A" },
      { id: 2, name: "Tool B" },
      { id: 3, name: "Tool C" },
    ],
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ShadowAISidebarProvider, null, children);
}

describe("ShadowAISidebarContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useShadowAISidebarContext", () => {
    it("should throw when used outside provider", () => {
      expect(() => {
        renderHook(() => useShadowAISidebarContext());
      }).toThrow("useShadowAISidebarContext must be used within ShadowAISidebarProvider");
    });

    it("should provide default values", () => {
      const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });
      expect(result.current.activeTab).toBe("insights");
      expect(result.current.alertsCount).toBe(0);
    });

    it("should load recent tools on mount", async () => {
      const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });
      await waitFor(() => {
        expect(result.current.toolsCount).toBe(3);
      });
      expect(result.current.recentTools).toEqual([
        { id: 1, name: "Tool A" },
        { id: 2, name: "Tool B" },
        { id: 3, name: "Tool C" },
      ]);
    });

    it("should update activeTab", () => {
      const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });
      act(() => {
        result.current.setActiveTab("tools");
      });
      expect(result.current.activeTab).toBe("tools");
    });

    it("should update alertsCount", () => {
      const { result } = renderHook(() => useShadowAISidebarContext(), { wrapper });
      act(() => {
        result.current.setAlertsCount(10);
      });
      expect(result.current.alertsCount).toBe(10);
    });
  });

  describe("useShadowAISidebarContextSafe", () => {
    it("should return null when used outside provider", () => {
      const { result } = renderHook(() => useShadowAISidebarContextSafe());
      expect(result.current).toBeNull();
    });

    it("should return context when used within provider", () => {
      const { result } = renderHook(() => useShadowAISidebarContextSafe(), { wrapper });
      expect(result.current).not.toBeNull();
    });
  });
});
