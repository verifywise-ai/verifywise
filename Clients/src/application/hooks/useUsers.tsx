import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "../../domain/types/User";
import { getAllUsers } from "../repository/user.repository";
import { useAuth } from "./useAuth";

interface ApiUser {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id?: number;
  created_at?: string;
  last_login?: string | null;
}
interface ApiResponse {
  data: ApiUser[];
}

const USERS_QUERY_KEY = ["users"] as const;
// One shared empty list, so memos keyed on `users` do not rebuild on every render while loading.
const NO_USERS: User[] = [];

/**
 * API rows to Users, with role_id as roleId and the dates as Date objects.
 * Module-level so its identity never changes: React Query then keeps the
 * selected array while the cached rows are unchanged, and memos or effects
 * keyed on `users` do not run again after a refetch that changed nothing.
 */
const toUsers = (response: ApiResponse): User[] =>
  response.data.map((user: ApiUser): User => ({
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    roleId: user.role_id,
    created_at: user.created_at ? new Date(user.created_at) : undefined,
    last_login: user.last_login ? new Date(user.last_login) : undefined,
  }));

const useUsers = () => {
  const { userId, organizationId } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: users = NO_USERS,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: USERS_QUERY_KEY,
    // The cache holds the API rows as they arrive (plain JSON), so a refetch
    // that returns the same users keeps the same reference. The Date fields
    // are added in `select`, which React Query reruns only when the rows change.
    queryFn: async () => (await getAllUsers()) as ApiResponse,
    select: toUsers,
    // Skip when the caller has no org context (pure SuperAdmin). Elected
    // SuperAdmins have an org and still need their tenant user list.
    enabled: !!userId && !!organizationId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Stable across renders, so callers can use it in effect dependencies.
  // Resolves once the users list has been refetched.
  const refreshUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
  }, [queryClient]);

  return {
    users,
    loading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refreshUsers,
  };
};

export default useUsers;
