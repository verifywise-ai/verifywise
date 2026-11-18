import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEntityById } from "../repository/entity.repository";

interface Role {
  id: number;
  name: string;
  description: string;
}

const ROLES_QUERY_KEY = ["roles"] as const;

export const useRoles = () => {
  const queryClient = useQueryClient();

  const {
    data: roles = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: async () => {
      const response = await getEntityById({
        routeUrl: "/roles",
      });
      return response.data as Role[];
    },
    staleTime: 10 * 60 * 1000, // Roles rarely change, cache for 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
  });

  // Stable across renders, so callers can use it in effect dependencies.
  const refreshRoles = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
  }, [queryClient]);

  return { roles, loading, error: error as Error | null, refreshRoles };
};
