import { useCallback, useEffect, useRef, useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, UseQueryResult } from "@tanstack/react-query";
import {
  acceptVendorRiskFinding,
  dismissVendorRiskFinding,
  getLatestVendorResearch,
  getVendorResearchConfig,
  getVendorResearchSettings,
  listVendorRiskFindings,
  saveVendorResearchSettings,
  startVendorResearch,
} from "../repository/vendorResearch.repository";
import { vendorRiskQueryKeys } from "./useVendorRisks";
import { VENDOR_INSIGHTS_KEY } from "./useRiskLinks";
import { invalidateLLMKeyQueries } from "./useLLMKeys";
import type { APIError } from "../tools/error";
import type {
  AcceptFindingBody,
  DismissReason,
  FindingStatus,
  VendorResearchConfig,
  VendorResearchRun,
  VendorResearchSettings,
  VendorRiskFinding,
} from "../../domain/interfaces/i.vendorResearch";

/** Prefix of every vendor research query, for one-call invalidation. */
export const VENDOR_RESEARCH_KEY = ["vendorResearch"] as const;

/** Prefix of every findings list, whatever its filter. */
const FINDINGS_KEY = [...VENDOR_RESEARCH_KEY, "findings"] as const;

/**
 * Where a research run started on the vendors table leaves the vendor for the Risks tab to
 * follow. A top-level key of its own, not under VENDOR_RESEARCH_KEY: refreshing the research data
 * (a decision, a finished run) invalidates that prefix and must not touch the hint.
 */
export const VENDOR_RESEARCH_FOLLOW_KEY = ["vendorResearchFollow"] as const;

/**
 * A run was started for this vendor on a screen that cannot show it finish (the vendors table).
 * The findings section picks the vendor up the next time it is mounted, so that it opens on it
 * and keeps reading the run. Call it after a start the server accepted, and not from the start
 * hook itself, which the findings section uses too.
 *
 * Nothing observes the hint, so the query cache collects it once the app's gcTime has run out.
 * That time is counted from when the cache entry was made, and writing to an entry that exists
 * does not restart it: a second start would inherit what is left of the first one's time. The
 * entry is removed first, so that every start gets a whole lifetime.
 */
export function followResearch(queryClient: QueryClient, vendorId: number): void {
  queryClient.removeQueries({ queryKey: VENDOR_RESEARCH_FOLLOW_KEY });
  queryClient.setQueryData(VENDOR_RESEARCH_FOLLOW_KEY, vendorId);
}

/**
 * The vendor whose run another screen asked to follow, or null. Read once, when the screen
 * mounts, and cleared right after: a hint is for one visit, so the next mount sees none. Reading
 * is pure (it happens in the initial state); the clearing is an effect, so that a render that
 * React throws away does not use the hint up.
 */
export function useFollowedResearchVendor(): number | null {
  const queryClient = useQueryClient();
  const [vendorId] = useState<number | null>(() => {
    const followed = queryClient.getQueryData<number>(VENDOR_RESEARCH_FOLLOW_KEY);
    return typeof followed === "number" ? followed : null;
  });
  useEffect(() => {
    queryClient.removeQueries({ queryKey: VENDOR_RESEARCH_FOLLOW_KEY });
  }, [queryClient]);
  return vendorId;
}

/** What a findings list can be asked for: one status, one vendor, and how many rows (the server caps it at 200). */
interface FindingsFilter {
  status?: FindingStatus;
  vendorId?: number;
  limit?: number;
}

const configKey = () => [...VENDOR_RESEARCH_KEY, "config"] as const;
const settingsKey = () => [...VENDOR_RESEARCH_KEY, "settings"] as const;
const findingsKey = (filter: FindingsFilter) => [...FINDINGS_KEY, filter] as const;
const latestKey = (vendorId: number | null) =>
  [...VENDOR_RESEARCH_KEY, "latest", vendorId] as const;

