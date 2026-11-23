import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData, QueryClient, UseQueryResult } from "@tanstack/react-query";
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
 * Where a research run started on the vendors table leaves the vendor for the Research findings
 * tab to follow. A top-level key of its own, not under VENDOR_RESEARCH_KEY: refreshing the research data
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

/**
 * Calls `onFollow` with the vendor of a run that is started on another screen while this one is
 * open. The start on the vendors table answers some time after the click, and the person may have
 * gone to the findings by then: that section is mounted, and it read its hint (none) when it
 * mounted, so `useFollowedResearchVendor` cannot tell it. The hint is used up as it is heard, so
 * that a visit of its own does not follow it a second time. A hint that was there when the screen
 * mounted is not heard here: it is the vendor the screen starts on.
 *
 * It listens to the cache rather than to a query: `followResearch` removes the entry before it
 * writes it, and an observer of the entry that was removed would not see the new one.
 */
export function useFollowedResearchVendorWhileOpen(onFollow: (vendorId: number) => void): void {
  const queryClient = useQueryClient();
  const latest = useRef(onFollow);
  useEffect(() => {
    latest.current = onFollow;
  });
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type !== "updated" ||
          event.action.type !== "success" ||
          event.query.queryKey[0] !== VENDOR_RESEARCH_FOLLOW_KEY[0]
        ) {
          return;
        }
        const vendorId = event.query.state.data;
        if (typeof vendorId !== "number") return;
        queryClient.removeQueries({ queryKey: VENDOR_RESEARCH_FOLLOW_KEY });
        latest.current(vendorId);
      }),
    [queryClient],
  );
}

/**
 * What a findings list can be asked for: one status, one vendor, how many rows (the server caps it
 * at 200), and from which row on.
 */
interface FindingsFilter {
  status?: FindingStatus;
  vendorId?: number;
  limit?: number;
  offset?: number;
}

const configKey = () => [...VENDOR_RESEARCH_KEY, "config"] as const;
const settingsKey = () => [...VENDOR_RESEARCH_KEY, "settings"] as const;
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
 * at once, and reads the config again, whose `autoRunEnabled` follows the organization's setting.
 * A 404 says a chosen key is gone (another Admin deleted it): the list of keys the person chose
 * from is out of date, so it is read again.
 */
export function useSaveVendorResearchSettings() {
  const queryClient = useQueryClient();
  return useMutation<VendorResearchSettings, APIError, VendorResearchSettings>({
    mutationFn: (settings) => saveVendorResearchSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsKey(), saved);
      void queryClient.invalidateQueries({ queryKey: configKey() });
    },
    onError: (error) => {
      if (error.status === 404) void invalidateLLMKeyQueries(queryClient);
    },
  });
}

/**
 * How many findings wait for a decision, over every vendor: the count beside the Research findings
 * tab. One row is asked for, since only the total is read. `undefined` until it is known and when
 * the first read failed: the tab then shows no count, and says what went wrong when it is opened.
 * A later read that fails leaves the count that was read before.
 *
 * Every decision, and the end of a run that the findings tab is watching, invalidate it with the
 * lists (see `FINDINGS_KEY`). A run can also end while nothing watches it (one that started by
 * itself or by schedule, or from the vendors table), so it is read again when the window gets the
 * focus back and whenever `refreshWhen` changes, which the page sets to the tab that is open.
 */
export function usePendingFindingsCount(refreshWhen?: string): number | undefined {
  const { data, refetch } = useQuery({
    queryKey: [...FINDINGS_KEY, "pendingCount"],
    queryFn: () =>
      listVendorRiskFindings({ status: "pending", limit: 1 }, { suppressGlobalErrorToast: true }),
    select: (result) => result.total,
    refetchOnWindowFocus: true,
  });

  const seen = useRef(refreshWhen);
  useEffect(() => {
    if (seen.current === refreshWhen) return;
    seen.current = refreshWhen;
    void refetch();
  }, [refreshWhen, refetch]);

  return data;
}

/** A findings list read in pages: the first page, and each page that `loadMore` asked for. */
type FindingsPage = { rows: VendorRiskFinding[]; total: number };

