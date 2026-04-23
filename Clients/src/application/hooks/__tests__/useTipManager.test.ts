import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../config/entityTips", () => ({
  ENTITY_TIPS: {
    projects: [
      { title: "Tip 1", description: "Desc 1" },
      { title: "Tip 2", description: "Desc 2" },
    ],
    empty: [],
  },
}));

import { useTipManager } from "../useTipManager";
import { useAuth } from "../useAuth";

const mockUseAuth = vi.mocked(useAuth);

describe("useTipManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({ userId: 1 } as any);
  });

  it("returns the first tip for an entity", () => {
    const { result } = renderHook(() => useTipManager("projects"));
    expect(result.current.currentTip).toEqual({ title: "Tip 1", description: "Desc 1" });
    expect(result.current.hasTips).toBe(true);
    expect(result.current.totalTips).toBe(2);
    expect(result.current.currentTipNumber).toBe(1);
  });

  it("returns null tip when no tips for entity", () => {
    const { result } = renderHook(() => useTipManager("empty"));
    expect(result.current.currentTip).toBeNull();
    expect(result.current.hasTips).toBe(false);
  });

  it("returns null when no userId", () => {
    mockUseAuth.mockReturnValue({ userId: null } as any);
    const { result } = renderHook(() => useTipManager("projects"));
    expect(result.current.currentTip).toBeNull();
  });

  it("dismissTip hides current tip and persists to localStorage", () => {
    const { result } = renderHook(() => useTipManager("projects"));

    act(() => {
      result.current.dismissTip();
    });

    expect(result.current.currentTip).toBeNull();
    const stored = JSON.parse(localStorage.getItem("verifywise_tips_projects_1")!);
    expect(stored.dismissedTips).toContain(0);
  });

  it("shows next undismissed tip", () => {
    localStorage.setItem("verifywise_tips_projects_1", JSON.stringify({ dismissedTips: [0] }));
    const { result } = renderHook(() => useTipManager("projects"));
    expect(result.current.currentTip).toEqual({ title: "Tip 2", description: "Desc 2" });
    expect(result.current.currentTipNumber).toBe(2);
  });

  it("returns null when all tips dismissed", () => {
    localStorage.setItem("verifywise_tips_projects_1", JSON.stringify({ dismissedTips: [0, 1] }));
    const { result } = renderHook(() => useTipManager("projects"));
    expect(result.current.currentTip).toBeNull();
  });
});
