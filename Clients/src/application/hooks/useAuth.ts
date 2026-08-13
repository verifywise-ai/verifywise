import { useSelector } from "react-redux";
import { extractUserToken } from "../tools/extractToken";
import type { RootState } from "../redux/store";

export const useAuth = () => {
  const token = useSelector((state: RootState) => state.auth?.authToken);
  const isSuperAdmin = useSelector((state: RootState) => state.auth?.isSuperAdmin) ?? false;
  const userToken = token ? extractUserToken(token) : null;

  return {
    token,
    userToken,
    userRoleName: userToken?.roleName || "",
    userId: userToken?.id ? parseInt(userToken.id) : null,
    organizationId: userToken?.organizationId ? parseInt(userToken.organizationId) : null,
    isAuthenticated: !!token,
    isSuperAdmin,
  };
};