/** The ids of the rows of every page, each once. */
const idsHeld = (pages: FindingsPage[]): Set<number> =>
  new Set(pages.flatMap((page) => page.rows.map((row) => row.id)));

/**
 * Whether the pages were read from one and the same list: every page gives the same total, and no
 * finding is on two pages. Pages are read by position (an offset), and the list can change between
 * two of them (another person decides a finding, a run adds findings at the front): then a row is
 * skipped or read twice, and the totals of the pages differ. A change that adds and removes as
 * many rows in front of the next page keeps both the total and the positions, and is not seen;
 * the next refresh of the list (a decision, a finished run) reads it.
 */
const pagesAgree = (pages: FindingsPage[]): boolean => {
  const held = idsHeld(pages);
  const read = pages.reduce((sum, page) => sum + page.rows.length, 0);
  return held.size === read && pages.every((page) => page.total === pages[0].total);
};

/**
 * How many times in a row the pages are read again from the start because they disagree. Each
 * read is a sequence of requests, and a list that keeps changing under them could otherwise keep
 * the section reading for as long as it changes.
 */
const MAX_REREADS_IN_A_ROW = 3;

/**
 * A findings list that can be read past the server's cap of 200 rows: the first page at once, and
 * the next one each time `loadMore()` is called. `data` holds the rows of every page read so far,
 * in order and each finding once, and the total of the latest page. A refresh (a decision, a
 * finished run) reads every page again from the start, so a decided row does not leave a gap at
 * the edge of a page. `loadMore()` does nothing while the list is being read (a refresh, or a page
 * already on its way): a next page asked for then would cancel the refresh and be read from the
 * old pages against the new list. `isFetching` says so, for a control that should look busy.
 *
 * The list can change between two pages without this client deciding anything (another person, a
 * scheduled run). When the pages that were read disagree (see `pagesAgree`), the list is read again
 * from the start, as many pages as were read, so that no row is skipped and none is left on screen
 * that is gone. `hasMore` compares the findings held, each once, with the total, so a finding read
 * twice does not end the paging early.
 *
 * `isError` is about the list, not about a next page that could not be read: the rows read so far
 * stay on screen then, and `loadMore()` asks again. The global error toast reports that failure.
 * The rows stay, too, while the list is read again with rows held (a window focus, a decision, a
 * finished run): the query keeps the status of the failed next page until that read ends, and what
 * it shows is the rows, not the old failure. Only the end of a read that fails is an error.
 */
export function useVendorRiskFindingPages(filter: FindingsFilter) {
  const query = useInfiniteQuery<
    FindingsPage,
    Error,
    InfiniteData<FindingsPage, number>,
    readonly unknown[],
    number
  >({
    queryKey: [...FINDINGS_KEY, "pages", filter],
    // The first page is asked for as before: an offset of 0 is the server's default.
    queryFn: ({ pageParam }) =>
      listVendorRiskFindings(pageParam > 0 ? { ...filter, offset: pageParam } : filter),
    // Read again when the window gets the focus back, as the count beside the tab is: the two must
    // not disagree on one screen.
    refetchOnWindowFocus: true,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      // The next page starts where the server's list was read up to; whether one is left is told by
      // the findings held, each once, against the latest total.
      const read = pages.reduce((sum, page) => sum + page.rows.length, 0);
      return lastPage.rows.length > 0 && idsHeld(pages).size < lastPage.total ? read : undefined;
    },
  });

  const pages = query.data?.pages;
  const data = useMemo<FindingsPage | undefined>(() => {
    if (pages === undefined || pages.length === 0) return undefined;
    const seen = new Set<number>();
    const rows = pages
      .flatMap((page) => page.rows)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
    return { rows, total: pages[pages.length - 1].total };
  }, [pages]);

  const { fetchNextPage, hasNextPage, isFetching, refetch } = query;

  // Pages that disagree are read again from the start, once for each set of pages that was read
  // (a read that fails keeps the pages it had, so it is not asked again by itself), and at most
  // MAX_REREADS_IN_A_ROW times before pages that agree.
  const disagree = pages !== undefined && pages.length > 1 && !pagesAgree(pages);
  const rereadFor = useRef<FindingsPage[] | null>(null);
  const rereadsInARow = useRef(0);
  useEffect(() => {
    if (!disagree) {
      rereadsInARow.current = 0;
      return;
    }
    if (isFetching || pages === undefined || rereadFor.current === pages) return;
    if (rereadsInARow.current >= MAX_REREADS_IN_A_ROW) return;
    rereadFor.current = pages;
    rereadsInARow.current += 1;
    void refetch();
  }, [disagree, isFetching, pages, refetch]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  return {
    data,
    // `isFetchNextPageError` is forgotten as soon as another read starts, while the status stays
    // `error` until it ends, so a read in flight with rows held is not an error either.
    isError: query.isError && !query.isFetchNextPageError && !(isFetching && data !== undefined),
    isFetching,
    refetch,
    hasMore: hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore,
  };
}