export function useVendorResearchConfig() {
  return useQuery<VendorResearchConfig>({
    queryKey: configKey(),
    queryFn: getVendorResearchConfig,
    // A failure is not retried by each new observer: the server decides. A reconnect refetches.
    retryOnMount: false,
  });
}

/**
 * The keys an Admin chose for the research. Only an Admin can read them (the server answers
 * everyone else with a 403), so the caller passes `enabled` as false for anyone else. Only the
 * window that edits them reads this, and it is mounted when the person opens it: a failed read is
 * asked again then, and a cached one is read again.
 */
export function useVendorResearchSettings(enabled = true) {
  return useQuery<VendorResearchSettings>({
    queryKey: settingsKey(),
    queryFn: getVendorResearchSettings,
    enabled,
    staleTime: 0,
  });
}

/**
 * Saving puts the choice the server kept into the cache, so that the window opened next reads it
 * at once. A 404 says a chosen key is gone (another Admin deleted it): the list of keys the
 * person chose from is out of date, so it is read again.
 */
export function useSaveVendorResearchSettings() {
  const queryClient = useQueryClient();
  return useMutation<VendorResearchSettings, APIError, VendorResearchSettings>({
    mutationFn: (settings) => saveVendorResearchSettings(settings),
    onSuccess: (saved) => queryClient.setQueryData(settingsKey(), saved),
    onError: (error) => {
      if (error.status === 404) void invalidateLLMKeyQueries(queryClient);
    },
  });
}

/** One status at a time, and one vendor or all of them, as the API takes them. */
export function useVendorRiskFindings(filter: FindingsFilter) {
  return useQuery<{ rows: VendorRiskFinding[]; total: number }>({
    queryKey: findingsKey(filter),
    queryFn: () => listVendorRiskFindings(filter),
  });
}

const POLL_INTERVAL_MS = 3000;
/**
 * How long one run is polled, counted from the moment this hook first sees it active, from
 * `restartPolling()`, or from the latest time its progress moved.
 */
const POLL_WINDOW_MS = 2 * 60 * 1000;

/** The id of a run that is still working, or null. `completed` and `failed` are final. */
const activeRunId = (run: VendorResearchRun | null | undefined): number | null =>
  run && (run.status === "queued" || run.status === "running") ? run.id : null;

/** One polling window: one run of one vendor. */
const windowOf = (vendorId: number | null, runId: number) => `${vendorId}:${runId}`;

/**
 * The vendor's latest run, polled while it is queued or running. The run is a
 * background job, so the answer to "did it finish" is only ever a later fetch.
 *
 * Polling stops after POLL_WINDOW_MS, so a run that never finishes (a stuck
 * worker) does not keep the tab fetching for ever; `pollingStopped` is then
 * true, and the screen should say the run is still going. The window is counted
 * from the latest sign of life: a running run writes its progress at every
 * step, so one that is working keeps the window open and is followed to its
 * end, and only one that has gone quiet for the whole window is given up on.
 * `pollingStopped` goes back to false when the run is no longer active, when a
 * different run shows up, when the vendor changes, when a read finds that the
 * run has moved, and when `restartPolling()` starts a fresh window. Pass null
 * to leave the query off.
 *
 * Two things read the run again after the window: coming back to the tab (the
 * window is a wall-clock timer and TanStack does not poll in a hidden tab, so a
 * run can finish with nobody reading it), and `restartPolling()`, which the
 * screen offers as "Check again": it starts a fresh window for the run on screen
 * and reads it at once. It does nothing while no run is active.
 *
 * When a run this hook saw active turns completed or failed, the findings lists
 * are invalidated once: a run that finishes changes them, and nothing else tells
 * them, so no screen has to repeat this. A run that is already finished when it
 * is first seen, or a different vendor's run, is not that transition.
 */
