import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { useOnboarding } from "../useOnboarding";
import { useAuth } from "../useAuth";
import { VerifyWiseContext } from "../../contexts/VerifyWise.context";

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({ userId: 123 })),
}));

const createWrapper = (initialState = {}) => {
  const store = configureStore({
    reducer: {
      auth: () => ({
        onboardingStatus: "pending",
        isOrgCreator: true,
        ...initialState,
      }),
    },
  });

  const contextValue = {
    users: [{ id: 1, name: "Test User" }],
    organizationId: "org-1",
  };

  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <VerifyWiseContext.Provider value={contextValue}>
        {children}
      </VerifyWiseContext.Provider>
    </Provider>
  );
};

describe("useOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("initial state", () => {
    it("should return initial state", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.state).toBeDefined();
      expect(result.current.state.currentStep).toBe(0);
      expect(result.current.state.completedSteps).toEqual([]);
      expect(result.current.state.skippedSteps).toEqual([]);
      expect(result.current.state.isComplete).toBe(false);
    });

    it("should indicate first user in org", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFirstUserInOrg).toBe(true);
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isInvitedUser).toBe(false);
    });

    it("should indicate org creator", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isOrgCreator).toBe(true);
    });

    it("should handle when userId is null", () => {
      vi.mocked(useAuth).mockReturnValueOnce({ userId: null as any });

      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.state).toBeDefined();
    });
  });

  describe("setCurrentStep", () => {
    it("should update current step", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setCurrentStep(2);
      });

      expect(result.current.state.currentStep).toBe(2);
    });
  });

  describe("completeStep", () => {
    it("should mark step as completed", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.completeStep(1);
      });

      expect(result.current.state.completedSteps).toContain(1);
    });

    it("should not duplicate completed steps", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.completeStep(1);
      });
      act(() => {
        result.current.completeStep(1);
      });

      expect(result.current.state.completedSteps).toEqual([1]);
    });
  });

  describe("skipStep", () => {
    it("should mark step as skipped", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.skipStep(2);
      });

      expect(result.current.state.skippedSteps).toContain(2);
    });
  });

  describe("updatePreferences", () => {
    it("should update preferences", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.updatePreferences({ theme: "dark" });
      });

      expect(result.current.state.preferences.theme).toBe("dark");
    });

    it("should merge preferences", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.updatePreferences({ theme: "dark" });
      });
      act(() => {
        result.current.updatePreferences({ language: "en" });
      });

      expect(result.current.state.preferences).toEqual({
        theme: "dark",
        language: "en",
      });
    });
  });

  describe("updateSampleProject", () => {
    it("should update sample project data", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.updateSampleProject({ name: "My Project" });
      });

      expect(result.current.state.sampleProject.name).toBe("My Project");
    });
  });

  describe("completeOnboarding", () => {
    it("should mark onboarding as complete", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.state.isComplete).toBe(false);

      act(() => {
        result.current.completeOnboarding();
      });

      expect(result.current.state.isComplete).toBe(true);
    });
  });

  describe("resetOnboarding", () => {
    it("should reset onboarding state", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setCurrentStep(3);
      });
      act(() => {
        result.current.completeStep(1);
      });
      act(() => {
        result.current.skipStep(2);
      });

      expect(result.current.state.currentStep).toBe(3);
      expect(result.current.state.completedSteps).toContain(1);

      act(() => {
        result.current.resetOnboarding();
      });

      expect(result.current.state.currentStep).toBe(0);
      expect(result.current.state.completedSteps).toEqual([]);
      expect(result.current.state.skippedSteps).toEqual([]);
    });
  });

  describe("shouldShowOnboarding", () => {
    it("should return false (temporarily disabled)", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.shouldShowOnboarding()).toBe(false);
    });
  });

  describe("localStorage persistence", () => {
    it("should save state to localStorage", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setCurrentStep(2);
      });

      const saved = localStorage.getItem("verifywise_onboarding_123");
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed.currentStep).toBe(2);
    });

    it("should load state from localStorage", () => {
      localStorage.setItem(
        "verifywise_onboarding_123",
        JSON.stringify({ currentStep: 3, completedSteps: [1, 2] })
      );

      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.state.currentStep).toBe(3);
      expect(result.current.state.completedSteps).toEqual([1, 2]);
    });
  });

  describe("server onboarding status", () => {
    it("should use server status for isComplete", () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper({ onboardingStatus: "completed" }),
      });

      expect(result.current.serverOnboardingStatus).toBe("completed");
    });
  });

  describe("error handling", () => {
    it("should handle invalid localStorage data gracefully", () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn((key: string) => {
        if (key.includes("verifywise_onboarding")) {
          return "invalid json {";
        }
        return originalGetItem(key);
      });

      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.state).toBeDefined();

      localStorage.getItem = originalGetItem;
    });
  });
});