const POLL_INTERVAL_MS = 3000;

/**
 * Bounds of the server that the polling windows below are made of, copied by value: the client
 * cannot import the server's code. A test (`useVendorResearch.serverBounds.test.ts`) reads them
 * from the server's source, so a change there fails until it is made here too.
 *
 * - `STALE_RUN_MINUTES` (Servers/utils/vendorResearch.utils.ts): how long a run may stay queued.
 *   A healthy queued run waits for a free place on the worker within it (the scheduled scan queues
 *   no more than the places can begin in that time), and a run still queued after it is failed as
 *   `timed out` by the sweep the next read of the run makes.
 * - `LOOP_LIMITS.stepTimeoutMs` and `LOOP_LIMITS.totalTimeoutMs`
 *   (Servers/services/webResearch/researchLoop.ts): a turn of the model is cut off at the first,
 *   and a search or a read is cut off only by the loop's whole clock, the second.
 */
export const SERVER_STALE_RUN_MINUTES = 15;
export const SERVER_LOOP_STEP_TIMEOUT_MS = 60_000;
export const SERVER_LOOP_TOTAL_TIMEOUT_MS = 300_000;

/**
 * How long a run in its research loop may go without moving before it is given up on, counted
 * from the moment this hook first sees it active, from `restartPolling()`, or from the latest time
 * its progress moved. The loop writes its progress after every search or read, so the longest
 * still stretch of a healthy loop is one turn of the model and the action that follows it, which
 * nothing but the loop's whole clock cuts off (a search of the provider has no deadline of its
 * own). The loop's clock also ends the loop itself, and the analysis writes its progress right
 * after it.
 */
export const TURN_QUIET_MS = SERVER_LOOP_STEP_TIMEOUT_MS + SERVER_LOOP_TOTAL_TIMEOUT_MS;
/**
 * The same for the stretches of a running run in which the server writes no progress at all:
 * before the first turn of the loop (the check of the website, the hints and the gathering, which
 * waits out the GDELT Project's pauses: up to about 4 minutes) and during the analysis (the
 * model's 2 minutes, then the checks of the quotes and the SEC filers: up to about 3 minutes). A
 * running run that has not written its progress yet is in the first of them. Longer than the
 * longest of those stretches, so that a healthy run is followed to its end, and short enough that
 * a stuck one is still given up on.
 */
export const SILENT_PHASE_QUIET_MS = 6 * 60 * 1000;
/**
 * The same for a queued run, which writes nothing while it waits for a place on the worker: as
 * long as the server lets a run stay queued, and a minute more, so that a run the sweep fails is
 * read as failed by a poll instead of being given up on as still queued.
 */
export const QUEUED_QUIET_MS = (SERVER_STALE_RUN_MINUTES + 1) * 60 * 1000;

/** How long the run on screen may stay still, from what it last said it was doing. */
const quietLimitOf = (run: VendorResearchRun | null | undefined): number => {
  if (run?.status === "queued") return QUEUED_QUIET_MS;
  const progress = run?.progress;
  return progress?.phase === "researching" && progress.steps > 0
    ? TURN_QUIET_MS
    : SILENT_PHASE_QUIET_MS;
};

