import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";
import type {
  ExtensionRun,
  ExtensionSyncStatus,
} from "../../../../application/repository/extensionSync.repository";

const mockUseExtensionSync = vi.fn();
vi.mock("../../../../application/hooks/useExtensionSync", () => ({
  useExtensionSync: (key: string, options: unknown) => mockUseExtensionSync(key, options),
}));
vi.mock("../../../../application/hooks/useFormattedDate", () => ({
  default: () => () => "12-10-2026 10:00",
}));

import ExtensionSyncPanel from "../index";

const run = (over: Partial<ExtensionRun> = {}): ExtensionRun => ({
  id: 41,
  kind: "manual",
  status: "completed",
  code: null,
  counts: { created: 2, updated: 3 },
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
const hookState = (over: Record<string, unknown> = {}) => ({
  status: status(),
  isLoading: false,
  isSyncing: false,
  syncNow: vi.fn(),
  schedule: { enabled: false, interval_hours: 24 },
  setSchedule: vi.fn(),
  scheduleError: false,
  clearScheduleError: vi.fn(),
  ...over,
});
const renderPanel = (props: Record<string, unknown> = {}) =>
  render(
    <ThemeProvider theme={light}>
      <ExtensionSyncPanel extensionKey="jira-assets" canManage {...props} />
    </ThemeProvider>,
  );
/** The automatic sync switch, found by its accessible name. */
const toggle = () =>
  screen.getByRole("switch", { name: "Enable automatic sync" }) as HTMLInputElement;

describe("ExtensionSyncPanel", () => {
  beforeEach(() => mockUseExtensionSync.mockReset());

  it("idle: schedule off, Sync now enabled, no last sync", () => {
    mockUseExtensionSync.mockReturnValue(hookState());
    renderPanel();
    expect(mockUseExtensionSync).toHaveBeenCalledWith("jira-assets", { persistSchedule: true });
    expect(screen.getByText("Enable automatic sync")).toBeInTheDocument();
    expect(toggle()).not.toBeChecked();
    expect(screen.queryByText("Sync interval")).toBeNull();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
    expect(screen.queryByText(/Last sync/)).toBeNull();
    expect(screen.queryByText("Failing since")).toBeNull();
  });

  it("names the switch by its label and describes it by the schedule description", () => {
    mockUseExtensionSync.mockReturnValue(hookState());
    renderPanel({ scheduleDescription: "Runs on the interval below." });
    expect(toggle()).toHaveAccessibleDescription("Runs on the interval below.");
  });

  it("leaves the switch undescribed when there is no schedule description", () => {
    mockUseExtensionSync.mockReturnValue(hookState());
    renderPanel();
    expect(toggle()).not.toHaveAttribute("aria-describedby");
  });

  it("saves the schedule when the label is clicked", () => {
    const state = hookState();
    mockUseExtensionSync.mockReturnValue(state);
    renderPanel();
    fireEvent.click(screen.getByText("Enable automatic sync"));
    expect(state.setSchedule).toHaveBeenCalledWith({ enabled: true });
  });

  it("saves the schedule when the toggle changes", () => {
    const state = hookState();
    mockUseExtensionSync.mockReturnValue(state);
    renderPanel();
    fireEvent.click(toggle());
    expect(state.setSchedule).toHaveBeenCalledWith({ enabled: true });
  });

  it("keeps the schedule local and reports it to the page before a connection is saved", () => {
    const onScheduleChange = vi.fn();
    mockUseExtensionSync.mockReturnValue(
      hookState({ schedule: { enabled: true, interval_hours: 6 } }),
    );
    renderPanel({ persistSchedule: false, onScheduleChange });
    expect(mockUseExtensionSync).toHaveBeenCalledWith("jira-assets", { persistSchedule: false });
    expect(onScheduleChange).toHaveBeenCalledWith({ enabled: true, interval_hours: 6 });
  });

  it.each([
    ["running", { running: true }],
    ["queued", { queued: true }],
  ])("%s: Sync now shows the run and is disabled", (_label, over) => {
    mockUseExtensionSync.mockReturnValue(hookState({ status: status(over) }));
    renderPanel();
    expect(screen.getByRole("button", { name: /Syncing/ })).toBeDisabled();
  });

  it("hides Sync now when the page says so", () => {
    mockUseExtensionSync.mockReturnValue(hookState());
    renderPanel({ showSyncNow: false });
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });

  it("shows the interval when the schedule is on", () => {
    mockUseExtensionSync.mockReturnValue(
      hookState({ schedule: { enabled: true, interval_hours: 6 } }),
    );
    renderPanel();
    expect(screen.getByText("Sync interval")).toBeInTheDocument();
    expect(screen.getByText("Every 6 hours")).toBeInTheDocument();
  });

  it("shows an interval that is not a preset", () => {
    mockUseExtensionSync.mockReturnValue(
      hookState({ schedule: { enabled: true, interval_hours: 72 } }),
    );
    renderPanel();
    expect(screen.getByText("Every 72 hours")).toBeInTheDocument();
  });

  it("failing since: says when scheduled runs started failing", () => {
    mockUseExtensionSync.mockReturnValue(
      hookState({
        status: status({
          schedule: {
            enabled: true,
            interval_hours: 6,
            consecutive_failures: 3,
            failing_since: "2026-10-12T08:00:00Z",
          },
        }),
      }),
    );
    renderPanel();
    expect(screen.getByText("Failing since")).toBeInTheDocument();
  });

  it("failing since: hidden once automatic sync is off", () => {
    mockUseExtensionSync.mockReturnValue(
      hookState({
        status: status({
          schedule: {
            enabled: false,
            interval_hours: 6,
            consecutive_failures: 3,
            failing_since: "2026-10-12T08:00:00Z",
          },
        }),
      }),
    );
    renderPanel();
    expect(screen.queryByText("Failing since")).toBeNull();
  });

  it("last sync: the same line as before, successful or with the run's message", () => {
    mockUseExtensionSync.mockReturnValue(
      hookState({ status: status({ last_finished_run: run() }) }),
    );
    const { unmount } = renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent("Last sync: 12-10-2026 10:00 - Successful");
    unmount();

    mockUseExtensionSync.mockReturnValue(
      hookState({
        status: status({
          last_finished_run: run({ status: "failed", message: "Jira returned 401" }),
        }),
      }),
    );
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Last sync: 12-10-2026 10:00 - Jira returned 401",
    );
  });

  it.each([
    [
      "skipped",
      {
        kind: "done",
        run: run({
          status: "skipped",
          code: "skipped",
          message: "Another sync or import was running, so this sync did not start.",
        }),
      },
      "Another sync or import was running, so this sync did not start.",
    ],
    [
      "abandoned",
      { kind: "done", run: run({ status: "abandoned", code: "abandoned" }) },
      "The sync stopped responding. Try again.",
    ],
    ["stalled", { kind: "stalled" }, "The sync stopped responding. Try again."],
    ["not started", { kind: "not_started" }, "The sync did not start. Try again."],
    [
      "timeout",
      { kind: "timeout" },
      "The sync is taking longer than expected. Check the last sync result later.",
    ],
    [
      "409",
      { kind: "refused", error: { status: 409 } },
      "A sync is already running. Try again when it finishes.",
    ],
    [
      "failed",
      { kind: "done", run: run({ status: "failed", message: "Jira returned 500" }) },
      "Jira returned 500",
    ],
  ])("%s: Sync now reports the outcome", async (_label, outcome, text) => {
    mockUseExtensionSync.mockReturnValue(
      hookState({ syncNow: vi.fn().mockResolvedValue(outcome) }),
    );
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    });
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("completed: describes the run and tells the page", async () => {
    const done = run();
    const onRunCompleted = vi.fn();
    mockUseExtensionSync.mockReturnValue(
      hookState({ syncNow: vi.fn().mockResolvedValue({ kind: "done", run: done }) }),
    );
    renderPanel({
      describeCompletedRun: (r: ExtensionRun) => `Sync completed: ${r.counts.created} created`,
      onRunCompleted,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    });
    expect(await screen.findByText("Sync completed: 2 created")).toBeInTheDocument();
    expect(onRunCompleted).toHaveBeenCalledWith(done);
  });

  it("locks the schedule controls until the saved schedule has loaded", () => {
    mockUseExtensionSync.mockReturnValue(hookState({ isLoading: true, status: null }));
    renderPanel();
    expect(toggle()).toBeDisabled();
  });

  it("keeps the schedule controls locked when the first status request failed", () => {
    mockUseExtensionSync.mockReturnValue(hookState({ isLoading: false, status: null }));
    renderPanel();
    expect(toggle()).toBeDisabled();
  });

  it("non-admins cannot change the schedule or sync", () => {
    mockUseExtensionSync.mockReturnValue(hookState());
    renderPanel({ canManage: false });
    expect(toggle()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });
});
