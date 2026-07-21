import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { checkOrganizationExists } from "../../../application/repository/organization.repository";
import { RootState } from "../../../application/redux/store";
import { LazyFallback } from "../../../application/utils/lazyRoute";

interface SetupGateProps {
  children: React.ReactNode;
}

/**
 * SetupGate ensures the registration/setup routes are only reachable while the
 * system has not been initialized yet.
 *
 * - If no organization exists, render the setup form.
 * - If an organization exists, redirect authenticated users to `/` and
 *   unauthenticated users to `/login`.
 */
const SetupGate = ({ children }: SetupGateProps) => {
  const { authToken } = useSelector((state: RootState) => state.auth);
  const [organizationExists, setOrganizationExists] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkExists = async () => {
      try {
        const exists = await checkOrganizationExists();
        if (!cancelled) {
          setOrganizationExists(exists);
        }
      } catch (error) {
        console.error("Failed to check organization existence:", error);
        // Fail closed: treat an error as "already initialized" so the setup
        // form is not exposed unintentionally.
        if (!cancelled) {
          setOrganizationExists(true);
        }
      }
    };

    checkExists();
    return () => {
      cancelled = true;
    };
  }, []);

  if (organizationExists === null) {
    return <LazyFallback />;
  }

  if (organizationExists) {
    return <Navigate to={authToken ? "/" : "/login"} replace />;
  }

  return <>{children}</>;
};

export default SetupGate;
