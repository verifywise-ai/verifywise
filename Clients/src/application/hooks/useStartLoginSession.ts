import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import {
  setExpiration,
  setIsOrgCreator,
  setIsSuperAdmin,
  setOnboardingStatus,
} from "../redux/auth/authSlice";
import { startSession } from "../utils/clearSession";
import { extractUserToken } from "../tools/extractToken";
import { logEngine } from "../tools/log.engine";
import type { LoginSession } from "../repository/user.repository";

const REMEMBER_ME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Starts the session a password login ends with (a direct login, an
 * organization chosen after login, an accepted invitation) and opens the
 * landing page.
 */
export const useStartLoginSession = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  return useCallback(
    (session: LoginSession, rememberMe: boolean) => {
      const isSuperAdminFlag = session.isSuperAdmin || false;

      startSession(dispatch, session.token);
      dispatch(setExpiration(rememberMe ? Date.now() + REMEMBER_ME_MS : null));
      dispatch(setIsSuperAdmin(isSuperAdminFlag));
      localStorage.setItem("root_version", __APP_VERSION__);

      // Bootstrap SuperAdmin: JWT has no organizationId — take them
      // straight to /super-admin. Elected SuperAdmins have their own
      // org and fall through to the normal tenant landing page; they
      // can jump to /super-admin from the AppSwitcher.
      if (isSuperAdminFlag && !extractUserToken(session.token)?.organizationId) {
        logEngine({ type: "info", message: "Super-admin login successful." });
        navigate("/super-admin");
        return;
      }

      dispatch(setOnboardingStatus(session.onboarding_status || "completed"));
      dispatch(setIsOrgCreator(session.is_org_creator || false));
      logEngine({ type: "info", message: "Login successful." });
      navigate("/");
    },
    [dispatch, navigate],
  );
};
