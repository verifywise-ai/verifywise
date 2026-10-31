import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmUseCaseStillLive,
  getLifecycleSettings,
  getUseCaseLifecycleDashboard,
  getUseCaseLifecycleSummary,
  markUseCaseLive,
  retireUseCase,
  updateLifecycleSettings,
  updateUseCaseDepartment,
} from "../repository/useCaseLifecycle.repository";
import type { ConfirmationIntervalDays } from "../../domain/enums/lifecycleStage.enum";

/** React Query keys for the use case lifecycle (#5187). */
export const useCaseLifecycleKeys = {
  all: ["useCaseLifecycle"] as const,
  summary: () => [...useCaseLifecycleKeys.all, "summary"] as const,
  dashboard: () => [...useCaseLifecycleKeys.all, "dashboard"] as const,
  settings: ["lifecycleSettings"] as const,
};

export function useUseCaseLifecycleSummary() {
  return useQuery({
    queryKey: useCaseLifecycleKeys.summary(),
    queryFn: getUseCaseLifecycleSummary,
    staleTime: 60 * 1000,
  });
}

export function useUseCaseLifecycleDashboard() {
  return useQuery({
    queryKey: useCaseLifecycleKeys.dashboard(),
    queryFn: getUseCaseLifecycleDashboard,
    staleTime: 3 * 60 * 1000,
  });
}

export function useLifecycleSettings() {
  return useQuery({
    queryKey: useCaseLifecycleKeys.settings,
    queryFn: getLifecycleSettings,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Lifecycle actions on one use case. Every success refreshes the lifecycle
 * summary/dashboard and the dashboard payload the use cases list reads.
 */
export function useUseCaseLifecycleActions(projectId: number) {
  const queryClient = useQueryClient();
  const onSuccess = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: useCaseLifecycleKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const goLive = useMutation({
    mutationFn: (goLiveDate: string) => markUseCaseLive(projectId, goLiveDate),
    onSuccess,
  });
  const retire = useMutation({ mutationFn: () => retireUseCase(projectId), onSuccess });
  const confirm = useMutation({ mutationFn: () => confirmUseCaseStillLive(projectId), onSuccess });
  const setDepartment = useMutation({
    mutationFn: (department: string | null) => updateUseCaseDepartment(projectId, department),
    onSuccess,
  });

  return { goLive, retire, confirm, setDepartment };
}

export function useUpdateLifecycleSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: ConfirmationIntervalDays) => updateLifecycleSettings(days),
    onSuccess: async (settings) => {
      queryClient.setQueryData(useCaseLifecycleKeys.settings, settings);
      await queryClient.invalidateQueries({ queryKey: useCaseLifecycleKeys.all });
    },
  });
}
