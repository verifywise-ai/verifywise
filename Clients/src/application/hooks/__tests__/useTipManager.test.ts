import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useTipManager } from "../useTipManager";
import { useAuth } from "../useAuth";

vi.mock("../useAuth", () => {
  const mockFn = vi.fn();
  return {
    useAuth: mockFn,
  };
});

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

describe("useTipManager", () => {
  const mockUserId = 123;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("initialization", () => {
    it("should return null tip when userId is not available", async () => {
      mockUseAuth.mockReturnValue({ userId: null });

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(0);
      expect(result.current.hasTips).toBe(true);
      expect(result.current.totalTips).toBe(3);
    });

    it("should return null tip when entity has no tips", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      const { result } = renderHook(() => useTipManager("nonexistent-entity"));

      await waitFor(() => {
        expect(result.current.currentTip).toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(0);
      expect(result.current.hasTips).toBe(false);
      expect(result.current.totalTips).toBe(0);
    });

    it("should return correct tip info for entity with tips", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).not.toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(1);
      expect(result.current.hasTips).toBe(true);
      expect(result.current.totalTips).toBe(3);
    });
  });

  describe("tip loading from localStorage", () => {
    it("should skip dismissed tips and show next available", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      localStorage.setItem(
        `verifywise_tips_dashboard_${mockUserId}`,
        JSON.stringify({ dismissedTips: [0] })
      );

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).not.toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(2);
    });

    it("should show null when all tips are dismissed", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      localStorage.setItem(
        `verifywise_tips_dashboard_${mockUserId}`,
        JSON.stringify({ dismissedTips: [0, 1, 2] })
      );

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(0);
    });

    it("should handle invalid localStorage data gracefully", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      localStorage.setItem(
        `verifywise_tips_dashboard_${mockUserId}`,
        "invalid json"
      );

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).not.toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(1);
    });

    it("should handle missing dismissedTips in localStorage", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      localStorage.setItem(
        `verifywise_tips_dashboard_${mockUserId}`,
        JSON.stringify({})
      );

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).not.toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(1);
    });
  });

  describe("dismissTip", () => {
    it("should dismiss the current tip and update localStorage", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).not.toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(1);

      act(() => {
        result.current.dismissTip();
      });

      expect(result.current.currentTip).toBeNull();
      expect(result.current.currentTipNumber).toBe(0);

      const savedState = localStorage.getItem(
        `verifywise_tips_dashboard_${mockUserId}`
      );
      expect(savedState).toBe(
        JSON.stringify({ dismissedTips: [0] })
      );
    });

    it("should not duplicate dismissed tips in localStorage", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      localStorage.setItem(
        `verifywise_tips_dashboard_${mockUserId}`,
        JSON.stringify({ dismissedTips: [0] })
      );

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTipNumber).toBe(2);
      });

      act(() => {
        result.current.dismissTip();
      });

      const savedState = localStorage.getItem(
        `verifywise_tips_dashboard_${mockUserId}`
      );
      expect(savedState).toBe(
        JSON.stringify({ dismissedTips: [0, 1] })
      );
    });

    it("should do nothing when userId is null", async () => {
      mockUseAuth.mockReturnValue({ userId: null });

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).toBeNull();
      });

      act(() => {
        result.current.dismissTip();
      });

      expect(localStorage.getItem("verifywise_tips_dashboard_null")).toBeNull();
    });

    it("should do nothing when currentTip is already null", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      localStorage.setItem(
        `verifywise_tips_dashboard_${mockUserId}`,
        JSON.stringify({ dismissedTips: [0, 1, 2] })
      );

      const { result } = renderHook(() => useTipManager("dashboard"));

      await waitFor(() => {
        expect(result.current.currentTip).toBeNull();
      });
      expect(result.current.currentTipNumber).toBe(0);

      act(() => {
        result.current.dismissTip();
      });

      const savedState = localStorage.getItem(
        `verifywise_tips_dashboard_${mockUserId}`
      );
      expect(savedState).toBe(
        JSON.stringify({ dismissedTips: [0, 1, 2] })
      );
    });
  });

  describe("multiple entities", () => {
    it("should maintain separate dismissed tips for different entities", async () => {
      mockUseAuth.mockReturnValue({ userId: mockUserId });

      localStorage.setItem(
        `verifywise_tips_tasks_${mockUserId}`,
        JSON.stringify({ dismissedTips: [0] })
      );

      const { result: dashboardResult } = renderHook(() =>
        useTipManager("dashboard")
      );
      const { result: tasksResult } = renderHook(() =>
        useTipManager("tasks")
      );

      await waitFor(() => {
        expect(dashboardResult.current.currentTip).not.toBeNull();
        expect(tasksResult.current.currentTip).not.toBeNull();
      });

      expect(dashboardResult.current.currentTipNumber).toBe(1);
      expect(tasksResult.current.currentTipNumber).toBe(2);
    });
  });
});
