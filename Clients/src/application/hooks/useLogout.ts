import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import { clearAuthState } from "../redux/auth/authSlice";
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Custom hook for handling user logout
 *
 * @returns {Function} A function that handles the logout process
 */
const useLogout = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  /**
   * Handles logging out the user
   * Clears the authentication state and navigates to the login page
   */
  const logout = async () => {
    // Revoke the refresh token server-side and clear the cookie.
    // Best-effort: local logout must proceed even if the API is unreachable.
    try {
      await apiServices.post("/users/logout", {});
    } catch {
      // Intentionally ignored — local state is cleared regardless.
    }

    // Clear the authentication token by dispatching the logout action
    dispatch(clearAuthState());

    // Navigate to the login page
    navigate("/login");
  };

  return logout;
};

export default useLogout;
