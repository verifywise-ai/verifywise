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
 * Pass `enabled: false` to skip the request (it needs the EvalServer) until
 * the caller is about to show Arena; `data` stays undefined meanwhile.
 * Pass `silent: true` where a failure only hides Arena (the unified sidebar
 * away from /evals), so an EvalServer outage shows no error toast there.
 */
export function useArenaSetting({
  enabled = true,
  silent = false,
}: { enabled?: boolean; silent?: boolean } = {}) {
  return useQuery<ArenaSetting>({
    queryKey: ARENA_SETTING_KEY,
    queryFn: () => getArenaSetting({ silent }),
    enabled,
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
