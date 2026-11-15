import { useQuery } from "@tanstack/react-query";
import { getHomeQueue } from "../repository/homeQueue.repository";

export const HOME_QUEUE_QUERY_KEY = ["home-queue"] as const;

/**
 * The Home queue. No polling: it reloads whenever Home mounts and, after a
 * minute, when the user comes back to the tab. That is enough for items that
 * change on human time.
 */
export function useHomeQueue() {
  return useQuery({
    queryKey: HOME_QUEUE_QUERY_KEY,
    queryFn: getHomeQueue,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // Coming back to Home after finishing an item must not show it from cache.
    refetchOnMount: "always",
  });
}
