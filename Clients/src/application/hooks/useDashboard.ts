import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllEntities } from "../repository/entity.repository";
import { Dashboard } from "../../domain/types/Dashboard";

const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

export const useDashboard = () => {
  const queryClient = useQueryClient();

  const { data: dashboard = null, isLoading: loading } = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const response = await getAllEntities({ routeUrl: "/dashboard" });
      return response.data as Dashboard;
    },
    staleTime: 3 * 60 * 1000, // Consider data fresh for 3 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const fetchDashboard = async () => {
    await queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
  };

  return { dashboard, loading, fetchDashboard };
};
