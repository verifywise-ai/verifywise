import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import {
  getDashboardPreferences,
  updateDashboardPreferences,
  type DashboardLayoutEntry,
  type DashboardPreferences,
} from "../repository/dashboardPreferences.repository";

// A layout belongs to one user in one organization, so both are in the key.
const preferencesKey = (userId: number | null, organizationId: number | null) =>
  ["dashboardPreferences", userId, organizationId] as const;

/** The signed-in user's saved dashboard layout in the current organization. */
export function useDashboardPreferences() {
  const { userId, organizationId } = useAuth();
  return useQuery<DashboardPreferences>({
    queryKey: preferencesKey(userId, organizationId),
    queryFn: getDashboardPreferences,
    staleTime: 5 * 60 * 1000,
    // Falling back to the default layout beats holding up the dashboard.
    retry: false,
    enabled: userId !== null,
  });
}

/** Replace the user's layout; the cached copy is replaced on success. */
export function useUpdateDashboardPreferences() {
  const { userId, organizationId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayoutEntry[]) => updateDashboardPreferences(layout),
    onSuccess: (preferences) => {
      queryClient.setQueryData(preferencesKey(userId, organizationId), preferences);
    },
  });
}
