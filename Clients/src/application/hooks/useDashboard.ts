import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllEntities } from "../repository/entity.repository";
import { Dashboard } from "../../domain/types/Dashboard";

const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

export const useDashboard = () => {
  const queryClient = useQueryClient();

  const {
    data: dashboard = null,
    isLoading: loading,
    isPending,
  } = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const response = await getAllEntities({ routeUrl: "/dashboard" });
      return response.data as Dashboard;
    },
    staleTime: 3 * 60 * 1000, // Consider data fresh for 3 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Stable across renders: Home lists it as an effect dependency, and a new
  // function each render made that effect invalidate the dashboard (and
  // refetch users) on every render, a request loop of ~30 calls a second.
  const fetchDashboard = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
  }, [queryClient]);

  return { dashboard, loading, isPending, fetchDashboard };
};
