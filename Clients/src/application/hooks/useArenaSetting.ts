import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getArenaSetting,
  updateArenaSetting,
  type ArenaSetting,
} from "../repository/deepEval.repository";

export const ARENA_SETTING_KEY = ["llmEvals", "arenaSetting"] as const;

/**
 * Whether LLM Evals Arena is on for the organization. Off by default; on for
 * organizations that already have Arena comparisons until an Admin saves the
 * setting. While loading, or if the request fails, `data` is undefined: callers
 * hide Arena, and show a load error (not "turned off") when `isError`.
 */
export function useArenaSetting() {
  return useQuery<ArenaSetting>({
    queryKey: ARENA_SETTING_KEY,
    queryFn: getArenaSetting,
    // Short, so another Admin's change reaches open tabs quickly.
    staleTime: 30 * 1000,
    retry: 1,
  });
}

/** Admin only: turn Arena on or off; the cached setting is replaced on success. */
export function useUpdateArenaSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => updateArenaSetting(enabled),
    onSuccess: (setting) => {
      queryClient.setQueryData(ARENA_SETTING_KEY, setting);
    },
  });
}
