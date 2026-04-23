import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockUserId = vi.fn().mockReturnValue(1);
vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: mockUserId() }),
}));

vi.mock("../../contexts/VerifyWise.context", () => ({
  VerifyWiseContext: {
    _currentValue: { users: [{ id: 1 }], organizationId: 1 },
  },
}));

// Mock useContext to return our context values
const mockContextValue = { users: [{ id: 1 }], organizationId: 1 };
vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useContext: () => mockContextValue,
  };
});

vi.mock("react-redux", () => ({
  useSelector: vi.fn((fn: any) =>
    fn({ auth: { onboardingStatus: "pending", isOrgCreator: true } })
  ),
  useDispatch: () => vi.fn(),
}));

vi.mock("../../redux/auth/authSlice", () => ({
  setOnboardingStatus: vi.fn((status: string) => ({ type: "auth/setOnboardingStatus", payload: status })),
}));

import { useOnboarding } from "../useOnboarding";

describe("useOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("returns initial state", () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.state).toBeDefined();
    expect(result.current.isLoading).toBe(false);
    expect(typeof result.current.setCurrentStep).toBe("function");
    expect(typeof result.current.completeStep).toBe("function");
    expect(typeof result.current.skipStep).toBe("function");
  });

  it("shouldShowOnboarding returns false (temporarily disabled)", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.shouldShowOnboarding()).toBe(false);
  });

  it("setCurrentStep updates step", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.setCurrentStep(2);
    });

    expect(result.current.state.currentStep).toBe(2);
  });

  it("completeStep adds step to completedSteps", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeStep(1);
    });

    expect(result.current.state.completedSteps).toContain(1);
  });

  it("skipStep adds step to skippedSteps", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.skipStep(3);
    });

    expect(result.current.state.skippedSteps).toContain(3);
  });

  it("updatePreferences merges preferences", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.updatePreferences({ theme: "dark" } as any);
    });

    expect(result.current.state.preferences).toEqual({ theme: "dark" });
  });

  it("completeOnboarding sets isComplete to true", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeOnboarding();
    });

    expect(result.current.state.isComplete).toBe(true);
  });

  it("resetOnboarding clears state and localStorage", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeStep(1);
      result.current.resetOnboarding();
    });

    expect(result.current.state.completedSteps).toEqual([]);
  });
});
