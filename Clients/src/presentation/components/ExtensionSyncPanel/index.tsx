import { useEffect, useId, useState } from "react";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";
import { VWSelect } from "../VWComponents";
import Toggle from "../Inputs/Toggle";
import { CustomizableButton } from "../button/customizable-button";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import {
  useExtensionSync,
  type ScheduleState,
  type SyncNowOutcome,
} from "../../../application/hooks/useExtensionSync";
import type { ExtensionRun } from "../../../application/repository/extensionSync.repository";
import { getApiErrorReason } from "../../../application/utils/apiErrorReason";
import {
  isAbandonedRun,
  isSkippedRun,
  SYNC_RUNNING_MESSAGE,
} from "../../../application/utils/extensionRunOutcome";

export const INTERVAL_PRESETS = [
  { value: 1, label: "Every hour" },
  { value: 6, label: "Every 6 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Every 24 hours" },
  { value: 48, label: "Every 48 hours" },
];

export const SYNC_SLOW_MESSAGE =
  "The sync is taking longer than expected. Check the last sync result later.";
export const SYNC_STALLED_MESSAGE = "The sync stopped responding. Try again.";
export const SYNC_NOT_STARTED_MESSAGE = "The sync did not start. Try again.";
const SYNC_FAILED_MESSAGE = "Sync failed";
const SYNC_COMPLETED_MESSAGE = "Sync completed.";
/** Desktop control height for the panel's button. */
const CONTROL_HEIGHT_SX = { height: "30px", minHeight: "30px" };

type PanelMessage = { type: "success" | "error"; text: string };

/** The presets, plus the stored interval when it is not one (set through the API). */
export function intervalItems(current: number): Array<{ _id: number; name: string }> {
  const items = INTERVAL_PRESETS.map((preset) => ({ _id: preset.value, name: preset.label }));
  if (!INTERVAL_PRESETS.some((preset) => preset.value === current)) {
    items.push({ _id: current, name: `Every ${current} hours` });
    items.sort((a, b) => a._id - b._id);
  }
  return items;
}

/** The message "Sync now" ends with; null when the panel went away mid-poll. */
export function outcomeMessage(
  outcome: SyncNowOutcome,
  describeCompleted: (run: ExtensionRun) => string,
): PanelMessage | null {
  switch (outcome.kind) {
    case "unmounted":
      return null;
    case "refused": {
      const error = outcome.error as { status?: number; message?: string } | null;
      return {
        type: "error",
        text:
          error?.status === 409
            ? SYNC_RUNNING_MESSAGE
            : getApiErrorReason(outcome.error) || error?.message || SYNC_FAILED_MESSAGE,
      };
    }
    case "timeout":
      return { type: "error", text: SYNC_SLOW_MESSAGE };
    case "not_started":
      return { type: "error", text: SYNC_NOT_STARTED_MESSAGE };
    case "stalled":
      return { type: "error", text: SYNC_STALLED_MESSAGE };
    case "done": {
      const { run } = outcome;
      if (isAbandonedRun(run)) return { type: "error", text: SYNC_STALLED_MESSAGE };
      if (isSkippedRun(run)) {
        return { type: "error", text: run.message || SYNC_NOT_STARTED_MESSAGE };
      }
      if (run.status === "completed") return { type: "success", text: describeCompleted(run) };
      return { type: "error", text: run.message || SYNC_FAILED_MESSAGE };
    }
  }
}

export interface ExtensionSyncPanelProps {
  /** extensions.key of an extension with a sync provider. */
  extensionKey: string;
  /** Admins change the schedule and start runs; others see the state only. */
  canManage: boolean;
  scheduleDescription?: string;
  scheduleHelp?: string;
  /** Show "Sync now" (Jira: once a connection and an object type are saved). Default true. */
  showSyncNow?: boolean;
  syncNowDisabled?: boolean;
  /** False before the extension's connection is saved: schedule changes stay a local draft. */
  persistSchedule?: boolean;
  /** Called with the schedule shown, so a page can send a draft with its own save. */
  onScheduleChange?: (schedule: ScheduleState) => void;
  /** The success line for a completed "Sync now" run. */
  describeCompletedRun?: (run: ExtensionRun) => string;
  onRunCompleted?: (run: ExtensionRun) => void;
}

/**
 * The sync section shared by extensions on the sync engine: automatic sync and
 * its interval, the last finished sync, "Failing since" while scheduled runs
 * keep failing, "Sync now" with the running state (a run going or a job
 * queued) and the outcome of the last click.
 */
