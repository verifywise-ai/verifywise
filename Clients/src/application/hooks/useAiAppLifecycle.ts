import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmAiAppStillLive,
  getAiAppLifecycle,
  getAiAppLifecycleSummary,
  markAiAppLive,
  retireAiApp,
} from "../repository/aiAppLifecycle.repository";
import { aiAppQueryKeys } from "./useAiApps";

/**
 * AI app lifecycle queries (#5193). Keys sit under aiAppQueryKeys.all, so
 * creating, editing or deleting an AI app refreshes the counts too.
 */
export const aiAppLifecycleKeys = {
  all: aiAppQueryKeys.lifecycle(),
  summary: () => [...aiAppLifecycleKeys.all, "summary"] as const,
  detail: (id: number) => [...aiAppLifecycleKeys.all, "detail", id] as const,
};

export function useAiAppLifecycleSummary() {
  return useQuery({
    queryKey: aiAppLifecycleKeys.summary(),
    queryFn: getAiAppLifecycleSummary,
    staleTime: 60 * 1000,
  });
}

export function useAiAppLifecycle(id: number | null) {
  return useQuery({
    queryKey: aiAppLifecycleKeys.detail(id ?? 0),
    queryFn: () => getAiAppLifecycle(id!),
    enabled: id !== null && id > 0,
  });
}

/** Go live, retire and confirm for one AI app; each refreshes every AI app query. */
export function useAiAppLifecycleActions(id: number) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.all });
  return {
    goLive: useMutation({ mutationFn: (date: string) => markAiAppLive(id, date), onSuccess }),
    retire: useMutation({ mutationFn: () => retireAiApp(id), onSuccess }),
    confirm: useMutation({ mutationFn: () => confirmAiAppStillLive(id), onSuccess }),
  };
}
