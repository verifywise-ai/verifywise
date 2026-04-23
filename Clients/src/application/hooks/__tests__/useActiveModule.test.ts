import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
let mockPathname = "/";

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockPathname }),
  useNavigate: () => mockNavigate,
}));

vi.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector({ ui: { appModule: { active: "main" } } }),
}));

vi.mock("../../redux/ui/uiSlice", () => ({
  setActiveModule: (mod: string) => ({ type: "ui/setActiveModule", payload: mod }),
}));

import { useActiveModule } from "../useActiveModule";

describe("useActiveModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPathname = "/";
  });

  it("returns current active module", () => {
    const { result } = renderHook(() => useActiveModule());
    expect(result.current.activeModule).toBe("main");
  });

  it("navigates to /evals when module is set to evals", () => {
    const { result } = renderHook(() => useActiveModule());

    act(() => {
      result.current.setActiveModule("evals");
    });

    expect(mockNavigate).toHaveBeenCalledWith("/evals");
    expect(mockDispatch).toHaveBeenCalled();
  });

  it("navigates to /ai-detection/scan for ai-detection module", () => {
    const { result } = renderHook(() => useActiveModule());

    act(() => {
      result.current.setActiveModule("ai-detection");
    });

    expect(mockNavigate).toHaveBeenCalledWith("/ai-detection/scan");
  });

  it("navigates to / for main module", () => {
    const { result } = renderHook(() => useActiveModule());

    act(() => {
      result.current.setActiveModule("main");
    });

    // main doesn't navigate because it's the same module
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("detects evals module from URL", () => {
    mockPathname = "/evals/experiments";
    renderHook(() => useActiveModule());
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: "evals" })
    );
  });
});
