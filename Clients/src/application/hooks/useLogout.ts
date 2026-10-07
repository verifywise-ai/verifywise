import { useDispatch } from "react-redux";
import { endSessionAndReload } from "../utils/clearSession";
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Custom hook for handling user logout
 *
 * @returns {Function} A function that handles the logout process
 */
const useLogout = () => {
  const dispatch = useDispatch();

  /**
   * Handles logging out the user
   * Clears the authentication state and query cache, then loads the login page
   */
  const logout = async () => {
    // Revoke the refresh token server-side and clear the cookie.
    // Best-effort: local logout must proceed even if the API is unreachable.
    try {
      await apiServices.post("/users/logout", {});
    } catch {
      // Intentionally ignored — local state is cleared regardless.
    }

    // Clear the auth state and the query cache, then load the login page.
    await endSessionAndReload(dispatch);
  };

  return logout;
};

export default useLogout;
