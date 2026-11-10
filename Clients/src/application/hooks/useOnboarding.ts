import { useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { OnboardingState } from "../../presentation/types/interfaces/i.onboarding";
import { useAuth } from "./useAuth";
import { setOnboardingStatus as setReduxOnboardingStatus } from "../redux/auth/authSlice";
import type { RootState } from "../redux/store";
import { dynamicKeys, storageService } from "../../infrastructure/storage";

/**
 * Decides whether App shows the SetupModal. It is shown only to the
 * organization creator while the server reports onboarding as "pending".
 */
export const useOnboarding = () => {
  const { userId } = useAuth();
  const dispatch = useDispatch();

  const serverOnboardingStatus = useSelector((state: RootState) => state.auth?.onboardingStatus);
  const isOrgCreator = useSelector((state: RootState) => state.auth?.isOrgCreator);

  // The retired step-by-step modal saved progress per user. Nothing reads it,
  // so drop it once for each signed-in user.
  useEffect(() => {
    if (userId) storageService.remove(dynamicKeys.legacyOnboarding(userId));
  }, [userId]);

  const state: OnboardingState = {
    isComplete: !userId || serverOnboardingStatus !== "pending" || !isOrgCreator,
  };

  const completeOnboarding = useCallback(() => {
    dispatch(setReduxOnboardingStatus("completed"));
  }, [dispatch]);

  return { state, completeOnboarding };
};
