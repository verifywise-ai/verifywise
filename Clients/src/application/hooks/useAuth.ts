import { useSelector } from "react-redux";
import { extractUserToken } from "../tools/extractToken";
import type { RootState } from "../redux/store";

export const useAuth = () => {
  const token = useSelector((state: RootState) => state.auth?.authToken);
  const isSuperAdmin = useSelector((state: RootState) => state.auth?.isSuperAdmin) ?? false;
  const activeOrganizationId = useSelector((state: RootState) => state.auth?.activeOrganizationId) ?? null;
  const userToken = token ? extractUserToken(token) : null;

  const tokenOrgId = userToken?.organizationId ? parseInt(userToken.organizationId) : null;

  return {
    token,
    userToken,
    userRoleName: userToken?.roleName || "",
    userId: userToken?.id ? parseInt(userToken.id) : null,
    // When super-admin is viewing an org, return that org's ID
    organizationId: isSuperAdmin ? activeOrganizationId : tokenOrgId,
    isAuthenticated: !!token,
    isSuperAdmin,
    activeOrganizationId,
  };
};
