import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
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
  VENDOR_RESEARCH_FOLLOW_KEY,
  VENDOR_RESEARCH_KEY,
  followResearch,
  useAcceptFinding,
  useDismissFinding,
  useFollowedResearchVendor,
  useLatestVendorResearch,
  useSaveVendorResearchSettings,
  useStartVendorResearch,
  useVendorResearchConfig,
  useVendorResearchSettings,
  useVendorRiskFindings,
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
import type { RunProgress, VendorResearchRun } from "../../../domain/interfaces/i.vendorResearch";

const mockConfig = vi.mocked(getVendorResearchConfig);
const mockSettings = vi.mocked(getVendorResearchSettings);
const mockSaveSettings = vi.mocked(saveVendorResearchSettings);
const mockList = vi.mocked(listVendorRiskFindings);
const mockStart = vi.mocked(startVendorResearch);
const mockLatest = vi.mocked(getLatestVendorResearch);
const mockAccept = vi.mocked(acceptVendorRiskFinding);
const mockDismiss = vi.mocked(dismissVendorRiskFinding);

function createHarness(options: { gcTime?: number } = {}) {
  // Like the app's client (application/config/queryClient.ts): a query is not read again just
  // because the tab regained focus, unless the query itself asks for it.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        ...(options.gcTime !== undefined ? { gcTime: options.gcTime } : {}),
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

/** Where a running run is; the mark says when it was written, so another mark is a run that moved. */
const progressAt = (mark: number): RunProgress => ({
  phase: "researching",
  steps: mark,
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
    const config = { hasLlmKey: true, autoRunEnabled: false };
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
    const settings = { researchKeyId: 4, analysisKeyId: null, scanIntervalDays: 14 };
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
    mockSaveSettings.mockResolvedValue({ researchKeyId: 4, analysisKeyId: 9, scanIntervalDays: 7 });
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(SETTINGS_KEY, {
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    const { result } = renderHook(() => useSaveVendorResearchSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ researchKeyId: 4, analysisKeyId: 9, scanIntervalDays: 7 });
    });

    expect(mockSaveSettings).toHaveBeenCalledWith({
      researchKeyId: 4,
      analysisKeyId: 9,
      scanIntervalDays: 7,
    });
    expect(queryClient.getQueryData(SETTINGS_KEY)).toEqual({
      researchKeyId: 4,
      analysisKeyId: 9,
      scanIntervalDays: 7,
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
    });
    queryClient.setQueryData(LLM_KEYS_KEY, []);
    const { result } = renderHook(() => useSaveVendorResearchSettings(), { wrapper });

    act(() => {
      result.current.mutate({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: null });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(refusal);
    expect(queryClient.getQueryData(SETTINGS_KEY)).toEqual({
      researchKeyId: 4,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    expect(queryClient.getQueryState(LLM_KEYS_KEY)?.isInvalidated).toBe(false);
  });

  it("marks the list of LLM keys stale when a key is gone (404), because the list the person chose from is out of date", async () => {
    mockSaveSettings.mockRejectedValue(new APIError("Not Found", 404));
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(LLM_KEYS_KEY, []);
    const { result } = renderHook(() => useSaveVendorResearchSettings(), { wrapper });

    act(() => {
      result.current.mutate({ researchKeyId: 4, analysisKeyId: null, scanIntervalDays: null });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(LLM_KEYS_KEY)?.isInvalidated).toBe(true);
  });
});

describe("useVendorRiskFindings", () => {
  it("requests the findings with the filter, and again when the filter changes", async () => {
    mockList.mockResolvedValue({ rows: [], total: 0 });
    const { wrapper } = createHarness();
    const { rerender, result } = renderHook(
      ({ status }: { status: "pending" | "dismissed" }) => useVendorRiskFindings({ status }),
      { wrapper, initialProps: { status: "pending" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
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
        useVendorRiskFindings({ status: "pending", vendorId: 3, limit }),
      { wrapper, initialProps: { limit: 200 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockList).toHaveBeenLastCalledWith({ status: "pending", vendorId: 3, limit: 200 });

    rerender({ limit: 50 });

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList).toHaveBeenLastCalledWith({ status: "pending", vendorId: 3, limit: 50 });
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

    it("stops polling a run that is still active after 120 seconds, and says so", async () => {
      mockLatest.mockResolvedValue(run({ id: 5, status: "running" }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);

      await advance(119_000);
      expect(result.current.pollingStopped).toBe(false);

      await advance(2_000);
      expect(result.current.pollingStopped).toBe(true);
      expect(result.current.data?.status).toBe("running");

      const callsWhenStopped = mockLatest.mock.calls.length;
      await advance(60_000);
      expect(mockLatest).toHaveBeenCalledTimes(callsWhenStopped);
    });

    it("polls a run for as long as its progress moves: the 120 seconds count from the latest move", async () => {
      let mark = 0;
      mockLatest.mockImplementation(async () =>
        run({ id: 5, status: "running", progress: progressAt(mark) }),
      );
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);

      await advance(100_000);
      expect(result.current.pollingStopped).toBe(false);
      mark = 1; // the run moves, and the next poll reads it
      await advance(3_000);
      await settle();

      // 203 seconds after the run was first seen, but 100 after it last moved.
      await advance(100_000);
      expect(result.current.pollingStopped).toBe(false);

      // Nothing has moved for 125 seconds.
      await advance(25_000);
      expect(result.current.pollingStopped).toBe(true);
    });

    it("does not count a poll that finds the same progress as a move", async () => {
      mockLatest.mockResolvedValue(run({ id: 5, status: "running", progress: progressAt(0) }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);

      await advance(121_000);

      expect(result.current.pollingStopped).toBe(true);
    });

    it("polls again when a read after the window shows that the run has moved", async () => {
      let mark = 0;
      mockLatest.mockImplementation(async () =>
        run({ id: 5, status: "running", progress: progressAt(mark) }),
      );
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);
      await advance(121_000);
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
      mockLatest.mockResolvedValue(run({ id: 5, status: "running" }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);
      await advance(121_000);
      expect(result.current.pollingStopped).toBe(true);

      mockLatest.mockResolvedValue(run({ id: 5, status: "completed" }));
      await act(async () => {
        void result.current.refetch();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.data?.status).toBe("completed");
      expect(result.current.pollingStopped).toBe(false);
    });

    it("polls a new run for a fresh 120 seconds, counted from when it was first seen", async () => {
      mockLatest.mockResolvedValue(run({ id: 5, status: "running" }));
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useLatestVendorResearch(3), { wrapper });
      await advance(0);
      await advance(121_000);
      expect(result.current.pollingStopped).toBe(true);

      mockLatest.mockResolvedValue(run({ id: 6, status: "running" }));
      await act(async () => {
        void result.current.refetch();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data?.id).toBe(6);
      expect(result.current.pollingStopped).toBe(false);

      const callsWhenSeen = mockLatest.mock.calls.length;
      await advance(3_000);
      expect(mockLatest.mock.calls.length).toBeGreaterThan(callsWhenSeen);

      await advance(115_000);
      expect(result.current.pollingStopped).toBe(false);
      await advance(5_000);
      expect(result.current.pollingStopped).toBe(true);
    });

    it("clears pollingStopped when the vendor changes, and polls the new vendor", async () => {
      // The same run id for both vendors, so that only the vendor tells the windows apart.
      mockLatest.mockImplementation(async (vendorId) =>
        run({ id: 7, vendor_id: vendorId, status: "running" }),
      );
      const { wrapper } = createHarness();
      const { rerender, result } = renderHook(
        ({ vendorId }: { vendorId: number }) => useLatestVendorResearch(vendorId),
        { wrapper, initialProps: { vendorId: 1 } },
      );
      await advance(0);
      await advance(121_000);
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
          findings: useVendorRiskFindings({ status: "pending" }),
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
        mockLatest.mockResolvedValue(run({ id: 5, status: "running" }));
        const view = renderWithFindings(3);
        await advance(0);
        await advance(121_000);
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
        await advance(115_000);
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

// A run started on the vendors table is followed on the Risks tab, which is another screen: the
// start leaves a one-shot hint in the query cache for the findings section to pick up.
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
