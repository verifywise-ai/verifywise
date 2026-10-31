import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * The sync engine's routes (Servers/routes/extensionRuns.route.ts): runs,
 * status and schedule for any extension with a sync provider.
 */

export type ExtensionRunStatus = "started" | "completed" | "failed" | "abandoned" | "skipped";

export interface ExtensionRun {
  id: number;
  kind: string;
  status: ExtensionRunStatus;
  /** "abandoned", "skipped" or a provider code. */
  code: string | null;
  counts: Record<string, number>;
  message: string | null;
  started_at: string;
  completed_at: string | null;
  is_live: boolean;
}

export interface ExtensionSchedule {
  enabled: boolean;
  interval_hours: number;
  consecutive_failures: number;
  failing_since: string | null;
}

export interface ExtensionSyncStatus {
  schedule: ExtensionSchedule | null;
  running: boolean;
  /** Null when the server could not ask the queue. */
  queued: boolean | null;
  latest_run: ExtensionRun | null;
  last_finished_run: ExtensionRun | null;
}

export interface SchedulePatch {
  enabled?: boolean;
  interval_hours?: number;
}

const base = (key: string) => `/extensions/${encodeURIComponent(key)}`;

export async function getExtensionSyncStatus(
  key: string,
  signal?: AbortSignal,
): Promise<ExtensionSyncStatus> {
  const response = await apiServices.get(`${base(key)}/runs/status`, { signal });
  return (response.data as { data: ExtensionSyncStatus }).data;
}

export async function startExtensionRun(
  key: string,
): Promise<{ jobId: string; previousRunId: number | null }> {
  const response = await apiServices.post(`${base(key)}/runs`, {});
  return (response.data as { data: { jobId: string; previousRunId: number | null } }).data;
}

export async function updateExtensionSchedule(
  key: string,
  patch: SchedulePatch,
): Promise<ExtensionSchedule> {
  const response = await apiServices.patch(`${base(key)}/schedule`, patch);
  return (response.data as { data: ExtensionSchedule }).data;
}
