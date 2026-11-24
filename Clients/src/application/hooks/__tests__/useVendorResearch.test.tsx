import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager, useQuery } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/vendorResearch.repository", () => ({
  getVendorResearchConfig: vi.fn(),
  getVendorResearchSettings: vi.fn(),
  saveVendorResearchSettings: vi.fn(),
  listVendorRiskFindings: vi.fn(),
  startVendorResearch: vi.fn(),
  getLatestVendorResearch: vi.fn(),
  acceptVendorRiskFinding: vi.fn(),
  dismissVendorRiskFinding: vi.fn(),
}));

import {
  QUEUED_QUIET_MS,
  SERVER_STALE_RUN_MINUTES,
  SILENT_PHASE_QUIET_MS,
  TURN_QUIET_MS,
  VENDOR_RESEARCH_FOLLOW_KEY,
  VENDOR_RESEARCH_KEY,
  followResearch,
  useAcceptFinding,
  useDismissFinding,
  useFollowedResearchVendor,
  useFollowedResearchVendorWhileOpen,
  useLatestVendorResearch,
  useSaveVendorResearchSettings,
  usePendingFindingsCount,
  useStartVendorResearch,
  useVendorResearchConfig,
  useVendorResearchSettings,
  useVendorRiskFindingPages,
} from "../useVendorResearch";
import { VENDOR_INSIGHTS_KEY } from "../useRiskLinks";
import { vendorRiskQueryKeys } from "../useVendorRisks";
import { APIError } from "../../tools/error";
import { queryClient as appQueryClient } from "../../config/queryClient";
import {
  acceptVendorRiskFinding,
  dismissVendorRiskFinding,
  getLatestVendorResearch,
  getVendorResearchConfig,
  getVendorResearchSettings,
  listVendorRiskFindings,
  saveVendorResearchSettings,
  startVendorResearch,
} from "../../repository/vendorResearch.repository";
import type {
  RunProgress,
  VendorResearchRun,
  VendorRiskFinding,
} from "../../../domain/interfaces/i.vendorResearch";

const mockConfig = vi.mocked(getVendorResearchConfig);
const mockSettings = vi.mocked(getVendorResearchSettings);
const mockSaveSettings = vi.mocked(saveVendorResearchSettings);
const mockList = vi.mocked(listVendorRiskFindings);
const mockStart = vi.mocked(startVendorResearch);
const mockLatest = vi.mocked(getLatestVendorResearch);
const mockAccept = vi.mocked(acceptVendorRiskFinding);
const mockDismiss = vi.mocked(dismissVendorRiskFinding);

/**
 * A plain list of the pending findings, under the key family of the real ones, that does not read
 * again on window focus by itself (as a query of the app's client does not). The cases below that
 * count the reads a finished run asks for use it, so that the reads they count are those of the run
 * and not the ones the findings section's own list makes when the window gets the focus back.
 */
function usePendingFindingsProbe() {
  return useQuery({
    queryKey: [...VENDOR_RESEARCH_KEY, "findings", { status: "pending" }],
    queryFn: () => mockList({ status: "pending" }),
  });
}

function createHarness(options: { gcTime?: number; staleTime?: number } = {}) {
  // Like the app's client (application/config/queryClient.ts): a query is not read again just
  // because the tab regained focus, unless the query itself asks for it. `staleTime` is how long
  // a read stays fresh (the app's is 2 seconds, this one's is none unless a case asks for it).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        ...(options.gcTime !== undefined ? { gcTime: options.gcTime } : {}),
        ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
      },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const run = (overrides: Partial<VendorResearchRun> = {}): VendorResearchRun => ({
  id: 5,
  vendor_id: 3,
  status: "running",
  trigger_type: "manual",
  categories: [],
  category_summary: [],
  duplicates_dropped: 0,
  searches_used: 0,
  pages_read: 0,
  error: null,
  progress: null,
  started_at: null,
  finished_at: null,
  created_at: "2026-10-10T09:00:00.000Z",
  ...overrides,
});

/**
 * Where a running run is, in its research loop (a turn of the model or more); the mark says when it
 * was written, so another mark is a run that moved.
 */
const progressAt = (mark: number): RunProgress => ({
  phase: "researching",
  steps: mark + 1,
  action: "search",
  category: "security_incidents",
  searchesUsed: mark,
  pagesRead: 0,
  categories: ["security_incidents"],
  updatedAt: new Date(Date.UTC(2026, 9, 10, 9, 0, mark)).toISOString(),
});

/** Moves the fake clock inside act, so React renders what the timers cause. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/**
 * React Query tells React about a finished fetch from a zero-delay timer. When the
 * fetch was started by a timer (a poll), the fake clock files that timer one
 * millisecond ahead, so the result reaches React one tick after the fetch starts.
 */
const settle = () => advance(1);

beforeEach(() => vi.clearAllMocks());

describe("useVendorResearchConfig", () => {
  it("exposes the server's configuration", async () => {
    const config = { hasLlmKey: true, autoRunAllowed: true, autoRunEnabled: false };
    mockConfig.mockResolvedValue(config);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useVendorResearchConfig(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(config);
  });

  // Every row of the vendors table has its own observer on this one query. A request that failed
  // for good is not asked again by each of them as it mounts (after a sort, a page change or a
  // return to the tab): the server decides, and each ask would end the same way and raise the
  // global error toast again.
  it("does not ask again when another observer mounts after the request failed for good", async () => {
    mockConfig.mockRejectedValue(new APIError("Internal Server Error", 500));
    const { wrapper } = createHarness();
    const first = renderHook(() => useVendorResearchConfig(), { wrapper });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    expect(mockConfig).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useVendorResearchConfig(), { wrapper });

    expect(mockConfig).toHaveBeenCalledTimes(1);
    expect(second.result.current.isError).toBe(true);
    expect(second.result.current.fetchStatus).toBe("idle");
  });
});

