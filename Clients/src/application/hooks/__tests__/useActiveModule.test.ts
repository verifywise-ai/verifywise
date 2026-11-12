import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
let mockPathname = "/";
let mockActive = "main";

vi.mock("react-router", () => ({
  useLocation: () => ({ pathname: mockPathname }),
  useNavigate: () => mockNavigate,
}));

vi.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector({ ui: { appModule: { active: mockActive } } }),
}));

vi.mock("../../redux/ui/uiSlice", () => ({
  setActiveModule: (mod: string) => ({ type: "ui/setActiveModule", payload: mod }),
}));

import { useActiveModule } from "../useActiveModule";
import { storageService } from "../../../infrastructure/storage";

describe("useActiveModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPathname = "/";
    mockActive = "main";
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
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: "evals" }));
  });

  describe("global pages (Settings, Event tracker)", () => {
    it("keeps the module the user came from", () => {
      mockActive = "shadow-ai";
      mockPathname = "/settings/organization";
      renderHook(() => useActiveModule());
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("restores the stored module after a reload", () => {
      storageService.setRaw("verifywise_active_module", "shadow-ai", { raw: true });
      mockPathname = "/event-tracker";
      renderHook(() => useActiveModule());
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: "shadow-ai" }));
    });

    it("does not restore the super-admin module", () => {
      storageService.setRaw("verifywise_active_module", "super-admin", { raw: true });
      mockPathname = "/settings";
      renderHook(() => useActiveModule());
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("clicking the current module goes back to it", () => {
      mockActive = "shadow-ai";
      mockPathname = "/settings";
      const { result } = renderHook(() => useActiveModule());
      act(() => {
        result.current.setActiveModule("shadow-ai");
      });
      expect(mockNavigate).toHaveBeenCalledWith("/shadow-ai/insights");
    });
  });
});
