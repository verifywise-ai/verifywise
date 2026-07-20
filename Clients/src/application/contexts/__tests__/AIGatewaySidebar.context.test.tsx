import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import {
  AIGatewaySidebarProvider,
  useAIGatewaySidebarContext,
  useAIGatewaySidebarContextSafe,
} from "../AIGatewaySidebar.context";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes("endpoints")) {
        return Promise.resolve({
          data: {
            endpoints: [{ is_active: true }, { is_active: false }, { is_active: true }],
          },
        });
      }
      if (url.includes("prompts")) {
        return Promise.resolve({
          data: { prompts: [{ id: 1 }, { id: 2 }] },
        });
      }
      if (url.includes("virtual-keys")) {
        return Promise.resolve({
          data: { data: [{ is_active: true }, { is_active: false }] },
        });
      }
      return Promise.resolve({ data: {} });
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AIGatewaySidebarProvider, null, children);
}

describe("AIGatewaySidebarContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useAIGatewaySidebarContext", () => {
    it("should throw when used outside provider", () => {
      expect(() => {
        renderHook(() => useAIGatewaySidebarContext());
      }).toThrow("useAIGatewaySidebarContext must be used within AIGatewaySidebarProvider");
    });

    it("should provide default values", () => {
      const { result } = renderHook(() => useAIGatewaySidebarContext(), { wrapper });
      expect(result.current.activeTab).toBe("analytics");
    });

    it("should load counts from API on mount", async () => {
      const { result } = renderHook(() => useAIGatewaySidebarContext(), { wrapper });
      await waitFor(() => {
        expect(result.current.endpointsCount).toBe(2); // 2 active
      });
      // Prompts is hidden behind SHOW_AI_GATEWAY_PROMPTS (currently off), so the
      // provider does not fetch the prompts count and it stays at 0.
      expect(result.current.promptsCount).toBe(0);
      expect(result.current.virtualKeysCount).toBe(1); // 1 active
    });

    it("should update activeTab", () => {
      const { result } = renderHook(() => useAIGatewaySidebarContext(), { wrapper });
      act(() => {
        result.current.setActiveTab("endpoints");
      });
      expect(result.current.activeTab).toBe("endpoints");
    });

    it("should update counts manually", () => {
      const { result } = renderHook(() => useAIGatewaySidebarContext(), { wrapper });
      act(() => {
        result.current.setEndpointsCount(10);
        result.current.setPromptsCount(20);
        result.current.setVirtualKeysCount(5);
      });
      expect(result.current.endpointsCount).toBe(10);
      expect(result.current.promptsCount).toBe(20);
      expect(result.current.virtualKeysCount).toBe(5);
    });
  });

  describe("useAIGatewaySidebarContextSafe", () => {
    it("should return null when used outside provider", () => {
      const { result } = renderHook(() => useAIGatewaySidebarContextSafe());
      expect(result.current).toBeNull();
    });

    it("should return context when used within provider", () => {
      const { result } = renderHook(() => useAIGatewaySidebarContextSafe(), { wrapper });
      expect(result.current).not.toBeNull();
    });
  });
});
