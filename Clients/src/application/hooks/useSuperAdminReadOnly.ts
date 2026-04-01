import { useAuth } from "./useAuth";

/**
 * Returns true when the current user is a super-admin viewing an organization
 * (i.e., read-only mode). Use this to disable mutation buttons in the UI.
 *
 * The backend enforces read-only via superAdminReadOnly middleware (returns 403),
 * so this is a UI convenience — not a security boundary.
 */
export const useSuperAdminReadOnly = (): boolean => {
  const { isSuperAdmin, activeOrganizationId } = useAuth();
  return isSuperAdmin && !!activeOrganizationId;
};