describe("useVendorResearchSettings", () => {
  it("exposes the keys and the scan interval an Admin chose", async () => {
    const settings = {
      researchKeyId: 4,
      analysisKeyId: null,
      scanIntervalDays: 14,
      autoResearchOnCreate: true,
    };
    mockSettings.mockResolvedValue(settings);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useVendorResearchSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(settings);
  });

  it("asks for nothing while it is off, because the server answers an Admin only", async () => {
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useVendorResearchSettings(false), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it("asks again when it is mounted again after the request failed, so that closing and opening the window is a retry", async () => {
    mockSettings.mockRejectedValueOnce(new APIError("Internal Server Error", 500));
    mockSettings.mockResolvedValue({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
      autoResearchOnCreate: true,
    });
    const { wrapper } = createHarness();
    const first = renderHook(() => useVendorResearchSettings(), { wrapper });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    first.unmount();

    const second = renderHook(() => useVendorResearchSettings(), { wrapper });

    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(mockSettings).toHaveBeenCalledTimes(2);
  });
});

describe("useSaveVendorResearchSettings", () => {
  const SETTINGS_KEY = [...VENDOR_RESEARCH_KEY, "settings"] as const;
  const LLM_KEYS_KEY = ["llmKeys", 1] as const;

  it("sends the choice and puts what the server kept in the cache, so that the next opening reads it at once", async () => {
    mockSaveSettings.mockResolvedValue({
      researchKeyId: 4,
      analysisKeyId: 9,
      scanIntervalDays: 7,
      autoResearchOnCreate: true,
    });
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(SETTINGS_KEY, {
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
      autoResearchOnCreate: true,
    });
    const { result } = renderHook(() => useSaveVendorResearchSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        researchKeyId: 4,
        analysisKeyId: 9,
        scanIntervalDays: 7,
        autoResearchOnCreate: true,
      });
    });

    expect(mockSaveSettings).toHaveBeenCalledWith({
      researchKeyId: 4,
      analysisKeyId: 9,
      scanIntervalDays: 7,
      autoResearchOnCreate: true,
    });
    expect(queryClient.getQueryData(SETTINGS_KEY)).toEqual({
      researchKeyId: 4,
      analysisKeyId: 9,
      scanIntervalDays: 7,
      autoResearchOnCreate: true,
    });
  });

  it("rejects with the repository's error and leaves the cache as it was", async () => {
    const refusal = new APIError("Internal Server Error", 500);
    mockSaveSettings.mockRejectedValue(refusal);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(SETTINGS_KEY, {
      researchKeyId: 4,
      analysisKeyId: null,
      scanIntervalDays: null,
      autoResearchOnCreate: true,
    });
    queryClient.setQueryData(LLM_KEYS_KEY, []);
    const { result } = renderHook(() => useSaveVendorResearchSettings(), { wrapper });

    act(() => {
      result.current.mutate({
        researchKeyId: null,
        analysisKeyId: null,
        scanIntervalDays: null,
        autoResearchOnCreate: true,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(refusal);
    expect(queryClient.getQueryData(SETTINGS_KEY)).toEqual({
      researchKeyId: 4,
      analysisKeyId: null,
      scanIntervalDays: null,
      autoResearchOnCreate: true,
    });
    expect(queryClient.getQueryState(LLM_KEYS_KEY)?.isInvalidated).toBe(false);
  });

  it("marks the list of LLM keys stale when a key is gone (404), because the list the person chose from is out of date", async () => {
    mockSaveSettings.mockRejectedValue(new APIError("Not Found", 404));
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(LLM_KEYS_KEY, []);
    const { result } = renderHook(() => useSaveVendorResearchSettings(), { wrapper });

    act(() => {
      result.current.mutate({
        researchKeyId: 4,
        analysisKeyId: null,
        scanIntervalDays: null,
        autoResearchOnCreate: true,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(LLM_KEYS_KEY)?.isInvalidated).toBe(true);
  });
});

// What the list is asked for: the filter goes to the repository as it is, and a new filter is a new read.
describe("useVendorRiskFindingPages, the filter it asks with", () => {
  it("requests the findings with the filter, and again when the filter changes", async () => {
    mockList.mockResolvedValue({ rows: [], total: 0 });
    const { wrapper } = createHarness();
    const { rerender, result } = renderHook(
      ({ status }: { status: "pending" | "dismissed" }) => useVendorRiskFindingPages({ status }),
      { wrapper, initialProps: { status: "pending" } },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockList).toHaveBeenLastCalledWith({ status: "pending" });

    rerender({ status: "dismissed" });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList).toHaveBeenLastCalledWith({ status: "dismissed" });
  });

  it("passes the page size on to the repository, and asks again when it changes", async () => {
    mockList.mockResolvedValue({ rows: [], total: 0 });
    const { wrapper } = createHarness();
    const { rerender, result } = renderHook(
      ({ limit }: { limit: number }) =>
        useVendorRiskFindingPages({ status: "pending", vendorId: 3, limit }),
      { wrapper, initialProps: { limit: 200 } },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockList).toHaveBeenLastCalledWith({ status: "pending", vendorId: 3, limit: 200 });

    rerender({ limit: 50 });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList).toHaveBeenLastCalledWith({ status: "pending", vendorId: 3, limit: 50 });
  });
});

describe("useVendorRiskFindingPages", () => {
  const rowsFrom = (first: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: first + index }) as VendorRiskFinding);

  it("reads the first page as a plain list, and the next one from where it ended", async () => {
    mockList
      .mockResolvedValueOnce({ rows: rowsFrom(1, 200), total: 230 })
      .mockResolvedValueOnce({ rows: rowsFrom(201, 30), total: 230 });
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useVendorRiskFindingPages({ status: "pending", vendorId: 3, limit: 200 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.rows).toHaveLength(200));
    expect(mockList).toHaveBeenLastCalledWith({ status: "pending", vendorId: 3, limit: 200 });
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(230));
    expect(mockList).toHaveBeenLastCalledWith({
      status: "pending",
      vendorId: 3,
      limit: 200,
      offset: 200,
    });
    expect(result.current.data?.total).toBe(230);
    expect(result.current.hasMore).toBe(false);
  });

  /**
   * The server's pending list, which the test changes between two pages as another person or a
   * scheduled run would: each answer is read by offset from the list as it is at that moment.
   */
  function serverList(ids: number[]) {
    const list = { ids };
    mockList.mockImplementation(async (filter) => {
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 50;
      return {
        rows: list.ids.slice(offset, offset + limit).map((id) => ({ id }) as VendorRiskFinding),
        total: list.ids.length,
      };
    });
    return list;
  }
  const idsFrom = (first: number, count: number) =>
    Array.from({ length: count }, (_, index) => first + index);
  const shownIds = (result: { current: { data?: { rows: VendorRiskFinding[] } } }) =>
    result.current.data?.rows.map((row) => row.id) ?? [];

  /** Reads pages until the hook offers no more, as a person clicking Load more would. */
  async function loadAll(result: {
    current: { hasMore: boolean; isFetching: boolean; loadMore: () => void };
  }) {
    for (let clicks = 0; clicks < 5 && result.current.hasMore; clicks += 1) {
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.isFetching).toBe(false));
    }
  }

  it("reads the list again from the start when findings were added in front between two pages", async () => {
    const list = serverList(idsFrom(1, 250));
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useVendorRiskFindingPages({ status: "pending", vendorId: 3, limit: 200 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(200));

    // A scheduled run stores 5 findings, which come first.
    list.ids = [...idsFrom(1001, 5), ...list.ids];
    await loadAll(result);
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(255));

    expect(result.current.data?.total).toBe(255);
    expect(shownIds(result)).toEqual(list.ids);
    expect(result.current.hasMore).toBe(false);
  });

  it("reads the list again from the start when a finding was decided elsewhere between two pages", async () => {
    const list = serverList(idsFrom(1, 250));
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useVendorRiskFindingPages({ status: "pending", vendorId: 3, limit: 200 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(200));

    // Another person dismisses finding 1: by offset, finding 201 would be skipped.
    list.ids = list.ids.filter((id) => id !== 1);
    await loadAll(result);
    await waitFor(() => expect(result.current.data?.total).toBe(249));

    expect(shownIds(result)).toEqual(list.ids);
    expect(shownIds(result)).toContain(201);
    expect(shownIds(result)).not.toContain(1);
    expect(result.current.hasMore).toBe(false);
  });

  it("lists a finding once while the list is read again", async () => {
    const list = serverList([1, 2, 3]);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useVendorRiskFindingPages({ limit: 2 }), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    // A run stores finding 9, which comes first: the next page repeats finding 2.
    list.ids = [9, 1, 2, 3];
    act(() => result.current.loadMore());

    await waitFor(() => expect(shownIds(result)).toEqual([9, 1, 2, 3]));
    expect(result.current.hasMore).toBe(false);
  });

  it("stops reading the list again after a few tries when it keeps changing", async () => {
    let calls = 0;
    // Every answer comes from a list that has just grown by one at the front.
    mockList.mockImplementation(async (filter) => {
      calls += 1;
      const ids = [...idsFrom(1000 + calls, 1), ...idsFrom(1, 3)];
      const offset = filter.offset ?? 0;
      return {
        rows: ids.slice(offset, offset + 2).map((id) => ({ id }) as VendorRiskFinding),
        total: ids.length + calls,
      };
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useVendorRiskFindingPages({ limit: 2 }), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    // The first page, the next one, and three reads of the two pages again.
    expect(calls).toBe(2 + 3 * 2);
  });

  it("asks for no next page while the list is being read again, and says it is busy", async () => {
    const list = serverList(idsFrom(1, 230));
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () => useVendorRiskFindingPages({ status: "pending", vendorId: 3, limit: 200 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(200));

    // Finding 1 is accepted here: the list is refreshed, and its answer is held back for a moment.
    list.ids = list.ids.filter((id) => id !== 1);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const answer = mockList.getMockImplementation()!;
    mockList.mockImplementationOnce(async (filter) => {
      await held;
      return answer(filter);
    });
    let refreshed: Promise<unknown> = Promise.resolve();
    act(() => {
      refreshed = queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY });
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    const callsBefore = mockList.mock.calls.length;

    act(() => result.current.loadMore()); // a click on Load more during the refresh

    expect(mockList).toHaveBeenCalledTimes(callsBefore);
    release();
    await act(async () => {
      await refreshed;
    });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(shownIds(result)).not.toContain(1);
    expect(result.current.hasMore).toBe(true);

    await loadAll(result);
    expect(shownIds(result)).toEqual(list.ids);
  });

  it("keeps the rows read so far when a next page cannot be read, and asks again on loadMore", async () => {
    mockList
      .mockResolvedValueOnce({ rows: rowsFrom(1, 2), total: 4 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ rows: rowsFrom(3, 2), total: 4 });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useVendorRiskFindingPages({ limit: 2 }), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.loadMore());
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.rows).toHaveLength(2);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));
  });

  // The failure of a next page is forgotten as soon as another read starts, while the query keeps
  // the status `error` until that read ends: a read of the list again (a window focus, a decision,
  // a finished run) must not turn the rows that are on screen into the error while it runs.
  describe("a list read again after a next page could not be read", () => {
    const failedNextPage = async () => {
      mockList
        .mockResolvedValueOnce({ rows: rowsFrom(1, 2), total: 4 })
        .mockRejectedValueOnce(new Error("offline"));
      const harness = createHarness();
      const hook = renderHook(() => useVendorRiskFindingPages({ limit: 2 }), {
        wrapper: harness.wrapper,
      });
      await waitFor(() => expect(hook.result.current.hasMore).toBe(true));
      act(() => hook.result.current.loadMore());
      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hook.result.current.isLoadingMore).toBe(false));
      // What the screen shows after the failure: the rows, not an error.
      expect(hook.result.current.isError).toBe(false);
      expect(hook.result.current.data?.rows).toHaveLength(2);
      return { ...harness, ...hook };
    };

    it("keeps the rows, and no error, while it is read again, and when that read succeeds", async () => {
      const { queryClient, result } = await failedNextPage();
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      mockList.mockImplementationOnce(async () => {
        await held;
        return { rows: rowsFrom(1, 2), total: 4 };
      });

      let refreshed: Promise<unknown> = Promise.resolve();
      act(() => {
        refreshed = queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY });
      });
      await waitFor(() => expect(result.current.isFetching).toBe(true));

      expect(result.current.isError).toBe(false);
      expect(result.current.data?.rows).toHaveLength(2);

      release();
      await act(async () => {
        await refreshed;
      });
      await waitFor(() => expect(result.current.isFetching).toBe(false));
      expect(result.current.isError).toBe(false);
      expect(result.current.data?.rows).toHaveLength(2);
      expect(result.current.hasMore).toBe(true);
    });

    it("says the list cannot be read only when that read ends in a failure", async () => {
      const { queryClient, result } = await failedNextPage();
      let fail: () => void = () => undefined;
      const held = new Promise<void>((_resolve, reject) => {
        fail = () => reject(new Error("still offline"));
      });
      mockList.mockImplementationOnce(() => held.then(() => ({ rows: [], total: 0 })));

      let refreshed: Promise<unknown> = Promise.resolve();
      act(() => {
        refreshed = queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY });
      });
      await waitFor(() => expect(result.current.isFetching).toBe(true));
      expect(result.current.isError).toBe(false);

      fail();
      await act(async () => {
        await refreshed;
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  it("is refreshed with the other findings lists", async () => {
    mockList.mockResolvedValue({ rows: rowsFrom(1, 1), total: 1 });
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useVendorRiskFindingPages({ status: "pending" }), { wrapper });
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    await act(() => queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY }));

    expect(mockList).toHaveBeenCalledTimes(2);
  });
});