/** The id of a run that is still working, or null. `completed` and `failed` are final. */
const activeRunId = (run: VendorResearchRun | null | undefined): number | null =>
  run && (run.status === "queued" || run.status === "running") ? run.id : null;

/** One polling window: one run of one vendor. */
const windowOf = (vendorId: number | null, runId: number) => `${vendorId}:${runId}`;

/**
 * The vendor's latest run, polled while it is queued or running. The run is a
 * background job, so the answer to "did it finish" is only ever a later fetch.
 *
 * Polling stops once the run has not moved for a while, so a run that never
 * finishes (a stuck worker) does not keep the tab fetching for ever;
 * `pollingStopped` is then true, and the screen should say the run is still
 * going. The window is counted from the latest sign of life, and its length
 * follows what the run last said it was doing: a queued run waits for a place
 * on the worker for up to the server's queued limit (QUEUED_QUIET_MS), the
 * research loop writes its progress after every search or read
 * (TURN_QUIET_MS), and the stretches before the first turn and the analysis
 * write none for minutes (SILENT_PHASE_QUIET_MS). A run that moves from queued
 * to running starts a fresh window. So a run that is working is followed to its
 * end, and only one that has gone quiet for longer than its stretch can take
 * is given up on.
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
 * is first seen, or a different vendor's run, is not that transition. The hook
 * remembers a run it saw active while it looks at another vendor or at none
 * (null), so a run that ends in the meantime still refreshes the lists when its
 * vendor is read again, even after its cached copy has been collected.
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
  // The vendors whose run this hook saw active and has not seen end yet, for the invalidation
  // below. One per vendor, so that looking at another vendor, or at none, in between does not
  // lose the end of a run.
  const vendorsWithActiveRun = useRef(new Set<number>());

  const query = useQuery<VendorResearchRun | null>({
    queryKey: latestKey(vendorId),
    queryFn: vendorId === null ? skipToken : () => getLatestVendorResearch(vendorId),
    refetchInterval: (current) => {
      const runId = activeRunId(current.state.data);
      return runId !== null && windowOf(vendorId, runId) !== endedWindow ? POLL_INTERVAL_MS : false;
    },
    // The app reads next to nothing again on focus (the count beside the Research findings tab and
    // its list are the other exceptions, so that the two agree). A run that is still going is one:
    // its polling may have run out, or been paused in a hidden tab, and the tab coming back is the
    // moment to look. A finished run is final and is left alone.
    refetchOnWindowFocus: (current) => activeRunId(current.state.data) !== null,
  });

  const runId = activeRunId(query.data);
  const currentWindow = runId === null ? null : windowOf(vendorId, runId);
  // When the server last wrote the run's progress. A run that keeps moving is not stuck, so each
  // move starts the window again, and a read that finds a move after the window ran out (the tab
  // came back, or "Check again") starts polling again.
  const progressMark = query.data?.progress?.updatedAt ?? null;
  const quietLimit = quietLimitOf(query.data);
  // A run that leaves the queue has moved, whatever its progress says.
  const runStatus = query.data?.status ?? null;

  useEffect(() => {
    if (currentWindow === null) return;
    const timer = setTimeout(() => setEndedWindow(currentWindow), quietLimit);
    return () => {
      clearTimeout(timer);
      setEndedWindow(null);
    };
  }, [currentWindow, restarts, progressMark, quietLimit, runStatus]);

  const { refetch } = query;
  const restartPolling = useCallback(() => {
    if (currentWindow === null) return;
    setRestarts((count) => count + 1);
    void refetch();
  }, [currentWindow, refetch]);

  const active = currentWindow !== null;
  const finished = query.data?.status === "completed" || query.data?.status === "failed";
  useEffect(() => {
    // No vendor (all vendors are listed, say) or no answer yet: nothing is known of
    // the run, and what was seen before is kept. Forgetting it here would lose the end of a run
    // that finished while nobody was reading it, once its cached copy has been collected.
    if (vendorId === null) return;
    if (active) {
      vendorsWithActiveRun.current.add(vendorId);
      return;
    }
    if (finished && vendorsWithActiveRun.current.delete(vendorId)) {
      void queryClient.invalidateQueries({ queryKey: FINDINGS_KEY });
    }
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
