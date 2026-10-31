import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getExtensionSyncStatus,
  startExtensionRun,
  updateExtensionSchedule,
  type ExtensionRun,
  type ExtensionSyncStatus,
  type SchedulePatch,
} from "../repository/extensionSync.repository";

/** "Sync now" runs in the background; poll its status at this rate, up to the limit. */
export const SYNC_POLL_MS = 3000;
export const SYNC_POLL_LIMIT_MS = 20 * 60 * 1000;
/** Polls with nothing queued, nothing running and no new run before we say it did not start. */
export const NOT_STARTED_AFTER_POLLS = 3;
const DEFAULT_INTERVAL_HOURS = 24;

export type SyncNowOutcome =
  | { kind: "refused"; error: unknown }
  | { kind: "done"; run: ExtensionRun }
  | { kind: "stalled" }
  | { kind: "not_started" }
  | { kind: "timeout" }
  | { kind: "unmounted" };

export interface ScheduleState {
  enabled: boolean;
  interval_hours: number;
}

export type PollStep =
  | { next: "wait"; idlePolls: number }
  | { next: "done"; run: ExtensionRun }
  | { next: "stalled" }
  | { next: "not_started" };

export const extensionSyncStatusKey = (key: string) => ["extension-sync", key, "status"] as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One poll after "Sync now": what the newest status means, given the run seen
 * before the click. A newer run that is no longer `started` is the answer; a
 * newer `started` run that stopped heart-beating has stalled; and if nothing
 * newer appears while nothing is queued or running for three polls, the job
 * never started. `queued: null` (queue state unknown) never counts as idle.
 */
export function decidePoll(
  status: ExtensionSyncStatus | null,
  previousRunId: number | null,
  idlePolls: number,
): PollStep {
  const latest = status?.latest_run ?? null;
  const isNew = !!latest && latest.id !== previousRunId;
  if (latest && isNew && latest.status !== "started") return { next: "done", run: latest };
  if (latest && isNew && !latest.is_live) return { next: "stalled" };
  const idle = !isNew && status?.queued === false && !status?.running;
  const nextIdle = idle ? idlePolls + 1 : 0;
  if (nextIdle >= NOT_STARTED_AFTER_POLLS) return { next: "not_started" };
  return { next: "wait", idlePolls: nextIdle };
}

/**
 * The status query (shared cache). While the server reports a run running or a
 * job queued it refetches every SYNC_POLL_MS, so a scheduled run, or one
 * started from another tab, never leaves the panel showing "Syncing..." after
 * it ends; it stops refetching once nothing is running or queued.
 */
export function useExtensionSyncStatus(key: string) {
  return useQuery({
    queryKey: extensionSyncStatusKey(key),
    queryFn: ({ signal }) => getExtensionSyncStatus(key, signal),
    refetchInterval: (query) =>
      query.state.data?.running || query.state.data?.queued ? SYNC_POLL_MS : false,
  });
}

export interface UseExtensionSyncOptions {
  /**
   * False keeps schedule changes local (no PATCH) and only reports them
   * through `schedule`: for a page whose connection is not saved yet, which
   * sends the schedule with its own save. Default true.
   */
  persistSchedule?: boolean;
}

/**
 * Status, schedule saves and "Sync now" for one extension on the sync engine.
 * Schedule saves run one at a time, in order, each sending only what changed;
 * when the newest settles, the controls show the server's latest answer and an
 * error if any save in that burst failed.
 */
export function useExtensionSync(key: string, options: UseExtensionSyncOptions = {}) {
  const persistSchedule = options.persistSchedule ?? true;
  const queryClient = useQueryClient();
  const statusQuery = useExtensionSyncStatus(key);
  const [isSyncing, setIsSyncing] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);
  const [schedule, setScheduleState] = useState<ScheduleState>({
    enabled: false,
    interval_hours: DEFAULT_INTERVAL_HOURS,
  });
  const savedSchedule = useRef<ScheduleState | null>(null);
  const scheduleQueue = useRef<Promise<void>>(Promise.resolve());
  const scheduleSeq = useRef(0);
  const burstFailed = useRef(false);
  // Unmount flag so the "Sync now" poll loop stops with the panel.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Take the server's schedule once, when the first status arrives.
  const loaded = statusQuery.data;
  useEffect(() => {
    if (!loaded || savedSchedule.current) return;
    const initial = {
      enabled: loaded.schedule?.enabled ?? false,
      interval_hours: loaded.schedule?.interval_hours ?? DEFAULT_INTERVAL_HOURS,
    };
    savedSchedule.current = initial;
    setScheduleState(initial);
  }, [loaded]);

  const setSchedule = useCallback(
    (patch: SchedulePatch) => {
      setScheduleState((prev) => ({ ...prev, ...patch }));
      setScheduleError(false);
      if (!persistSchedule) {
        // Not saved yet: the page sends it; it is also what a failed save reverts to.
        savedSchedule.current = { ...(savedSchedule.current ?? schedule), ...patch };
        return;
      }
      const seq = ++scheduleSeq.current;
      scheduleQueue.current = scheduleQueue.current.then(async () => {
        try {
          const saved = await updateExtensionSchedule(key, patch);
          savedSchedule.current = { enabled: saved.enabled, interval_hours: saved.interval_hours };
          queryClient.setQueryData<ExtensionSyncStatus>(extensionSyncStatusKey(key), (prev) =>
            prev ? { ...prev, schedule: saved } : prev,
          );
        } catch {
          burstFailed.current = true;
        }
        // Only the newest request decides what the controls show.
        if (seq !== scheduleSeq.current || !mountedRef.current) return;
        if (burstFailed.current) {
          if (savedSchedule.current) setScheduleState(savedSchedule.current);
          setScheduleError(true);
        }
        burstFailed.current = false;
      });
    },
    [key, queryClient, persistSchedule, schedule],
  );

  const syncNow = useCallback(async (): Promise<SyncNowOutcome> => {
    setIsSyncing(true);
    let previousRunId: number | null;
    try {
      previousRunId = (await startExtensionRun(key)).previousRunId ?? null;
    } catch (error) {
      setIsSyncing(false);
      return { kind: "refused", error };
    }

    const giveUpAt = Date.now() + SYNC_POLL_LIMIT_MS;
    let idlePolls = 0;
    let outcome: SyncNowOutcome = { kind: "timeout" };
    while (Date.now() < giveUpAt) {
      await sleep(SYNC_POLL_MS);
      if (!mountedRef.current) return { kind: "unmounted" };
      let status: ExtensionSyncStatus;
      try {
        status = await getExtensionSyncStatus(key);
      } catch {
        continue;
      }
      queryClient.setQueryData(extensionSyncStatusKey(key), status);
      const step = decidePoll(status, previousRunId, idlePolls);
      if (step.next === "wait") {
        idlePolls = step.idlePolls;
        continue;
      }
      outcome =
        step.next === "done"
          ? { kind: "done", run: step.run }
          : step.next === "stalled"
            ? { kind: "stalled" }
            : { kind: "not_started" };
      break;
    }
    if (!mountedRef.current) return { kind: "unmounted" };
    setIsSyncing(false);
    return outcome;
  }, [key, queryClient]);

  return {
    status: statusQuery.data ?? null,
    isLoading: statusQuery.isLoading,
    isSyncing,
    syncNow,
    schedule,
    setSchedule,
    scheduleError,
    clearScheduleError: () => setScheduleError(false),
  };
}
