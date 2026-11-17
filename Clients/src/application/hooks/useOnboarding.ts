import { useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { OnboardingState } from "../../presentation/types/interfaces/i.onboarding";
import { useAuth } from "./useAuth";
import { setOnboardingStatus as setReduxOnboardingStatus } from "../redux/auth/authSlice";
import type { RootState } from "../redux/store";
import { dynamicKeys, storageService } from "../../infrastructure/storage";

/** Routes where App opens the SetupModal while setup is pending. */
export const SETUP_MODAL_ROUTES: readonly string[] = ["/", "/home", "/start-here"];

/** True while the organization creator's first-login setup is pending. No side effects. */
export const selectSetupPending = (state: RootState): boolean =>
  state.auth?.onboardingStatus === "pending" && !!state.auth?.isOrgCreator;

/**
 * Decides whether App shows the SetupModal. It is shown only to the
 * organization creator while the server reports onboarding as "pending".
 */
export const useOnboarding = () => {
  const { userId } = useAuth();
  const dispatch = useDispatch();

  const setupPending = useSelector(selectSetupPending);

  // The retired step-by-step modal saved progress per user. Nothing reads it,
  // so drop it once for each signed-in user.
  useEffect(() => {
    if (userId) storageService.remove(dynamicKeys.legacyOnboarding(userId));
  }, [userId]);

  const state: OnboardingState = {
    isComplete: !userId || !setupPending,
  };

  const completeOnboarding = useCallback(() => {
    dispatch(setReduxOnboardingStatus("completed"));
  }, [dispatch]);

  return { state, completeOnboarding };
};
