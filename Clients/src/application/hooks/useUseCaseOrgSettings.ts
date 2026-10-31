import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUseCaseOrgSettings,
  updateUseCaseOrgSettings,
  type UseCaseOrgSettings,
  type UseCaseOrgSettingsUpdate,
} from "../repository/useCaseOrgSettings.repository";

export const USE_CASE_ORG_SETTINGS_KEY = ["useCaseOrgSettings"] as const;

/** The organization's defaults for a new use case. */
export function useUseCaseOrgSettings() {
  return useQuery<UseCaseOrgSettings>({
    queryKey: USE_CASE_ORG_SETTINGS_KEY,
    queryFn: getUseCaseOrgSettings,
    staleTime: 5 * 60 * 1000,
  });
}

/** Admin only: change the defaults; the cached copy is replaced on success. */
export function useUpdateUseCaseOrgSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: UseCaseOrgSettingsUpdate) => updateUseCaseOrgSettings(update),
    onSuccess: (settings) => {
      queryClient.setQueryData(USE_CASE_ORG_SETTINGS_KEY, settings);
    },
  });
}
