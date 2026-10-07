import { useEffect, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { RiskLink, RiskLinkStatus } from "../../../domain/interfaces/i.riskLink";
import { fingerprint, PendingJob, POLL_INTERVAL_MS } from "./polling";

/** useRiskLinks and useVendorRiskLinks: same arguments, same result. */
type LinksQueryHook = (
  id: number,
  status: RiskLinkStatus | undefined,
  refetchInterval: number | false,
) => UseQueryResult<RiskLink[]>;

/**
 * A panel's link list plus the bounded wait after it queues a scan or a
 * hierarchy pass. The query polls only while a job is being watched; the watch
 * ends when the list changes (the links are the answer, so the notice clears)
 * or when the window closes first (the notice says what happened).
 *
 * Owns the query because the poll interval depends on the watch and the watch
 * depends on the query's result.
 */
export function useWatchedLinks(
  useLinks: LinksQueryHook,
  id: number,
  showDismissed: boolean,
  setNotice: (notice: string | null) => void,
) {
  const [pending, setPending] = useState<PendingJob | null>(null);
  const query = useLinks(
    id,
    showDismissed ? "dismissed" : undefined,
    pending ? POLL_INTERVAL_MS : false,
  );
  const links = query.data ?? [];

  // Skipped while the other view is open: the fingerprint was taken from the
  // list the job was queued from, so any difference would be the toggle.
  useEffect(() => {
    if (!pending || showDismissed !== pending.dismissedView) return;
    if (fingerprint(links) === pending.before) return;
    setNotice(null);
    setPending(null);
  }, [pending, links, showDismissed, setNotice]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setNotice(pending.timedOut);
      setPending(null);
    }, pending.window);
    return () => clearTimeout(timer);
  }, [pending, setNotice]);

  const watchForResult = (timedOut: string, window: number) =>
    setPending({ before: fingerprint(links), dismissedView: showDismissed, timedOut, window });

  return { ...query, links, isWatching: pending !== null, watchForResult };
}