describe("usePendingFindingsCount", () => {
  it("is unknown until the server has answered, then the total over every vendor", async () => {
    mockList.mockResolvedValue({ rows: [], total: 7 });
    const { wrapper } = createHarness();

    const { result } = renderHook(() => usePendingFindingsCount(), { wrapper });

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(7));
  });

  it("asks for one pending finding of any vendor, and keeps the global error toast off", async () => {
    mockList.mockResolvedValue({ rows: [], total: 0 });
    const { wrapper } = createHarness();

    const { result } = renderHook(() => usePendingFindingsCount(), { wrapper });

    await waitFor(() => expect(result.current).toBe(0));
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith(
      { status: "pending", limit: 1 },
      { suppressGlobalErrorToast: true },
    );
  });

  it("is unknown, and does not throw, when the count cannot be read", async () => {
    mockList.mockRejectedValue(new APIError("Failed to fetch the research findings", 500));
    const { queryClient, wrapper } = createHarness();

    const { result } = renderHook(() => usePendingFindingsCount(), { wrapper });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        queryClient.getQueryState([...VENDOR_RESEARCH_KEY, "findings", "pendingCount"])?.status,
      ).toBe("error"),
    );
    expect(result.current).toBeUndefined();
  });

  it("reads the count again when the research data is refreshed", async () => {
    mockList
      .mockResolvedValueOnce({ rows: [], total: 3 })
      .mockResolvedValue({ rows: [], total: 2 });
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => usePendingFindingsCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(3));

    await act(() => queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY }));

    await waitFor(() => expect(result.current).toBe(2));
  });

  it("falls when a finding is accepted", async () => {
    mockList
      .mockResolvedValueOnce({ rows: [], total: 3 })
      .mockResolvedValue({ rows: [], total: 2 });
    mockAccept.mockResolvedValue({ finding: { id: 9 }, vendorRisk: { id: 77 } } as Awaited<
      ReturnType<typeof acceptVendorRiskFinding>
    >);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({ count: usePendingFindingsCount(), accept: useAcceptFinding() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.count).toBe(3));

    await act(async () => {
      await result.current.accept.mutateAsync({ id: 9, body: {} });
    });

    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it("falls when a finding is dismissed", async () => {
    mockList
      .mockResolvedValueOnce({ rows: [], total: 3 })
      .mockResolvedValue({ rows: [], total: 2 });
    mockDismiss.mockResolvedValue({ id: 9, status: "dismissed" } as Awaited<
      ReturnType<typeof dismissVendorRiskFinding>
    >);
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({ count: usePendingFindingsCount(), dismiss: useDismissFinding() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.count).toBe(3));

    await act(async () => {
      await result.current.dismiss.mutateAsync({ id: 9, body: { reason: "inaccurate" } });
    });

    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it("is not read again by a list of one vendor's findings, which has a key of its own", async () => {
    mockList.mockResolvedValue({ rows: [], total: 4 });
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => ({
        count: usePendingFindingsCount(),
        list: useVendorRiskFindingPages({ status: "pending", vendorId: 3 }),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.data).toBeDefined());
    await waitFor(() => expect(result.current.count).toBe(4));
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  // A run can end while nothing watches it (one that started by itself, by schedule, or from the
  // vendors table), and nothing then invalidates the count. The page tells the hook which tab is
  // open, and a change of tab reads the count again.
  describe("reading the count again on its own", () => {
    const renderOnTab = (initial: string, wrapper: ReturnType<typeof createHarness>["wrapper"]) =>
      renderHook(({ tab }: { tab?: string }) => usePendingFindingsCount(tab), {
        wrapper,
        initialProps: { tab: initial } as { tab?: string },
      });

    it("reads it again when the tab it is shown beside changes, and not when it first mounts", async () => {
      mockList
        .mockResolvedValueOnce({ rows: [], total: 1 })
        .mockResolvedValue({ rows: [], total: 5 });
      const { wrapper } = createHarness();
      const { result, rerender } = renderOnTab("1", wrapper);
      await waitFor(() => expect(result.current).toBe(1));
      // Opening the page is one read, not two.
      expect(mockList).toHaveBeenCalledTimes(1);

      rerender({ tab: "3" });

      await waitFor(() => expect(result.current).toBe(5));
      expect(mockList).toHaveBeenCalledTimes(2);
    });

    it("reads it again each time the tab changes", async () => {
      mockList
        .mockResolvedValueOnce({ rows: [], total: 1 })
        .mockResolvedValueOnce({ rows: [], total: 2 })
        .mockResolvedValueOnce({ rows: [], total: 3 })
        .mockResolvedValue({ rows: [], total: 4 });
      const { wrapper } = createHarness();
      const { result, rerender } = renderOnTab("1", wrapper);
      await waitFor(() => expect(result.current).toBe(1));

      rerender({ tab: "2" });
      await waitFor(() => expect(result.current).toBe(2));
      rerender({ tab: "3" });
      await waitFor(() => expect(result.current).toBe(3));
      rerender({ tab: "1" });
      await waitFor(() => expect(result.current).toBe(4));

      expect(mockList).toHaveBeenCalledTimes(4);
    });

    it("does not read it again while the tab stays the same, however often the page renders", async () => {
      mockList.mockResolvedValue({ rows: [], total: 1 });
      const { wrapper } = createHarness();
      const { result, rerender } = renderOnTab("2", wrapper);
      await waitFor(() => expect(result.current).toBe(1));

      rerender({ tab: "2" });
      rerender({ tab: "2" });
      await act(async () => {});

      expect(mockList).toHaveBeenCalledTimes(1);
    });

    it("is read once on mount in strict mode too, where effects run twice", async () => {
      mockList.mockResolvedValue({ rows: [], total: 6 });
      const { queryClient } = createHarness();
      const strictWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(QueryClientProvider, { client: queryClient }, children),
        );
      const { result } = renderHook(() => usePendingFindingsCount("1"), { wrapper: strictWrapper });

      await waitFor(() => expect(result.current).toBe(6));
      await act(async () => {});

      expect(mockList).toHaveBeenCalledTimes(1);
    });

    // A count already in the cache (the page was open before, or another screen read it) is the
    // case the first mount is easiest to get wrong in: an effect that reads "because the tab is
    // given" on mount cancels the read the mount started and starts another when there is data
    // (with nothing cached it would only join the read in flight, which hides the mistake), and
    // reads for nothing when the data is still fresh.
    describe("when the cache already holds a count", () => {
      const COUNT_KEY = [...VENDOR_RESEARCH_KEY, "findings", "pendingCount"];
      const APP_STALE_MS = 2000;
      const strictWrapperOf = (queryClient: QueryClient) =>
        function StrictWrapper({ children }: { children: React.ReactNode }) {
          return React.createElement(
            React.StrictMode,
            null,
            React.createElement(QueryClientProvider, { client: queryClient }, children),
          );
        };
      /** A count of 3 that was read `age` ms ago. */
      const holdCount = (queryClient: QueryClient, age: number) =>
        queryClient.setQueryData(
          COUNT_KEY,
          { rows: [], total: 3 },
          { updatedAt: Date.now() - age },
        );

      it.each([
        ["", false],
        [" in strict mode", true],
      ])(
        "reads a count that went stale once, and shows the old one meanwhile%s",
        async (_label, strict) => {
          let answer!: (value: { rows: []; total: number }) => void;
          mockList.mockReturnValue(
            new Promise((resolve) => {
              answer = resolve;
            }),
          );
          const { queryClient, wrapper } = createHarness({ staleTime: APP_STALE_MS });
          holdCount(queryClient, 60_000);

          const { result } = renderHook(() => usePendingFindingsCount("1"), {
            wrapper: strict ? strictWrapperOf(queryClient) : wrapper,
          });

          expect(result.current).toBe(3);
          await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
          await act(async () => {});
          expect(mockList).toHaveBeenCalledTimes(1);

          await act(async () => answer({ rows: [], total: 9 }));

          await waitFor(() => expect(result.current).toBe(9));
          expect(mockList).toHaveBeenCalledTimes(1);
        },
      );

      it.each([
        ["", false],
        [" in strict mode", true],
      ])("does not read a count that is still fresh at all%s", async (_label, strict) => {
        mockList.mockResolvedValue({ rows: [], total: 9 });
        const { queryClient, wrapper } = createHarness({ staleTime: APP_STALE_MS });
        holdCount(queryClient, 0);

        const { result } = renderHook(() => usePendingFindingsCount("1"), {
          wrapper: strict ? strictWrapperOf(queryClient) : wrapper,
        });
        await act(async () => {});

        expect(result.current).toBe(3);
        expect(mockList).not.toHaveBeenCalled();
      });

      it("reads a fresh count again when the tab changes, which is what the change is for", async () => {
        mockList.mockResolvedValue({ rows: [], total: 9 });
        const { queryClient, wrapper } = createHarness({ staleTime: APP_STALE_MS });
        holdCount(queryClient, 0);
        const { result, rerender } = renderHook(
          ({ tab }: { tab: string }) => usePendingFindingsCount(tab),
          { wrapper, initialProps: { tab: "1" } },
        );
        await act(async () => {});
        expect(mockList).not.toHaveBeenCalled();

        rerender({ tab: "3" });

        await waitFor(() => expect(result.current).toBe(9));
        expect(mockList).toHaveBeenCalledTimes(1);
      });
    });

    it("needs no tab to be given: it then reads again only when the data is refreshed", async () => {
      mockList.mockResolvedValue({ rows: [], total: 2 });
      const { wrapper } = createHarness();
      const { result, rerender } = renderHook(() => usePendingFindingsCount(), { wrapper });
      await waitFor(() => expect(result.current).toBe(2));

      rerender();
      await act(async () => {});

      expect(mockList).toHaveBeenCalledTimes(1);
    });

    describe("when the window gets the focus back", () => {
      afterEach(() => {
        // The focus manager is one object for the whole file: hand it back to the document.
        focusManager.setFocused(undefined);
      });

      const returnToTab = () =>
        act(async () => {
          focusManager.setFocused(false);
          focusManager.setFocused(true);
        });

      it("reads it again, although the app's client does not do that for queries in general", async () => {
        mockList
          .mockResolvedValueOnce({ rows: [], total: 1 })
          .mockResolvedValue({ rows: [], total: 4 });
        const { wrapper } = createHarness();
        const { result } = renderHook(() => usePendingFindingsCount("1"), { wrapper });
        await waitFor(() => expect(result.current).toBe(1));

        await returnToTab();

        await waitFor(() => expect(result.current).toBe(4));
        expect(mockList).toHaveBeenCalledTimes(2);
      });

      // The other side of the opt-in: a query that did not ask is left alone (the app's client does
      // not read queries again on focus in general), which is why the pages hook below asks.
      it("leaves a plain list of one vendor's findings alone, which did not ask to be read again", async () => {
        mockList.mockResolvedValue({ rows: [], total: 1 });
        const { wrapper } = createHarness();
        const { result } = renderHook(
          () => ({
            count: usePendingFindingsCount("1"),
            list: useQuery({
              queryKey: [...VENDOR_RESEARCH_KEY, "findings", { status: "pending", vendorId: 3 }],
              queryFn: () => mockList({ status: "pending", vendorId: 3 }),
            }),
          }),
          { wrapper },
        );
        await waitFor(() => expect(result.current.count).toBe(1));
        await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
        const reads = mockList.mock.calls.length;

        await returnToTab();

        await waitFor(() => expect(mockList.mock.calls.length).toBe(reads + 1));
        await act(async () => {});
        expect(mockList.mock.calls.length).toBe(reads + 1);
      });

      // The badge beside the tab and the list under it are on one screen: whatever brings the
      // badge up to date must bring the list too, or the tab says 8 over a list of 5. The client is
      // the app's (no read on focus in general, a read stays fresh for 2 seconds), and the pending
      // list is the one the section really uses.
      describe("beside the lists the findings section reads", () => {
        const APP_STALE_MS = 2000;
        const VENDOR_THREE = 3;
        let wholeList: number;
        let vendorThreeList: number;

        beforeEach(() => {
          // Only the clock: the cases wait for React Query with the real timers, and the age of a
          // read is told by the date.
          vi.useFakeTimers({ toFake: ["Date"] });
          wholeList = 5;
          vendorThreeList = 2;
          mockList.mockImplementation(async (params) => ({
            rows: [],
            total: params.vendorId === VENDOR_THREE ? vendorThreeList : wholeList,
          }));
        });
        afterEach(() => vi.useRealTimers());

        const renderBeside = () => {
          const { wrapper } = createHarness({ staleTime: APP_STALE_MS });
          return renderHook(
            () => ({
              count: usePendingFindingsCount("1"),
              all: useVendorRiskFindingPages({ status: "pending", limit: 200 }),
              vendor: useVendorRiskFindingPages({
                status: "pending",
                vendorId: VENDOR_THREE,
                limit: 200,
              }),
            }),
            { wrapper },
          );
        };
        const pendingReads = () => mockList.mock.calls.length;
        const waitForFirstReads = async (view: ReturnType<typeof renderBeside>) => {
          await waitFor(() => expect(view.result.current.count).toBe(5));
          await waitFor(() => expect(view.result.current.all.data?.total).toBe(5));
          await waitFor(() => expect(view.result.current.vendor.data?.total).toBe(2));
        };

        it("reads the badge, the whole list and a vendor's list again, so that they agree", async () => {
          const view = renderBeside();
          await waitForFirstReads(view);
          wholeList = 8;
          vendorThreeList = 3;
          act(() => {
            vi.setSystemTime(Date.now() + APP_STALE_MS + 1000);
          });

          await returnToTab();

          await waitFor(() => expect(view.result.current.count).toBe(8));
          await waitFor(() => expect(view.result.current.all.data?.total).toBe(8));
          await waitFor(() => expect(view.result.current.vendor.data?.total).toBe(3));
          expect(view.result.current.count).toBe(view.result.current.all.data?.total);
        });

        it("does not read anything again for a return within the time a read stays fresh", async () => {
          const view = renderBeside();
          await waitForFirstReads(view);
          wholeList = 8;
          const reads = pendingReads();
          act(() => {
            vi.setSystemTime(Date.now() + APP_STALE_MS - 500);
          });

          await returnToTab();
          await act(async () => {});

          expect(pendingReads()).toBe(reads);
          expect(view.result.current.count).toBe(5);
          expect(view.result.current.all.data?.total).toBe(5);
        });
      });
    });
  });
});

describe("useLatestVendorResearch", () => {
  it("is disabled for a null vendor, and fetches once a vendor is given", async () => {
    mockLatest.mockResolvedValue(run());
    const { wrapper } = createHarness();
    const { rerender, result } = renderHook(
      ({ vendorId }: { vendorId: number | null }) => useLatestVendorResearch(vendorId),
      { wrapper, initialProps: { vendorId: null as number | null } },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.pollingStopped).toBe(false);
    expect(mockLatest).not.toHaveBeenCalled();

    rerender({ vendorId: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockLatest).toHaveBeenCalledWith(3);
  });

  it("returns null for a vendor that was never researched", async () => {
    mockLatest.mockResolvedValue(null);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.pollingStopped).toBe(false);
  });

  describe("polling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("refetches every 3000 ms while the run is queued or running", async () => {
      mockLatest
        .mockResolvedValueOnce(run({ status: "queued" }))
        .mockResolvedValueOnce(run({ status: "running" }))
        .mockResolvedValue(run({ status: "running" }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });

      await advance(0);
      expect(result.current.data?.status).toBe("queued");
      expect(mockLatest).toHaveBeenCalledTimes(1);

      await advance(2999);
      expect(mockLatest).toHaveBeenCalledTimes(1);

      await advance(1); // 3000 ms after the first answer
      expect(mockLatest).toHaveBeenCalledTimes(2);
      await settle();
      expect(result.current.data?.status).toBe("running");

      await advance(2999); // 3000 ms after the second answer
      expect(mockLatest).toHaveBeenCalledTimes(3);
      expect(result.current.pollingStopped).toBe(false);
    });

    it.each(["completed", "failed"] as const)(
      "stops polling once the run is %s",
      async (finished) => {
        mockLatest
          .mockResolvedValueOnce(run({ status: "running" }))
          .mockResolvedValue(run({ status: finished }));
        const { wrapper } = createHarness();
        const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
        await advance(0);

        await advance(3000);
        expect(mockLatest).toHaveBeenCalledTimes(2);
        await settle();
        expect(result.current.data?.status).toBe(finished);

        await advance(60_000);
        expect(mockLatest).toHaveBeenCalledTimes(2);
        expect(result.current.pollingStopped).toBe(false);
      },
    );

    it("stops polling a run in its research loop that has not moved for a turn and the action after it, and says so", async () => {
      mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: progressAt(0) }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);

      // A search that the loop's whole clock bounds, longer than a turn of the model: still followed.
      await advance(TURN_QUIET_MS - 1_000);
      expect(result.current.pollingStopped).toBe(false);

      await advance(2_000);
      expect(result.current.pollingStopped).toBe(true);
      expect(result.current.data?.status).toBe("running");

      const callsWhenStopped = mockLatest.mock.calls.length;
      await advance(60_000);
      expect(mockLatest).toHaveBeenCalledTimes(callsWhenStopped);
    });

    it("polls a run for as long as its progress moves: the window counts from the latest move", async () => {
      let mark = 0;
      mockLatest.mockImplementation(async () =>
        run({ id: 5, status: "running", progress: progressAt(mark) }),
      );
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);

      await advance(TURN_QUIET_MS - 20_000);
      expect(result.current.pollingStopped).toBe(false);
      mark = 1; // the run moves, and the next poll reads it
      await advance(3_000);
      await settle();

      // Longer than the window since the run was first seen, but less since it last moved.
      await advance(TURN_QUIET_MS - 20_000);
      expect(result.current.pollingStopped).toBe(false);

      // Nothing has moved for longer than the window.
      await advance(25_000);
      expect(result.current.pollingStopped).toBe(true);
    });

    it("does not count a poll that finds the same progress as a move", async () => {
      mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: progressAt(0) }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);

      await advance(TURN_QUIET_MS + 1_000);

      expect(result.current.pollingStopped).toBe(true);
    });

    // The server writes no progress before the first turn of the loop (the website check, the hints
    // and the gathering, which waits out GDELT's pauses) nor during the analysis and its checks:
    // minutes in which a healthy run does not move. They are not taken for a stuck run.
    describe("in a stretch in which the server writes no progress", () => {
      const silent: Array<[string, Partial<VendorResearchRun>]> = [
        ["running before its first progress", { status: "running", progress: null }],
        [
          "before the first turn of the loop",
          { status: "running", progress: { ...progressAt(0), steps: 0, action: null } },
        ],
        ["analysing", { status: "running", progress: { ...progressAt(4), phase: "analysing" } }],
      ];

      it.each(silent)(
        "keeps polling a run that is %s for 6 minutes without a move",
        async (_name, overrides) => {
          mockLatest.mockResolvedValue(run({ id: 5, ...overrides }));
          const { wrapper } = createHarness();
          const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
          await advance(0);

          await advance(240_000);
          expect(result.current.pollingStopped).toBe(false);
          const calls = mockLatest.mock.calls.length;
          await advance(3_000);
          expect(mockLatest.mock.calls.length).toBeGreaterThan(calls);

          await advance(SILENT_PHASE_QUIET_MS - 245_000); // 358 seconds
          expect(result.current.pollingStopped).toBe(false);
          await advance(5_000); // 363 seconds
          expect(result.current.pollingStopped).toBe(true);
          const callsWhenStopped = mockLatest.mock.calls.length;
          await advance(60_000);
          expect(mockLatest).toHaveBeenCalledTimes(callsWhenStopped);
        },
      );

      it("gives the analysis its longer window once the run moves into it", async () => {
        let progress: RunProgress = progressAt(3);
        mockLatest.mockImplementation(async () => run({ id: 5, status: "running", progress }));
        const { wrapper } = createHarness();
        const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
        await advance(0);

        await advance(60_000);
        progress = { ...progressAt(4), phase: "analysing" }; // the last write before the end
        await advance(3_000);
        await settle();

        // The analysis has been silent for 3 minutes, within its window.
        await advance(180_000);
        expect(result.current.pollingStopped).toBe(false);
        expect(result.current.data?.progress?.phase).toBe("analysing");
      });
    });

    // A queued run writes nothing while it waits for a place on the worker, and a healthy one can
    // wait for the runs ahead of it for as long as the server lets a run stay queued.
    describe("while the run is queued", () => {
      it("keeps polling it for as long as the server lets a run stay queued", async () => {
        mockLatest.mockResolvedValue(run({ id: 5, status: "queued" }));
        const { wrapper } = createHarness();
        const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
        await advance(0);

        // Waiting for a free place behind runs of 7.5 minutes and more: still followed.
        await advance(SERVER_STALE_RUN_MINUTES * 60_000);
        expect(result.current.pollingStopped).toBe(false);
        const calls = mockLatest.mock.calls.length;
        await advance(3_000);
        expect(mockLatest.mock.calls.length).toBeGreaterThan(calls);

        await advance(QUEUED_QUIET_MS - SERVER_STALE_RUN_MINUTES * 60_000);
        expect(result.current.pollingStopped).toBe(true);
        const callsWhenStopped = mockLatest.mock.calls.length;
        await advance(60_000);
        expect(mockLatest).toHaveBeenCalledTimes(callsWhenStopped);
      });

      it("reads a run that the server failed for staying queued too long, and refreshes the findings", async () => {
        mockList.mockResolvedValue({ rows: [], total: 0 });
        mockLatest.mockResolvedValue(run({ id: 5, status: "queued" }));
        const { wrapper } = createHarness();
        const { result } = renderHook(
          () => ({
            latest: useLatestVendorResearch(3),
            findings: usePendingFindingsProbe(),
          }),
          { wrapper },
        );
        await advance(0);
        await advance(SERVER_STALE_RUN_MINUTES * 60_000);

        // The read after the limit runs the server's sweep, which fails the run.
        mockLatest.mockResolvedValue(run({ id: 5, status: "failed", error: "timed out" }));
        await advance(3_000);
        await settle();

        expect(result.current.latest.data?.status).toBe("failed");
        expect(result.current.latest.pollingStopped).toBe(false);
        expect(mockList).toHaveBeenCalledTimes(2);
      });

      it("gives a run that leaves the queue a fresh window of its own", async () => {
        mockLatest.mockResolvedValue(run({ id: 5, status: "queued" }));
        const { wrapper } = createHarness();
        const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
        await advance(0);
        await advance(10 * 60_000);

        // The worker takes it; it has not written its progress yet.
        mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: null }));
        await advance(3_000);
        await settle();
        expect(result.current.data?.status).toBe("running");

        // 11 minutes after the run was first seen, and less than the window of a run that is
        // starting since it left the queue.
        await advance(SILENT_PHASE_QUIET_MS - 10_000);
        expect(result.current.pollingStopped).toBe(false);
        await advance(15_000);
        expect(result.current.pollingStopped).toBe(true);
      });
    });

    it("polls again when a read after the window shows that the run has moved", async () => {
      let mark = 0;
      mockLatest.mockImplementation(async () =>
        run({ id: 5, status: "running", progress: progressAt(mark) }),
      );
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);
      await advance(TURN_QUIET_MS + 1_000);
      expect(result.current.pollingStopped).toBe(true);

      mark = 7;
      await act(async () => {
        void result.current.refetch();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.pollingStopped).toBe(false);
      const callsWhenSeen = mockLatest.mock.calls.length;
      await advance(3_000);
      expect(mockLatest.mock.calls.length).toBeGreaterThan(callsWhenSeen);
    });

    it("clears pollingStopped when a check afterwards finds the run finished", async () => {
      mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: progressAt(0) }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);
      await advance(TURN_QUIET_MS + 1_000);
      expect(result.current.pollingStopped).toBe(true);

      mockLatest.mockResolvedValue(run({ id: 5, status: "completed" }));
      await act(async () => {
        void result.current.refetch();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.data?.status).toBe("completed");
      expect(result.current.pollingStopped).toBe(false);
    });

    it("polls a new run for a fresh window, counted from when it was first seen", async () => {
      mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: progressAt(0) }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);
      await advance(TURN_QUIET_MS + 1_000);
      expect(result.current.pollingStopped).toBe(true);

      mockLatest.mockResolvedValue(run({ id: 6, status: "running", progress: progressAt(0) }));
      await act(async () => {
        void result.current.refetch();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data?.id).toBe(6);
      expect(result.current.pollingStopped).toBe(false);

      const callsWhenSeen = mockLatest.mock.calls.length;
      await advance(3_000);
      expect(mockLatest.mock.calls.length).toBeGreaterThan(callsWhenSeen);

      await advance(TURN_QUIET_MS - 5_000);
      expect(result.current.pollingStopped).toBe(false);
      await advance(5_000);
      expect(result.current.pollingStopped).toBe(true);
    });

    it("clears pollingStopped when the vendor changes, and polls the new vendor", async () => {
      // The same run id for both vendors, so that only the vendor tells the windows apart.
      mockLatest.mockImplementation(async (vendorId) =>
        run({ id: 7, vendor_id: vendorId, status: "running", progress: progressAt(0) }),
      );
      const { wrapper } = createHarness();
      const { rerender, result } = renderHook(
        ({ vendorId }: { vendorId: number }) => useLatestVendorResearch(vendorId),
        { wrapper, initialProps: { vendorId: 1 } },
      );
      await advance(0);
      await advance(TURN_QUIET_MS + 1_000);
      expect(result.current.pollingStopped).toBe(true);

      rerender({ vendorId: 2 });
      await advance(0);
      expect(result.current.pollingStopped).toBe(false);
      expect(mockLatest).toHaveBeenLastCalledWith(2);

      mockLatest.mockClear();
      await advance(3_000);
      expect(mockLatest).toHaveBeenCalledWith(2);
    });
  });

  describe("when a run finishes", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * A vendor's latest run next to the pending findings list its run feeds. The list
     * loads once by itself, so `mockList` has been called once plus once for every
     * refresh that follows.
     */
    function renderWithFindings(vendorId: number) {
      mockList.mockResolvedValue({ rows: [], total: 0 });
      const { wrapper } = createHarness();
      return renderHook(
        ({ vendorId: id }: { vendorId: number }) => ({
          latest: useLatestVendorResearch(id),
          findings: usePendingFindingsProbe(),
        }),
        { wrapper, initialProps: { vendorId } },
      );
    }

    it.each(["completed", "failed"] as const)(
      "refreshes the findings list once when a running run turns %s",
      async (finished) => {
        mockLatest
          .mockResolvedValueOnce(run({ status: "running" }))
          .mockResolvedValue(run({ status: finished }));
        const { result } = renderWithFindings(3);
        await advance(0);
        expect(mockList).toHaveBeenCalledTimes(1);

        await advance(3000);
        await settle();
        expect(result.current.latest.data?.status).toBe(finished);
        expect(mockList).toHaveBeenCalledTimes(2);

        await advance(60_000);
        expect(mockList).toHaveBeenCalledTimes(2);
      },
    );

    it.each(["completed", "failed"] as const)(
      "reads the pending count once more when a running run turns %s",
      async (finished) => {
        mockLatest
          .mockResolvedValueOnce(run({ status: "running" }))
          .mockResolvedValue(run({ status: finished }));
        mockList.mockResolvedValueOnce({ rows: [], total: 1 }).mockResolvedValue({
          rows: [],
          total: 4,
        });
        const { wrapper } = createHarness();
        const { result } = renderHook(
          () => ({ latest: useLatestVendorResearch(3), count: usePendingFindingsCount() }),
          { wrapper },
        );
        await advance(0);
        expect(result.current.count).toBe(1);

        await advance(3000);
        await settle();

        expect(result.current.latest.data?.status).toBe(finished);
        expect(mockList).toHaveBeenCalledTimes(2);
        await settle();
        expect(result.current.count).toBe(4);
      },
    );

    it.each(["completed", "failed"] as const)(
      "leaves the list alone for a run that is already %s when it is first seen",
      async (finished) => {
        mockLatest.mockResolvedValue(run({ status: finished }));
        renderWithFindings(3);

        await advance(0);
        await advance(60_000);

        expect(mockLatest).toHaveBeenCalledTimes(1);
        expect(mockList).toHaveBeenCalledTimes(1);
      },
    );

    it("leaves the list alone while the run only moves from queued to running", async () => {
      mockLatest
        .mockResolvedValueOnce(run({ status: "queued" }))
        .mockResolvedValue(run({ status: "running" }));
      const { result } = renderWithFindings(3);
      await advance(0);

      await advance(3000);
      await settle();
      expect(result.current.latest.data?.status).toBe("running");
      await advance(9000);

      expect(mockLatest.mock.calls.length).toBeGreaterThan(2);
      expect(mockList).toHaveBeenCalledTimes(1);
    });

    it("refreshes the list again when the next run finishes, but not when it starts", async () => {
      mockLatest
        .mockResolvedValueOnce(run({ id: 5, status: "running" }))
        .mockResolvedValue(run({ id: 5, status: "completed" }));
      const { result } = renderWithFindings(3);
      await advance(0);
      await advance(3000);
      await settle();
      expect(mockList).toHaveBeenCalledTimes(2); // run 5 finished

      // The user researches again: the next check finds a new run, queued.
      mockLatest.mockResolvedValue(run({ id: 6, status: "queued" }));
      await act(async () => {
        void result.current.latest.refetch();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.latest.data?.id).toBe(6);
      expect(mockList).toHaveBeenCalledTimes(2); // starting is not finishing

      mockLatest.mockResolvedValue(run({ id: 6, status: "completed" }));
      await advance(3000);
      await settle();
      expect(result.current.latest.data?.status).toBe("completed");
      expect(mockList).toHaveBeenCalledTimes(3); // run 6 finished
    });

    // The findings section stops reading the run while it is folded (the vendor is null then),
    // but its list stays. A run that ends then, while its cached copy is collected, must still
    // refresh the list once the section reads the run again.
    describe("when the run ends while nothing reads it", () => {
      function renderFoldable() {
        mockList.mockResolvedValue({ rows: [], total: 0 });
        // A gcTime of 0 stands for a section folded longer than the app's 10 minutes.
        const { wrapper } = createHarness({ gcTime: 0 });
        return renderHook(
          ({ vendorId: id }: { vendorId: number | null }) => ({
            latest: useLatestVendorResearch(id),
            findings: usePendingFindingsProbe(),
          }),
          { wrapper, initialProps: { vendorId: 3 as number | null } },
        );
      }

      it("refreshes the list when the section reads the run again", async () => {
        mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: progressAt(0) }));
        const { rerender, result } = renderFoldable();
        await advance(0);
        expect(mockList).toHaveBeenCalledTimes(1);

        rerender({ vendorId: null }); // folded
        await advance(1); // its cached run is collected
        mockLatest.mockResolvedValue(run({ id: 5, status: "completed" }));

        rerender({ vendorId: 3 }); // unfolded
        await advance(0);
        await settle();
        expect(result.current.latest.data?.status).toBe("completed");
        expect(mockList).toHaveBeenCalledTimes(2);

        await advance(60_000);
        expect(mockList).toHaveBeenCalledTimes(2);
      });

      it("refreshes the list when the vendor is chosen again after another one", async () => {
        mockLatest.mockImplementation(async (vendorId) =>
          vendorId === 3
            ? run({ id: 5, vendor_id: 3, status: "running", progress: progressAt(0) })
            : run({ id: 8, vendor_id: 4, status: "completed" }),
        );
        const { rerender, result } = renderFoldable();
        await advance(0);

        rerender({ vendorId: 4 });
        await advance(1);
        expect(result.current.latest.data?.id).toBe(8);
        expect(mockList).toHaveBeenCalledTimes(1); // another vendor's run is not this one ending

        mockLatest.mockResolvedValue(run({ id: 5, vendor_id: 3, status: "failed" }));
        rerender({ vendorId: 3 });
        await advance(0);
        await settle();
        expect(result.current.latest.data?.status).toBe("failed");
        expect(mockList).toHaveBeenCalledTimes(2);
      });
    });

    it("does not take a change of vendor for a run finishing", async () => {
      mockLatest.mockImplementation(async (vendorId) =>
        vendorId === 1
          ? run({ id: 5, vendor_id: 1, status: "running" })
          : run({ id: 8, vendor_id: 2, status: "completed" }),
      );
      const { rerender, result } = renderWithFindings(1);
      await advance(0);
      expect(result.current.latest.data?.status).toBe("running");

      rerender({ vendorId: 2 });
      await advance(0);
      expect(result.current.latest.data?.status).toBe("completed");
      await advance(60_000);

      expect(mockList).toHaveBeenCalledTimes(1);
    });

    // The window is a wall-clock timer, and TanStack does not poll in a hidden tab, so a run can
    // finish while nothing is reading it and the window ends. Nothing may then keep saying "still
    // running": coming back to the tab reads the run again, and so can the user.
    describe("after the polling window ended before the run finished", () => {
      afterEach(() => {
        // The focus manager is one object for the whole file: hand it back to the document.
        focusManager.setFocused(undefined);
      });

      /** The tab is left and comes back, the event TanStack Query re-reads active queries on. */
      const returnToTab = async () => {
        await act(async () => {
          focusManager.setFocused(false);
          focusManager.setFocused(true);
          await vi.advanceTimersByTimeAsync(0);
        });
        await settle();
      };

      /** A run that is still going when its window ends, as a long run in a hidden tab is. */
      const renderWithEndedWindow = async () => {
        mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: progressAt(0) }));
        const view = renderWithFindings(3);
        await advance(0);
        await advance(TURN_QUIET_MS + 1_000);
        expect(view.result.current.latest.pollingStopped).toBe(true);
        return view;
      };

      /** Asks the hook to check the run again, as the "Check again" button does. */
      const restart = async (result: { current: { latest: { restartPolling: () => void } } }) => {
        await act(async () => {
          result.current.latest.restartPolling();
          await vi.advanceTimersByTimeAsync(0);
        });
        await settle();
      };

      it.each(["completed", "failed"] as const)(
        "reads the run again when the tab regains focus, and refreshes the findings once it is %s",
        async (finished) => {
          const { result } = await renderWithEndedWindow();
          const readsWhenStopped = mockLatest.mock.calls.length;
          expect(mockList).toHaveBeenCalledTimes(1);

          mockLatest.mockResolvedValue(run({ id: 5, status: finished }));
          await returnToTab();

          expect(mockLatest).toHaveBeenCalledTimes(readsWhenStopped + 1);
          expect(result.current.latest.data?.status).toBe(finished);
          expect(result.current.latest.pollingStopped).toBe(false);
          expect(mockList).toHaveBeenCalledTimes(2);

          await advance(60_000);
          expect(mockList).toHaveBeenCalledTimes(2);
        },
      );

      it("reads a run that is still going again on focus, and keeps saying so", async () => {
        const { result } = await renderWithEndedWindow();
        const readsWhenStopped = mockLatest.mock.calls.length;

        await returnToTab();

        expect(mockLatest).toHaveBeenCalledTimes(readsWhenStopped + 1);
        expect(result.current.latest.data?.status).toBe("running");
        expect(result.current.latest.pollingStopped).toBe(true);
        expect(mockList).toHaveBeenCalledTimes(1);
      });

      it("does not read a run that is finished when the tab regains focus", async () => {
        mockLatest.mockResolvedValue(run({ id: 5, status: "completed" }));
        renderWithFindings(3);
        await advance(0);
        expect(mockLatest).toHaveBeenCalledTimes(1);

        await returnToTab();

        expect(mockLatest).toHaveBeenCalledTimes(1);
        expect(mockList).toHaveBeenCalledTimes(1);
      });

      it("does not read anything on focus for a vendor that was never researched", async () => {
        mockLatest.mockResolvedValue(null);
        renderWithFindings(3);
        await advance(0);
        expect(mockLatest).toHaveBeenCalledTimes(1);

        await returnToTab();

        expect(mockLatest).toHaveBeenCalledTimes(1);
      });

      it("restartPolling reads the run at once and polls it for a fresh window", async () => {
        const { result } = await renderWithEndedWindow();
        const readsWhenStopped = mockLatest.mock.calls.length;

        await restart(result);

        // At once, and polling is on again.
        expect(mockLatest).toHaveBeenCalledTimes(readsWhenStopped + 1);
        expect(result.current.latest.pollingStopped).toBe(false);
        await advance(3_000);
        expect(mockLatest.mock.calls.length).toBeGreaterThan(readsWhenStopped + 1);

        // The window is counted from the restart, not from when the run was first seen.
        await advance(TURN_QUIET_MS - 5_000);
        expect(result.current.latest.pollingStopped).toBe(false);
        await advance(5_000);
        expect(result.current.latest.pollingStopped).toBe(true);
        const readsWhenStoppedAgain = mockLatest.mock.calls.length;
        await advance(60_000);
        expect(mockLatest).toHaveBeenCalledTimes(readsWhenStoppedAgain);
      });

      it("restartPolling shows a run that finished in the meantime, and refreshes the findings once", async () => {
        const { result } = await renderWithEndedWindow();
        expect(mockList).toHaveBeenCalledTimes(1);
        mockLatest.mockResolvedValue(run({ id: 5, status: "completed" }));

        await restart(result);

        expect(result.current.latest.data?.status).toBe("completed");
        expect(result.current.latest.pollingStopped).toBe(false);
        expect(mockList).toHaveBeenCalledTimes(2);
        await advance(60_000);
        expect(mockList).toHaveBeenCalledTimes(2);
      });

      it("restartPolling does nothing when no run is active", async () => {
        mockLatest.mockResolvedValue(run({ id: 5, status: "completed" }));
        const { result } = renderWithFindings(3);
        await advance(0);
        expect(mockLatest).toHaveBeenCalledTimes(1);

        await restart(result);
        await advance(60_000);

        expect(mockLatest).toHaveBeenCalledTimes(1);
        expect(result.current.latest.pollingStopped).toBe(false);
      });

      it("restartPolling does nothing without a vendor", async () => {
        const { wrapper } = createHarness();
        const { result } = renderHook(() => useLatestVendorResearch(null), { wrapper });

        await act(async () => {
          result.current.restartPolling();
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(mockLatest).not.toHaveBeenCalled();
      });
    });
  });
});

