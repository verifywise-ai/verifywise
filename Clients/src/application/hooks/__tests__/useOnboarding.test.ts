import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockUserId = vi.fn().mockReturnValue(1);
vi.mock("../useAuth", () => ({
  useAuth: () => ({ userId: mockUserId() }),
}));

const mockAuthState = { onboardingStatus: "pending", isOrgCreator: true };
const mockDispatch = vi.fn();
vi.mock("react-redux", () => ({
  useSelector: vi.fn((fn: (s: { auth: typeof mockAuthState }) => unknown) =>
    fn({ auth: mockAuthState }),
  ),
  useDispatch: () => mockDispatch,
}));

vi.mock("../../redux/auth/authSlice", () => ({
  setOnboardingStatus: vi.fn((status: string) => ({
    type: "auth/setOnboardingStatus",
    payload: status,
  })),
}));

import { useOnboarding } from "../useOnboarding";

describe("useOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUserId.mockReturnValue(1);
    mockAuthState.onboardingStatus = "pending";
    mockAuthState.isOrgCreator = true;
  });

  it("is incomplete for the org creator while the server says pending", () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.state.isComplete).toBe(false);
  });

  it("is complete for anyone who did not create the org", () => {
    mockAuthState.isOrgCreator = false;
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.state.isComplete).toBe(true);
  });

  it("is complete once the server status is no longer pending", () => {
    mockAuthState.onboardingStatus = "completed";
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.state.isComplete).toBe(true);
  });

  it("is complete when there is no signed-in user", () => {
    mockUserId.mockReturnValue(undefined);
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.state.isComplete).toBe(true);
  });

  it("completeOnboarding marks onboarding completed in Redux", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeOnboarding();
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: "auth/setOnboardingStatus",
      payload: "completed",
    });
  });

  it("removes the retired modal's saved progress", () => {
    localStorage.setItem("verifywise_onboarding_1", JSON.stringify({ currentStep: 3 }));

    renderHook(() => useOnboarding());

    expect(localStorage.getItem("verifywise_onboarding_1")).toBeNull();
  });
});
