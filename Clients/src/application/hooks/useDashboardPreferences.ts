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

/**
 * Replace the user's layout. `build` gets the layout stored right now, not the
 * cached copy: a save rewrites both views, so a stale or failed read would
 * overwrite the other view. When that read fails nothing is saved.
 */
export function useUpdateDashboardPreferences() {
  const { userId, organizationId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = preferencesKey(userId, organizationId);
  return useMutation({
    mutationFn: async (
      build: (latest: DashboardLayoutEntry[] | null) => DashboardLayoutEntry[],
    ) => {
      // A refetch already running must not land after the save and undo it.
      await queryClient.cancelQueries({ queryKey });
      const latest = await queryClient.fetchQuery({
        queryKey,
        queryFn: getDashboardPreferences,
        staleTime: 0,
      });
      return updateDashboardPreferences(build(latest.layout));
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKey, preferences);
    },
  });
}
