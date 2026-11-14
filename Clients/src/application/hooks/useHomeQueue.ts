import { useQuery } from "@tanstack/react-query";
import { getHomeQueue } from "../repository/homeQueue.repository";

export const HOME_QUEUE_QUERY_KEY = ["home-queue"] as const;

/**
 * The Home queue. No polling: it refreshes after a minute when the user comes
 * back to the tab, which is enough for items that change on human time.
 */
export function useHomeQueue() {
  return useQuery({
    queryKey: HOME_QUEUE_QUERY_KEY,
    queryFn: getHomeQueue,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