export function useLatestVendorResearch(
  vendorId: number | null,
): UseQueryResult<VendorResearchRun | null> & {
  pollingStopped: boolean;
  restartPolling: () => void;
} {
  const queryClient = useQueryClient();
  // The window whose time ran out, if any. A window that is not the current one
  // is a leftover, so `pollingStopped` compares instead of trusting the state.
  const [endedWindow, setEndedWindow] = useState<string | null>(null);
  // Counts the restarts, so that the timer below is armed again for the same run.
  const [restarts, setRestarts] = useState(0);
  // The vendor whose active run this hook saw last, for the invalidation below.
  const vendorWithActiveRun = useRef<number | null>(null);

  const query = useQuery<VendorResearchRun | null>({
    queryKey: latestKey(vendorId),
    queryFn: vendorId === null ? skipToken : () => getLatestVendorResearch(vendorId),
    refetchInterval: (current) => {
      const runId = activeRunId(current.state.data);
      return runId !== null && windowOf(vendorId, runId) !== endedWindow ? POLL_INTERVAL_MS : false;
    },
    // The app reads nothing again on focus. A run that is still going is the exception: its
    // polling may have run out, or been paused in a hidden tab, and the tab coming back is the
    // moment to look. A finished run is final and is left alone.
    refetchOnWindowFocus: (current) => activeRunId(current.state.data) !== null,
  });

  const runId = activeRunId(query.data);
  const currentWindow = runId === null ? null : windowOf(vendorId, runId);
  // When the server last wrote the run's progress. A run that keeps moving is not stuck, so each
  // move starts the window again, and a read that finds a move after the window ran out (the tab
  // came back, or "Check again") starts polling again.
  const progressMark = query.data?.progress?.updatedAt ?? null;

  useEffect(() => {
    if (currentWindow === null) return;
    const timer = setTimeout(() => setEndedWindow(currentWindow), POLL_WINDOW_MS);
    return () => {
      clearTimeout(timer);
      setEndedWindow(null);
    };
  }, [currentWindow, restarts, progressMark]);

  const { refetch } = query;
  const restartPolling = useCallback(() => {
    if (currentWindow === null) return;
    setRestarts((count) => count + 1);
    void refetch();
  }, [currentWindow, refetch]);

  const active = currentWindow !== null;
  const finished = query.data?.status === "completed" || query.data?.status === "failed";
  useEffect(() => {
    if (vendorId === null) {
      vendorWithActiveRun.current = null;
      return;
    }
    if (active) {
      vendorWithActiveRun.current = vendorId;
      return;
    }
    if (finished && vendorWithActiveRun.current === vendorId) {
      void queryClient.invalidateQueries({ queryKey: FINDINGS_KEY });
    }
    vendorWithActiveRun.current = null;
  }, [active, finished, vendorId, queryClient]);

  return {
    ...query,
    pollingStopped: currentWindow !== null && currentWindow === endedWindow,
    restartPolling,
  };
}

/**
 * A refusal (409 setting missing, 429 cooldown or daily cap, 503 queue down) is
 * a normal answer: the mutation rejects with the repository's error and the
 * screen reads it with `readVendorResearchError`. The latest run is refreshed on
 * settle either way, because a refusal can mean the screen's copy is out of date.
 */
export function useStartVendorResearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vendorId: number) => startVendorResearch(vendorId),
    onSettled: (_result, _error, vendorId) =>
      queryClient.invalidateQueries({ queryKey: latestKey(vendorId) }),
  });
}

/**
 * onSettled, not onSuccess: a 409 or 404 says the finding was decided already,
 * or is gone, so the list on screen is stale whether or not this call worked.
 * An accepted finding also adds a vendor risk to the register, and that changes
 * what the vendor risk insights report.
 */
export function useAcceptFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AcceptFindingBody }) =>
      acceptVendorRiskFinding(id, body),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: vendorRiskQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY }),
        queryClient.invalidateQueries({ queryKey: VENDOR_INSIGHTS_KEY }),
      ]),
  });
}

/** A dismissal changes nothing in the register, only the research data. */
export function useDismissFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { reason: DismissReason; note?: string | null };
    }) => dismissVendorRiskFinding(id, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY }),
  });
}
