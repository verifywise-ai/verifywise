import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveModule } from "../useActiveModule";

vi.mock("react-router-dom", () => ({
  useLocation: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock("react-redux", () => ({
  useDispatch: vi.fn(),
  useSelector: vi.fn(),
}));

vi.mock("../../../redux/ui/uiSlice", () => ({
  AppModule: {},
  setActiveModule: (module: string) => ({
    type: "ui/setActiveModule",
    payload: module,
  }),
}));

import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { setActiveModule } from "../../redux/ui/uiSlice";

describe("useActiveModule", () => {
  const dispatch = vi.fn();
  const navigate = vi.fn();

  let activeModuleValue: "main" | "evals" | "ai-detection" | "shadow-ai" =
    "main";

  beforeEach(() => {
    vi.clearAllMocks();
    activeModuleValue = "main";

    (useDispatch as any).mockReturnValue(dispatch);
    (useNavigate as any).mockReturnValue(navigate);

    (useSelector as any).mockImplementation((selectorFn: any) =>
      selectorFn({
        ui: { appModule: { active: activeModuleValue } },
      }),
    );

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => null);
  });

  it("syncs detected module from URL (covers /evals, /ai-detection, /shadow-ai, default main)", () => {
    // 1) /evals -> dispatch + localStorage
    activeModuleValue = "main";
    (useLocation as any).mockReturnValue({ pathname: "/evals/123" });

    renderHook(() => useActiveModule());

    expect(dispatch).toHaveBeenCalledWith(setActiveModule("evals"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "evals",
    );

    // 2) /ai-detection
    vi.clearAllMocks();
    activeModuleValue = "main";
    (useLocation as any).mockReturnValue({ pathname: "/ai-detection" });

    renderHook(() => useActiveModule());

    expect(dispatch).toHaveBeenCalledWith(setActiveModule("ai-detection"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "ai-detection",
    );

    // 3) /shadow-ai
    vi.clearAllMocks();
    activeModuleValue = "main";
    (useLocation as any).mockReturnValue({ pathname: "/shadow-ai" });

    renderHook(() => useActiveModule());

    expect(dispatch).toHaveBeenCalledWith(setActiveModule("shadow-ai"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "shadow-ai",
    );

    // 4) default -> main
    vi.clearAllMocks();
    activeModuleValue = "evals";
    (useLocation as any).mockReturnValue({ pathname: "/something-else" });

    renderHook(() => useActiveModule());

    expect(dispatch).toHaveBeenCalledWith(setActiveModule("main"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "main",
    );
  });

  it("does not dispatch on navigation when detectedModule equals activeModule", () => {
    activeModuleValue = "shadow-ai";
    (useLocation as any).mockReturnValue({ pathname: "/shadow-ai/settings" });

    renderHook(() => useActiveModule());

    expect(dispatch).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("handleModuleChange: early return when same module; otherwise dispatch + localStorage + navigate (covers all switch cases)", () => {
    activeModuleValue = "main";
    (useLocation as any).mockReturnValue({ pathname: "/" });

    const { result, rerender } = renderHook(() => useActiveModule());

    // early return (same module)
    act(() => result.current.setActiveModule("main"));
    expect(dispatch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();

    // evals
    act(() => result.current.setActiveModule("evals"));
    expect(dispatch).toHaveBeenCalledWith(setActiveModule("evals"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "evals",
    );
    expect(navigate).toHaveBeenCalledWith("/evals");

    activeModuleValue = "evals";
    rerender();

    // ai-detection
    vi.clearAllMocks();
    act(() => result.current.setActiveModule("ai-detection"));
    expect(dispatch).toHaveBeenCalledWith(setActiveModule("ai-detection"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "ai-detection",
    );
    expect(navigate).toHaveBeenCalledWith("/ai-detection/scan");

    activeModuleValue = "ai-detection";
    rerender();

    // shadow-ai
    vi.clearAllMocks();
    act(() => result.current.setActiveModule("shadow-ai"));
    expect(dispatch).toHaveBeenCalledWith(setActiveModule("shadow-ai"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "shadow-ai",
    );
    expect(navigate).toHaveBeenCalledWith("/shadow-ai/insights");

    activeModuleValue = "shadow-ai";
    rerender();

    // main (default)
    vi.clearAllMocks();
    act(() => result.current.setActiveModule("main"));
    expect(dispatch).toHaveBeenCalledWith(setActiveModule("main"));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "verifywise_active_module",
      "main",
    );
    expect(navigate).toHaveBeenCalledWith("/");

    activeModuleValue = "main";
    rerender();
  });

  it("defaults to 'main' when state.ui.appModule or active is missing (covers ?? fallback)", () => {
    (useLocation as any).mockReturnValue({ pathname: "/" });

    // Case 1: appModule undefined -> should fallback to "main"
    (useSelector as any).mockImplementation((selectorFn: any) =>
      selectorFn({ ui: {} }),
    );

    const { result, rerender } = renderHook(() => useActiveModule());
    expect(result.current.activeModule).toBe("main");

    // Case 2: appModule exists but active undefined -> should fallback to "main"
    (useSelector as any).mockImplementation((selectorFn: any) =>
      selectorFn({ ui: { appModule: {} } }),
    );

    rerender();
    expect(result.current.activeModule).toBe("main");
  });

  it("initializes from localStorage: stored valid triggers inner branch; invalid stored does nothing", () => {
    (useLocation as any).mockReturnValue({ pathname: "/" });

    // stored valid and urlModule === "main" and stored !== "main" -> dispatch(setActiveModule("main"))
    (localStorage.getItem as any).mockReturnValue("evals");

    renderHook(() => useActiveModule());

    expect(dispatch).toHaveBeenCalledWith(setActiveModule("main"));

    // stored invalid -> no dispatch from init effect
    vi.clearAllMocks();
    (useLocation as any).mockReturnValue({ pathname: "/" });
    (localStorage.getItem as any).mockReturnValue("invalid-module");

    renderHook(() => useActiveModule());

    expect(dispatch).not.toHaveBeenCalled();
  });
});
