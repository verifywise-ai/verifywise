import { useRef } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

/**
 * Whether a query is still on its first load for this mount: pending, or this
 * mount's own refetch of stale cached data (so a stale answer is not read as
 * settled). Once this mount has had an answer, later refetches (after an
 * invalidation, on reconnect) keep that answer on screen and report false,
 * even when the mount itself never fetched (it mounted on fresh data).
 *
 * `key` identifies what is being loaded (e.g. the organization): when it
 * changes, the first load starts over. A disabled query is never loading.
 */
export function useSettledLoading(
  query: Pick<UseQueryResult, "isPending" | "isFetching" | "isFetchedAfterMount">,
  enabled: boolean,
  key: unknown,
): boolean {
  const settled = useRef(false);
  const settledKey = useRef(key);
  if (settledKey.current !== key) {
    settledKey.current = key;
    settled.current = false;
  }
  if (!enabled) return false;

  const firstLoad = query.isPending || (query.isFetching && !query.isFetchedAfterMount);
  if (!firstLoad) settled.current = true;
  return !settled.current && firstLoad;
}