export function ExtensionSyncPanel({
  extensionKey,
  canManage,
  scheduleDescription,
  scheduleHelp,
  showSyncNow = true,
  syncNowDisabled = false,
  persistSchedule = true,
  onScheduleChange,
  describeCompletedRun = () => SYNC_COMPLETED_MESSAGE,
  onRunCompleted,
}: ExtensionSyncPanelProps) {
  const formatDate = useFormattedDate();
  const sync = useExtensionSync(extensionKey, { persistSchedule });
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const autoSyncId = useId();
  const autoSyncDescriptionId = useId();
  const lastFinished = sync.status?.last_finished_run ?? null;
  // The streak is kept while automatic sync is off, but only means something
  // while it is on.
  const failures = sync.status?.schedule?.enabled
    ? (sync.status.schedule.consecutive_failures ?? 0)
    : 0;
  const failingSince = sync.status?.schedule?.failing_since ?? null;
  const running = sync.isSyncing || !!sync.status?.running || !!sync.status?.queued;
  // Until the saved schedule has loaded, the controls would show defaults, not
  // the real schedule (also when the first status request failed).
  const scheduleLocked = !canManage || !sync.status;

  useEffect(() => {
    onScheduleChange?.(sync.schedule);
  }, [sync.schedule, onScheduleChange]);

  const handleSyncNow = async () => {
    setMessage(null);
    const outcome = await sync.syncNow();
    const next = outcomeMessage(outcome, describeCompletedRun);
    if (next) setMessage(next);
    if (outcome.kind === "done" && outcome.run.status === "completed") {
      onRunCompleted?.(outcome.run);
    }
  };

  return (
    <Box data-testid={`extension-sync-panel-${extensionKey}`}>
      <Stack spacing="20px">
        <Stack direction="row" alignItems="flex-start" gap="12px">
          <Box sx={{ pt: "1px" }}>
            <Toggle
              id={autoSyncId}
              checked={sync.schedule.enabled}
              onChange={(event) => sync.setSchedule({ enabled: event.target.checked })}
              disabled={scheduleLocked}
              slotProps={{
                input: {
                  "aria-describedby": scheduleDescription ? autoSyncDescriptionId : undefined,
                },
              }}
            />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            {/* A real <label> so clicking the caption flips the switch too. */}
            <Typography
              component="label"
              htmlFor={autoSyncId}
              sx={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                cursor: scheduleLocked ? "default" : "pointer",
              }}
              color="text.primary"
            >
              Enable automatic sync
            </Typography>
            {scheduleDescription && (
              <Typography
                id={autoSyncDescriptionId}
                sx={{ fontSize: "12px" }}
                color="text.tertiary"
              >
                {scheduleDescription}
              </Typography>
            )}
          </Box>
        </Stack>

        {sync.schedule.enabled && (
          <Box>
            <VWSelect
              id={`${extensionKey}-sync-interval`}
              label="Sync interval"
              value={sync.schedule.interval_hours}
              onChange={(event) => sync.setSchedule({ interval_hours: Number(event.target.value) })}
              disabled={scheduleLocked}
              items={intervalItems(sync.schedule.interval_hours)}
            />
            {scheduleHelp && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: "4px", display: "block" }}
              >
                {scheduleHelp}
              </Typography>
            )}
          </Box>
        )}

        {sync.scheduleError && (
          <Alert severity="error" sx={{ fontSize: "13px" }} onClose={sync.clearScheduleError}>
            Could not save the sync settings. Try again.
          </Alert>
        )}
      </Stack>

      {failures > 0 && failingSince && (
        <Box sx={{ mt: "16px" }}>
          <Alert severity="warning" sx={{ fontSize: "13px" }}>
            <span>Failing since</span>{" "}
            <span>{formatDate(new Date(failingSince), { includeTime: true })}</span>
          </Alert>
        </Box>
      )}

      {lastFinished?.completed_at && (
        <Box sx={{ mt: "16px" }}>
          <Alert
            severity={
              lastFinished.status === "completed" && !lastFinished.message ? "success" : "warning"
            }
            sx={{ fontSize: "13px" }}
          >
            Last sync: {formatDate(new Date(lastFinished.completed_at), { includeTime: true })} -{" "}
            {lastFinished.status === "completed" ? "Successful" : lastFinished.message}
            {lastFinished.status === "completed" && lastFinished.message && (
              <Box component="span" sx={{ display: "block", mt: "4px" }}>
                {lastFinished.message}
              </Box>
            )}
          </Alert>
        </Box>
      )}

      {showSyncNow && (
        <Box sx={{ mt: "16px" }}>
          <CustomizableButton
            variant="outlined"
            text={running ? "Syncing..." : "Sync now"}
            startIcon={
              running ? <CircularProgress size={14} /> : <RefreshCw size={14} strokeWidth={1.5} />
            }
            onClick={handleSyncNow}
            isDisabled={!canManage || running || syncNowDisabled}
            testId={`${extensionKey}-sync-now`}
            sx={CONTROL_HEIGHT_SX}
          />
        </Box>
      )}

      {message && (
        <Alert
          severity={message.type}
          sx={{ mt: "16px", fontSize: "13px" }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}
    </Box>
  );
}

export default ExtensionSyncPanel;