describe("useStartVendorResearch", () => {
  it("starts a run for the vendor and refreshes only that vendor's latest run", async () => {
    mockStart.mockResolvedValue({
      run: run({ id: 9, status: "queued" }),
      alreadyRunning: false,
    });
    mockLatest.mockImplementation(async (vendorId) =>
      run({ vendor_id: vendorId, status: "completed" }),
    );
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        three: useLatestVendorResearch(3),
        four: useLatestVendorResearch(4),
        start: useStartVendorResearch(),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.three.isSuccess && result.current.four.isSuccess).toBe(true),
    );
    mockLatest.mockClear();

    await act(async () => {
      await result.current.start.mutateAsync(3);
    });

    expect(mockStart).toHaveBeenCalledWith(3);
    expect(mockLatest.mock.calls).toEqual([[3]]);
  });

  it("rejects with the repository's error, and still refreshes the latest run", async () => {
    const refusal = new APIError("Too Many Requests", 429);
    mockStart.mockRejectedValue(refusal);
    mockLatest.mockResolvedValue(run({ status: "completed" }));
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({ latest: useLatestVendorResearch(3), start: useStartVendorResearch() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.latest.isSuccess).toBe(true));
    mockLatest.mockClear();

    act(() => {
      result.current.start.mutate(3);
    });

    await waitFor(() => expect(result.current.start.isError).toBe(true));
    expect(result.current.start.error).toBe(refusal);
    expect(mockLatest).toHaveBeenCalledWith(3);
  });
});

