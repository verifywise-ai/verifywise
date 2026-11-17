import { useQuery } from "@tanstack/react-query";
import { getMyPermissions } from "../repository/role.repository";
import { useAuth } from "./useAuth";

export const MY_PERMISSIONS_QUERY_KEY = ["my-permissions"] as const;

/**
 * The current user's effective permission keys, from GET /roles/my-permissions.
 * These are what the server authorizes on, so a custom role that was granted a
 * permission gets the matching UI too, not only the built-in role that has it
 * by default.
 *
 * Scoped to the user and organization; the cache is also cleared on every
 * logout and sign-in (clearSession / startSession). This is for UI purposes
 * only (hiding or disabling controls); the backend enforces authorization.
 * Components gate through useCan / useCanCheck (./useCan), which add the
 * loading rule; read this directly only for the raw list.
 */
export function useMyPermissions() {
  const { userId, organizationId } = useAuth();
  const query = useQuery<string[]>({
    queryKey: [...MY_PERMISSIONS_QUERY_KEY, userId, organizationId],
    queryFn: ({ signal }) => getMyPermissions({ signal }),
    enabled: userId != null,
    // Permissions change rarely (an admin editing a role).
    staleTime: 5 * 60 * 1000,
  });
  return { permissions: query.data, isLoading: query.isLoading, error: query.error };
}
