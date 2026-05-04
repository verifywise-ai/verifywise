/**
 * Hook to check if the current user has Admin role
 *
 * This is used for UI purposes only (disabling buttons, hiding elements).
 * The actual authorization is enforced on the backend.
 */

import { useSelector } from "react-redux";
import { extractUserToken } from "../tools/extractToken";

/**
 * Returns true if the current user has the Admin role
 *
 * Note: This is for UI display purposes only.
 * Backend enforces actual authorization.
 */
export const useIsAdmin = (): boolean => {
  const authToken = useSelector((state: { auth: { authToken: string } }) => state.auth.authToken);

  if (!authToken) {
    return false;
  }

  const user = extractUserToken(authToken);
  return user?.roleName === "Admin";
};

/**
 * Returns the current user's role name
 *
 * Note: This is for UI display purposes only.
 * Backend enforces actual authorization.
 */
export const useUserRole = (): string | null => {
  const authToken = useSelector((state: { auth: { authToken: string } }) => state.auth.authToken);

  if (!authToken) {
    return null;
  }

  const user = extractUserToken(authToken);
  return user?.roleName || null;
};
