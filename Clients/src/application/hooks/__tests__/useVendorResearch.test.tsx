import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/vendorResearch.repository", () => ({
  getVendorResearchConfig: vi.fn(),
  listVendorRiskFindings: vi.fn(),
  startVendorResearch: vi.fn(),
  getLatestVendorResearch: vi.fn(),
  acceptVendorRiskFinding: vi.fn(),
  dismissVendorRiskFinding: vi.fn(),
}));

import {
  VENDOR_RESEARCH_KEY,
  useAcceptFinding,
  useDismissFinding,
  useLatestVendorResearch,
  useStartVendorResearch,
  useVendorResearchConfig,
  useVendorRiskFindings,
} from "../useVendorResearch";
import { VENDOR_INSIGHTS_KEY } from "../useRiskLinks";
import { vendorRiskQueryKeys } from "../useVendorRisks";
import { APIError } from "../../tools/error";
import {
  acceptVendorRiskFinding,
  dismissVendorRiskFinding,
  getLatestVendorResearch,
  getVendorResearchConfig,
  listVendorRiskFindings,
  startVendorResearch,
} from "../../repository/vendorResearch.repository";
import type { VendorResearchRun } from "../../../domain/interfaces/i.vendorResearch";

const mockConfig = vi.mocked(getVendorResearchConfig);
const mockList = vi.mocked(listVendorRiskFindings);
const mockStart = vi.mocked(startVendorResearch);
const mockLatest = vi.mocked(getLatestVendorResearch);
const mockAccept = vi.mocked(acceptVendorRiskFinding);
const mockDismiss = vi.mocked(dismissVendorRiskFinding);

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
  error: null,
  started_at: null,
  finished_at: null,
  created_at: "2026-10-10T09:00:00.000Z",
  ...overrides,
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
    const config = { searchConfigured: true, hasLlmKey: true, autoRunEnabled: false };
    mockConfig.mockResolvedValue(config);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useVendorResearchConfig(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(config);
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