// A run started on the vendors table is followed on the Research findings tab, which is another
// screen: the start leaves a one-shot hint in the query cache for the findings section to pick up.
describe("following a run started on another screen", () => {
  it("remembers the vendor under a key of its own, which refreshing the research data leaves alone", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData([...VENDOR_RESEARCH_KEY, "config"], {});

    followResearch(queryClient, 3);
    await queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY });

    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBe(3);
    // The control: the same refresh did reach the research data.
    expect(queryClient.getQueryState([...VENDOR_RESEARCH_KEY, "config"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(VENDOR_RESEARCH_FOLLOW_KEY)?.isInvalidated).toBe(false);
  });

  it("gives the vendor to the first screen that asks, and clears it for every later one", () => {
    const { queryClient, wrapper } = createHarness();
    followResearch(queryClient, 3);

    const first = renderHook(() => useFollowedResearchVendor(), { wrapper });

    expect(first.result.current).toBe(3);
    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();
    // The screen keeps the vendor it was given while it stays mounted...
    first.rerender();
    expect(first.result.current).toBe(3);
    // ...but a screen that mounts afterwards is given nothing.
    const second = renderHook(() => useFollowedResearchVendor(), { wrapper });
    expect(second.result.current).toBeNull();
  });

  it("gives nothing when no run was started", () => {
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useFollowedResearchVendor(), { wrapper });

    expect(result.current).toBeNull();
  });

  it("is replaced by the vendor of the latest start", () => {
    const { queryClient, wrapper } = createHarness();
    followResearch(queryClient, 3);
    followResearch(queryClient, 4);

    const { result } = renderHook(() => useFollowedResearchVendor(), { wrapper });

    expect(result.current).toBe(4);
  });

  it("starting a run does not leave a hint by itself", async () => {
    mockStart.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => useStartVendorResearch(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(3);
    });

    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();
  });

  // Nothing observes the hint until the findings section mounts, so the query cache collects it
  // once the app's gcTime has run out. That is how long a start stays followed.
  describe("how long the hint lasts", () => {
    const LIFETIME = appQueryClient.getDefaultOptions().queries?.gcTime as number;
    const hint = (queryClient: QueryClient) => queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY);

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("is collected when its lifetime has run out without another start", () => {
      const { queryClient } = createHarness({ gcTime: LIFETIME });
      followResearch(queryClient, 3);

      vi.advanceTimersByTime(LIFETIME - 1);
      expect(hint(queryClient)).toBe(3);
      vi.advanceTimersByTime(2);
      expect(hint(queryClient)).toBeUndefined();
    });

    it("counts the lifetime from the latest start, not from the first one", () => {
      const { queryClient } = createHarness({ gcTime: LIFETIME });
      followResearch(queryClient, 3);
      // A second start, a second before the first one's time runs out.
      vi.advanceTimersByTime(LIFETIME - 1_000);
      followResearch(queryClient, 4);

      // The first start's time has run out now, and the hint of the second has not.
      vi.advanceTimersByTime(2_000);
      expect(hint(queryClient)).toBe(4);

      // It lasts as long as a first start's would have, counted from the second.
      vi.advanceTimersByTime(LIFETIME - 3_000);
      expect(hint(queryClient)).toBe(4);
      vi.advanceTimersByTime(1_001);
      expect(hint(queryClient)).toBeUndefined();
    });
  });
});

