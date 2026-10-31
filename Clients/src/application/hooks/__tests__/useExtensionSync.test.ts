import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/extensionSync.repository", () => ({
  getExtensionSyncStatus: vi.fn(),
  startExtensionRun: vi.fn(),
  updateExtensionSchedule: vi.fn(),
}));

import { decidePoll, useExtensionSync, type SyncNowOutcome } from "../useExtensionSync";
import {
  getExtensionSyncStatus,
  startExtensionRun,
  updateExtensionSchedule,
  type ExtensionRun,
  type ExtensionSyncStatus,
} from "../../repository/extensionSync.repository";

const run = (over: Partial<ExtensionRun> = {}): ExtensionRun => ({
  id: 41,
  kind: "manual",
  status: "completed",
  code: null,
  counts: {},
  message: null,
  started_at: "2026-10-12T10:00:00Z",
  completed_at: "2026-10-12T10:01:00Z",
  is_live: false,
  ...over,
});
const status = (over: Partial<ExtensionSyncStatus> = {}): ExtensionSyncStatus => ({
  schedule: null,
  running: false,
  queued: false,
  latest_run: null,
  last_finished_run: null,
  ...over,
});

describe("decidePoll", () => {
  it("reports a newer run that finished", () => {
    expect(decidePoll(status({ latest_run: run() }), 40, 0)).toEqual({ next: "done", run: run() });
  });

  it("treats a newer started run that stopped heart-beating as stalled", () => {
    const stuck = run({ status: "started", is_live: false, completed_at: null });
    expect(decidePoll(status({ latest_run: stuck }), 40, 0)).toEqual({ next: "stalled" });
  });

  it("keeps waiting while a newer run is live", () => {
    const live = run({ status: "started", is_live: true, completed_at: null });
    expect(decidePoll(status({ running: true, latest_run: live }), 40, 2)).toEqual({
      next: "wait",
      idlePolls: 0,
    });
  });

  it("keeps waiting, without counting, while the queue state is unknown", () => {
    expect(decidePoll(status({ queued: null, latest_run: run({ id: 40 }) }), 40, 2)).toEqual({
      next: "wait",
      idlePolls: 0,
    });
  });

  it("says not started after three idle polls", () => {
    const idle = status({ latest_run: run({ id: 40 }) });
    expect(decidePoll(idle, 40, 1)).toEqual({ next: "wait", idlePolls: 2 });
    expect(decidePoll(idle, 40, 2)).toEqual({ next: "not_started" });
  });

  it("reports the first run ever when there was none before", () => {
    expect(decidePoll(status({ latest_run: run({ id: 1 }) }), null, 0)).toMatchObject({
      next: "done",
    });
  });
});

describe("useExtensionSync", () => {
  let queryClient: QueryClient;
  let current: ExtensionSyncStatus;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    current = status({
      latest_run: run({ id: 40 }),
      schedule: { enabled: true, interval_hours: 6, consecutive_failures: 0, failing_since: null },
    });
    vi.mocked(getExtensionSyncStatus).mockImplementation(async () => current);
    vi.mocked(startExtensionRun).mockResolvedValue({
      jobId: "ext-sync-jira-assets-5",
      previousRunId: 40,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mount() {
    const hook = renderHook(() => useExtensionSync("jira-assets"), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return hook;
  }

  it("loads the status and the saved schedule", async () => {
    const { result } = await mount();
    expect(result.current.status).toEqual(current);
    expect(result.current.schedule).toEqual({ enabled: true, interval_hours: 6 });
  });

  it("polls every 3 seconds until a newer run finishes", async () => {
    const { result } = await mount();
    let outcome: Promise<SyncNowOutcome> | undefined;
    await act(async () => {
      outcome = result.current.syncNow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isSyncing).toBe(true);

    current = status({
      running: true,
      latest_run: run({ id: 41, status: "started", is_live: true, completed_at: null }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    current = status({ latest_run: run({ id: 41 }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await expect(outcome).resolves.toEqual({ kind: "done", run: run({ id: 41 }) });
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.status?.latest_run?.id).toBe(41);
  });

  it("says the run did not start after three idle polls", async () => {
    const { result } = await mount();
    let outcome: Promise<SyncNowOutcome> | undefined;
    await act(async () => {
      outcome = result.current.syncNow();
      await vi.advanceTimersByTimeAsync(9000);
    });
    await expect(outcome).resolves.toEqual({ kind: "not_started" });
  });

  it("gives up after 20 minutes", async () => {
    current = status({ queued: null, latest_run: run({ id: 40 }) });
    const { result } = await mount();
    let outcome: Promise<SyncNowOutcome> | undefined;
    await act(async () => {
      outcome = result.current.syncNow();
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000 + 3000);
    });
    await expect(outcome).resolves.toEqual({ kind: "timeout" });
  });

  it("stops polling when the panel unmounts", async () => {
    const { result, unmount } = await mount();
    let outcome: Promise<SyncNowOutcome> | undefined;
    await act(async () => {
      outcome = result.current.syncNow();
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsBefore = vi.mocked(getExtensionSyncStatus).mock.calls.length;

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    await expect(outcome).resolves.toEqual({ kind: "unmounted" });
    expect(vi.mocked(getExtensionSyncStatus).mock.calls.length).toBe(callsBefore);
  });

  it("keeps refreshing the status while a run is running or queued, then stops", async () => {
    current = status({
      running: true,
      latest_run: run({ id: 41, status: "started", is_live: true, completed_at: null }),
    });
    await mount();
    const calls = () => vi.mocked(getExtensionSyncStatus).mock.calls.length;
    const afterMount = calls();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(calls()).toBe(afterMount + 1);

    current = status({ latest_run: run({ id: 41 }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const settled = calls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(calls()).toBe(settled);
  });

  it("keeps schedule changes local until the connection is saved", async () => {
    const hook = renderHook(() => useExtensionSync("jira-assets", { persistSchedule: false }), {
      wrapper,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      hook.result.current.setSchedule({ enabled: false, interval_hours: 12 });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateExtensionSchedule).not.toHaveBeenCalled();
    expect(hook.result.current.schedule).toEqual({ enabled: false, interval_hours: 12 });
    expect(hook.result.current.scheduleError).toBe(false);
  });

  it("returns the refusal when the run cannot start", async () => {
    vi.mocked(startExtensionRun).mockRejectedValue({ status: 409 });
    const { result } = await mount();
    let outcome: SyncNowOutcome | undefined;
    await act(async () => {
      outcome = await result.current.syncNow();
    });
    expect(outcome).toEqual({ kind: "refused", error: { status: 409 } });
    expect(result.current.isSyncing).toBe(false);
  });

  it("saves schedule changes in order and reverts with an error when a save fails", async () => {
    vi.mocked(updateExtensionSchedule)
      .mockResolvedValueOnce({
        enabled: false,
        interval_hours: 6,
        consecutive_failures: 0,
        failing_since: null,
      })
      .mockRejectedValueOnce(new Error("500"));
    const { result } = await mount();

    await act(async () => {
      result.current.setSchedule({ enabled: false });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.schedule).toEqual({ enabled: false, interval_hours: 6 });

    await act(async () => {
      result.current.setSchedule({ interval_hours: 12 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(updateExtensionSchedule).toHaveBeenNthCalledWith(1, "jira-assets", { enabled: false });
    expect(updateExtensionSchedule).toHaveBeenNthCalledWith(2, "jira-assets", {
      interval_hours: 12,
    });
    expect(result.current.schedule).toEqual({ enabled: false, interval_hours: 6 });
    expect(result.current.scheduleError).toBe(true);
  });
});
