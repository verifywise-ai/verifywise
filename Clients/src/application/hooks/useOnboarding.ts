import { useState, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { OnboardingState } from "../../presentation/types/interfaces/i.onboarding";
import { useAuth } from "./useAuth";
import { setOnboardingStatus as setReduxOnboardingStatus } from "../redux/auth/authSlice";
import type { RootState } from "../redux/store";
import { storageService } from "../../infrastructure/storage";

/**
 * The retired step-by-step onboarding modal saved its progress under this key.
 * Nothing reads it any more, so it is removed whenever it is found.
 */
const legacyStorageKey = (userId: number) => `verifywise_onboarding_${userId}`;

/**
 * Decides whether App shows the SetupModal. It is shown only to the
 * organization creator while the server reports onboarding as "pending".
 */
export const useOnboarding = () => {
  const { userId } = useAuth();
  const dispatch = useDispatch();

  const serverOnboardingStatus = useSelector((state: RootState) => state.auth?.onboardingStatus);
  const isOrgCreator = useSelector((state: RootState) => state.auth?.isOrgCreator);

  const [state, setState] = useState<OnboardingState>({ isComplete: true });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    storageService.remove(legacyStorageKey(userId));
    setState({ isComplete: serverOnboardingStatus !== "pending" || !isOrgCreator });
    setIsLoading(false);
  }, [userId, serverOnboardingStatus, isOrgCreator]);

  const completeOnboarding = useCallback(() => {
    setState({ isComplete: true });
    dispatch(setReduxOnboardingStatus("completed"));
  }, [dispatch]);

  return { state, isLoading, completeOnboarding };
};