// The start on the vendors table can answer after the person has moved on to the Research findings
// tab: the section is mounted already and read its hint (none) when it mounted. It has to hear of a
// start that comes later, or the run is not followed and the hint is left for a visit of its own.
describe("following a run that is started while the screen is open", () => {
  it("calls back with the vendor of a start that comes after the screen mounted", () => {
    const { queryClient, wrapper } = createHarness();
    const onFollow = vi.fn();
    renderHook(() => useFollowedResearchVendorWhileOpen(onFollow), { wrapper });
    expect(onFollow).not.toHaveBeenCalled();

    act(() => followResearch(queryClient, 3));

    expect(onFollow).toHaveBeenCalledTimes(1);
    expect(onFollow).toHaveBeenCalledWith(3);
  });

  it("uses the hint up, so that a visit that comes later is not sent to the vendor again", () => {
    const { queryClient, wrapper } = createHarness();
    renderHook(() => useFollowedResearchVendorWhileOpen(vi.fn()), { wrapper });

    act(() => followResearch(queryClient, 3));

    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();
    const later = renderHook(() => useFollowedResearchVendor(), { wrapper });
    expect(later.result.current).toBeNull();
  });

  it("calls back for every start, the same vendor again included", () => {
    const { queryClient, wrapper } = createHarness();
    const onFollow = vi.fn();
    renderHook(() => useFollowedResearchVendorWhileOpen(onFollow), { wrapper });

    act(() => followResearch(queryClient, 3));
    act(() => followResearch(queryClient, 4));
    act(() => followResearch(queryClient, 4));

    expect(onFollow.mock.calls).toEqual([[3], [4], [4]]);
  });

  // The hint that was there when the screen mounted is the other hook's: it is the vendor the screen
  // starts on, and is not a start that happened while the screen was open. A listener that was
  // given the hint at mount (by reading the cache when it subscribes) would call back with 3 here.
  it("does not call back for a hint that was there when the screen mounted, and hears the next start", () => {
    const { queryClient, wrapper } = createHarness();
    followResearch(queryClient, 3);
    const onFollow = vi.fn();

    const { result } = renderHook(
      // The listener first: its effect runs before the one that uses the hint up, so a listener that
      // read the cache when it subscribed would see the hint.
      () => ({
        late: useFollowedResearchVendorWhileOpen(onFollow),
        started: useFollowedResearchVendor(),
      }),
      { wrapper },
    );

    expect(result.current.started).toBe(3);
    expect(onFollow).not.toHaveBeenCalled();
    // The screen used the hint up when it mounted. That is not a start for the listener either.
    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();

    act(() => followResearch(queryClient, 4));

    expect(onFollow.mock.calls).toEqual([[4]]);
  });

  it("calls back with the latest function it was given", () => {
    const { queryClient, wrapper } = createHarness();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onFollow }) => useFollowedResearchVendorWhileOpen(onFollow),
      { wrapper, initialProps: { onFollow: first } },
    );

    rerender({ onFollow: second });
    act(() => followResearch(queryClient, 3));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(3);
  });

  it("stops listening when the screen is closed", () => {
    const { queryClient, wrapper } = createHarness();
    const onFollow = vi.fn();
    const { unmount } = renderHook(() => useFollowedResearchVendorWhileOpen(onFollow), {
      wrapper,
    });

    unmount();
    act(() => followResearch(queryClient, 3));

    expect(onFollow).not.toHaveBeenCalled();
    // The hint stays, for the next visit.
    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBe(3);
  });

  it("does not hear of other data that is written to the cache", () => {
    const { queryClient, wrapper } = createHarness();
    const onFollow = vi.fn();
    renderHook(() => useFollowedResearchVendorWhileOpen(onFollow), { wrapper });

    act(() => {
      queryClient.setQueryData([...VENDOR_RESEARCH_KEY, "config"], { hasLlmKey: true });
      queryClient.setQueryData(["somethingElse"], 5);
    });

    expect(onFollow).not.toHaveBeenCalled();
  });
});

