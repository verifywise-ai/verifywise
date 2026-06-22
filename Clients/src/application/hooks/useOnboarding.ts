import { useState, useEffect, useCallback, useContext } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  OnboardingState,
  UserPreferences,
  SampleProjectData,
} from "../../presentation/types/interfaces/i.onboarding";
import { VerifyWiseContext } from "../contexts/VerifyWise.context";
import { useAuth } from "./useAuth";
import { setOnboardingStatus as setReduxOnboardingStatus } from "../redux/auth/authSlice";
import type { RootState } from "../redux/store";
import { storageService } from "../../infrastructure/storage";

const getStorageKey = (userId: number) => `verifywise_onboarding_${userId}`;

const initialState: OnboardingState = {
  currentStep: 0,
  completedSteps: [],
  skippedSteps: [],
  preferences: {},
  sampleProject: {},
  isComplete: true, // Default to true, will be overridden by server-side status
  lastUpdated: new Date().toISOString(),
};

export const useOnboarding = () => {
  const { userId } = useAuth();
  const { users, organizationId } = useContext(VerifyWiseContext);
  const dispatch = useDispatch();

  // Get server-side onboarding status from Redux
  const serverOnboardingStatus = useSelector((state: RootState) => state.auth?.onboardingStatus);
  const isOrgCreator = useSelector((state: RootState) => state.auth?.isOrgCreator);

  const [state, setState] = useState<OnboardingState>(initialState);
  const [isLoading, setIsLoading] = useState(true);

  // Load state from localStorage on mount, but use server-side status for isComplete
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const storageKey = getStorageKey(userId);
    const parsed = storageService.getRaw<OnboardingState | null>(storageKey, null);

    // Determine isComplete from server-side status
    // Only show setup modal if:
    // 1. Server says onboarding is pending
    // 2. User is the org creator
    const isCompleteFromServer = serverOnboardingStatus !== "pending" || !isOrgCreator;

    if (parsed) {
      // Override isComplete with server-side status
      setState({ ...parsed, isComplete: isCompleteFromServer });
    } else {
      // First time for this user (or unreadable) — initialize with server-side status
      setState({ ...initialState, isComplete: isCompleteFromServer });
    }
    setIsLoading(false);
  }, [userId, serverOnboardingStatus, isOrgCreator]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!userId) return;

    const storageKey = getStorageKey(userId);
    storageService.setRaw(storageKey, state);

    // Note: We removed cross-tab sync to prevent infinite loops
    // If cross-tab sync is needed, it should use the native storage event instead
  }, [state, userId]);

  // Listen for native storage events from other tabs
  useEffect(() => {
    if (!userId) return;

    const handleStorageChange = (event: StorageEvent) => {
      const storageKey = getStorageKey(userId);

      // Only handle changes to our specific key
      if (event.key !== storageKey) return;

      // Only handle changes from other tabs (event.storageArea will be null for same tab)
      if (!event.newValue) return;

      try {
        const newState = JSON.parse(event.newValue);
        setState((currentState) => {
          // Only update if the state actually changed
          if (newState.lastUpdated !== currentState.lastUpdated) {
            return newState;
          }
          return currentState;
        });
      } catch (error) {
        console.error("Failed to parse storage event:", error);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [userId]);

  // Check if user is first in organization
  const isFirstUserInOrg = useCallback(() => {
    if (!userId || !organizationId || !users) return false;
    // If there's only one user in the organization, they're the first user
    return users.length === 1;
  }, [userId, organizationId, users]);

  // Check if user is admin (for now, first user is admin)
  const isAdmin = useCallback(() => {
    if (!userId || !organizationId || !users) return false;
    // First user in organization is admin
    return users.length === 1;
  }, [userId, organizationId, users]);

  // Check if user was invited (not first user)
  const isInvitedUser = useCallback(() => {
    return !isFirstUserInOrg();
  }, [isFirstUserInOrg]);

  // Update current step
  const setCurrentStep = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  // Mark step as completed
  const completeStep = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      completedSteps: [...new Set([...prev.completedSteps, step])],
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  // Mark step as skipped
  const skipStep = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      skippedSteps: [...new Set([...prev.skippedSteps, step])],
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  // Update preferences
  const updatePreferences = useCallback((prefs: Partial<UserPreferences>) => {
    setState((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        ...prefs,
      },
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  // Update sample project data
  const updateSampleProject = useCallback((data: Partial<SampleProjectData>) => {
    setState((prev) => ({
      ...prev,
      sampleProject: {
        ...prev.sampleProject,
        ...data,
      },
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  // Complete onboarding - updates both local state and Redux
  const completeOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isComplete: true,
      lastUpdated: new Date().toISOString(),
    }));
    // Update Redux to mark onboarding as completed
    dispatch(setReduxOnboardingStatus("completed"));
  }, [dispatch]);

  // Reset onboarding (for restart)
  const resetOnboarding = useCallback(() => {
    setState(initialState);
    if (userId) {
      const storageKey = getStorageKey(userId);
      storageService.remove(storageKey);
    }
  }, [userId]);

  // Check if onboarding should be shown
  const shouldShowOnboarding = useCallback(() => {
    // Onboarding is temporarily disabled
    return false;
  }, []);

  return {
    state,
    isLoading,
    isFirstUserInOrg: isFirstUserInOrg(),
    isAdmin: isAdmin(),
    isInvitedUser: isInvitedUser(),
    isOrgCreator: isOrgCreator ?? false,
    serverOnboardingStatus: serverOnboardingStatus ?? "completed",
    setCurrentStep,
    completeStep,
    skipStep,
    updatePreferences,
    updateSampleProject,
    completeOnboarding,
    resetOnboarding,
    shouldShowOnboarding,
  };
};
