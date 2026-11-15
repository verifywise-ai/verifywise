import { useMutation, useQuery } from "@tanstack/react-query";
import { recordNoticeView, setNoticeDismissed } from "../repository/changeNotice.repository";

/**
 * Asks the server whether to show a notice. One request per notice per session:
 * the answer is never refetched, because each call can count as a visit.
 */
export function useNoticeView(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["change-notice", id],
    queryFn: () => recordNoticeView(id as string),
    enabled: enabled && id !== null,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Dismisses a notice, or restores it (Undo) with dismissed: false. */
export function useNoticeDismiss() {
  return useMutation({
    mutationFn: ({ id, dismissed }: { id: string; dismissed: boolean }) =>
      setNoticeDismissed(id, dismissed),
  });
}