describe("deciding a finding", () => {
  const FINDINGS_KEY = [...VENDOR_RESEARCH_KEY, "findings", { status: "pending" }] as const;
  const REGISTER_KEY = vendorRiskQueryKeys.list({ filter: "active" });
  const INSIGHTS_KEY = [...VENDOR_INSIGHTS_KEY, "exposure"] as const;
  const UNRELATED_KEY = ["policies"] as const;

  /** Puts something under each key a decision might refresh, and under one it must not. */
  function seed(queryClient: QueryClient) {
    queryClient.setQueryData(FINDINGS_KEY, { rows: [], total: 0 });
    queryClient.setQueryData(REGISTER_KEY, []);
    queryClient.setQueryData(INSIGHTS_KEY, {});
    queryClient.setQueryData(UNRELATED_KEY, []);
  }

  const staleKeys = (queryClient: QueryClient) =>
    [FINDINGS_KEY, REGISTER_KEY, INSIGHTS_KEY, UNRELATED_KEY].filter(
      (key) => queryClient.getQueryState(key)?.isInvalidated,
    );

  it("accepting sends the owner and marks the research data, the register and the insights stale", async () => {
    const accepted = { finding: { id: 9 }, vendorRisk: { id: 77 } } as Awaited<
      ReturnType<typeof acceptVendorRiskFinding>
    >;
    mockAccept.mockResolvedValue(accepted);
    const { queryClient, wrapper } = createHarness();
    seed(queryClient);
    const { result } = renderHook(() => useAcceptFinding(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 9, body: { action_owner: 4 } })).resolves.toBe(
        accepted,
      );
    });

    expect(mockAccept).toHaveBeenCalledWith(9, { action_owner: 4 });
    expect(staleKeys(queryClient)).toEqual([FINDINGS_KEY, REGISTER_KEY, INSIGHTS_KEY]);
  });

  it("marks the same data stale when the finding was already decided (409)", async () => {
    mockAccept.mockRejectedValue(new APIError("The finding is already accepted.", 409));
    const { queryClient, wrapper } = createHarness();
    seed(queryClient);
    const { result } = renderHook(() => useAcceptFinding(), { wrapper });

    act(() => {
      result.current.mutate({ id: 9, body: {} });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(staleKeys(queryClient)).toEqual([FINDINGS_KEY, REGISTER_KEY, INSIGHTS_KEY]);
  });

  it("dismissing sends the reason and note and marks only the research data stale", async () => {
    const dismissed = { id: 9, status: "dismissed" } as Awaited<
      ReturnType<typeof dismissVendorRiskFinding>
    >;
    mockDismiss.mockResolvedValue(dismissed);
    const { queryClient, wrapper } = createHarness();
    seed(queryClient);
    const { result } = renderHook(() => useDismissFinding(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 9, body: { reason: "inaccurate", note: "Wrong vendor" } }),
      ).resolves.toBe(dismissed);
    });

    expect(mockDismiss).toHaveBeenCalledWith(9, { reason: "inaccurate", note: "Wrong vendor" });
    expect(staleKeys(queryClient)).toEqual([FINDINGS_KEY]);
  });
});
