import logger, { logStructured } from "../../utils/logger/fileLogger";
import {
  type ExtensionSyncJobData,
  enqueueExtensionSyncRun,
} from "../../services/automations/automationProducer";
import {
  claimRun,
  closeStaleRunsForProvider,
  createRunContext,
  recordSkippedRun,
  runClaimed,
} from "./claim";
import { SyncInProgressError, SyncNotReadyError } from "./errors";
import { registerAllSyncProviders } from "./providers";
import { getSyncProvider, listSyncProviders } from "./registry";
import { findDueRuns } from "./schedule";
import { hasLiveRun, latestStatusRunId } from "./status";
import { EXTENSION_KEY_PATTERN, SyncProvider } from "./types";

registerAllSyncProviders();

const fileName = "jobs.ts";

export const EXTENSION_SYNC_TICK_JOB = "extension_sync_tick";
export const EXTENSION_SYNC_RUN_JOB = "extension_sync_run";
/** Pre-engine Jira Assets job names, accepted for one release so queued jobs still run. */
export const LEGACY_JIRA_CHECK_JOB = "jira_assets_scheduled_sync_check";
export const LEGACY_JIRA_RUN_JOB = "jira_assets_sync_run";

const JOB_NAMES = new Set([
  EXTENSION_SYNC_TICK_JOB,
  EXTENSION_SYNC_RUN_JOB,
  LEGACY_JIRA_CHECK_JOB,
  LEGACY_JIRA_RUN_JOB,
]);

export function isExtensionSyncJob(name: string): boolean {
  return JOB_NAMES.has(name);
}

export interface TickSummary {
  candidates: number;
  queued: number;
  alreadyQueued: number;
  notReady: number;
  failed: number;
}

/**
 * The 5-minute tick. For each provider with a schedule, one SQL query finds
 * the due orgs; each due org that is ready gets one queued run (the worker
 * claims it at pickup). A not-ready org records and logs nothing. An error for
 * one org is logged and the loop moves on.
 */
export async function runExtensionSyncTick(): Promise<TickSummary> {
  const summary: TickSummary = {
    candidates: 0,
    queued: 0,
    alreadyQueued: 0,
    notReady: 0,
    failed: 0,
  };
  for (const provider of listSyncProviders()) {
    const kind = provider.scheduledKind;
    if (!kind) continue;
    try {
      await closeStaleRunsForProvider(provider);
    } catch (error) {
      // Not fatal: claimRun closes stale runs too, one tick later.
      logger.error(`Extension sync tick: stale-run sweep failed for ${provider.key}:`, error);
    }
    let due: Array<{ organization_id: number }>;
    try {
      due = await findDueRuns(provider);
    } catch (error) {
      summary.failed++;
      logStructured(
        "error",
        `Due query failed for ${provider.key}`,
        "runExtensionSyncTick",
        fileName,
      );
      logger.error(`Extension sync tick: due query failed for ${provider.key}:`, error);
      continue;
    }
    summary.candidates += due.length;
    for (const row of due) {
      const orgId = Number(row.organization_id);
      if (!Number.isInteger(orgId) || orgId <= 0) continue;
      try {
        const readiness = await provider.readiness(orgId, kind);
        if (!readiness.ready) {
          summary.notReady++;
          continue;
        }
        const { jobId, queued } = await enqueueExtensionSyncRun({
          key: provider.key,
          orgId,
          kind,
          triggeredBy: null,
          payload: null,
        });
        if (!queued) {
          summary.alreadyQueued++;
          continue;
        }
        summary.queued++;
        logger.info(`Extension sync ${provider.key} org ${orgId}: queued job ${jobId}`);
      } catch (error) {
        summary.failed++;
        logStructured(
          "error",
          `Scheduled ${provider.key} run could not be queued for org ${orgId}`,
          "runExtensionSyncTick",
          fileName,
        );
        logger.error(`Extension sync tick: ${provider.key} org ${orgId} failed:`, error);
      }
    }
  }
  return summary;
}

/**
 * Validate an `extension_sync_run` payload. Fails closed without a valid key,
 * org or kind (only "manual" and the provider's scheduled kind are queued),
 * because guessing could turn a refresh-only run into one that creates.
 * Nothing is claimed yet, so there is no row to close. An invalid triggeredBy
 * only loses attribution.
 */
export function parseRunJobData(data: unknown): {
  provider: SyncProvider;
  orgId: number;
  kind: string;
  triggeredBy: number | null;
  payload: unknown;
} {
  const d = (data ?? {}) as Partial<Record<keyof ExtensionSyncJobData, unknown>>;
  if (typeof d.key !== "string" || !EXTENSION_KEY_PATTERN.test(d.key)) {
    throw new Error("extension_sync_run: key missing or invalid");
  }
  const orgId = Number(d.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error("extension_sync_run: orgId missing or invalid");
  }
  const provider = getSyncProvider(d.key);
  const kind = d.kind;
  if (typeof kind !== "string" || (kind !== "manual" && kind !== provider.scheduledKind)) {
    throw new Error("extension_sync_run: kind missing or invalid");
  }
  let triggeredBy: number | null = Number(d.triggeredBy);
  if (!Number.isInteger(triggeredBy) || triggeredBy <= 0) {
    if (d.triggeredBy !== null && d.triggeredBy !== undefined) {
      logger.warn(`extension_sync_run ${d.key} org ${orgId}: invalid triggeredBy, using none`);
    }
    triggeredBy = null;
  }
  return { provider, orgId, kind, triggeredBy, payload: d.payload ?? null };
}

/**
 * Worker entry for `extension_sync_run`. The run is claimed here, at pickup.
 * If another run holds the claim, a manual job records a `skipped` row (a user
 * is waiting on "Sync now") and a scheduled job records nothing. Enablement is
 * not checked at pickup.
 */
export async function runExtensionSyncJob(data: unknown): Promise<"ran" | "skipped"> {
  const job = parseRunJobData(data);
  const { key } = job.provider;
  let run;
  try {
    run = await claimRun(key, job.orgId, job.kind, job.triggeredBy);
  } catch (err) {
    if (err instanceof SyncInProgressError) {
      logger.info(`extension_sync_run ${key} org ${job.orgId}: skipped, another run is live`);
      if (job.kind === "manual") {
        await recordSkippedRun(key, job.orgId, job.kind, job.triggeredBy);
      }
      return "skipped";
    }
    throw err;
  }
  await runClaimed(job.provider, createRunContext(job.provider, run, job.payload));
  return "ran";
}

/** An old `jira_assets_sync_run` payload as an `extension_sync_run` payload. */
export function legacyJiraRunJobData(data: unknown): Record<string, unknown> {
  const d = (data ?? {}) as { organizationId?: unknown; triggeredBy?: unknown; syncType?: unknown };
  return {
    key: "jira-assets",
    orgId: d.organizationId,
    kind: d.syncType,
    triggeredBy: d.triggeredBy ?? null,
    payload: null,
  };
}

/** One worker entry for every sync-engine job name, old Jira names included. */
export async function handleExtensionSyncJob(name: string, data: unknown): Promise<void> {
  switch (name) {
    case EXTENSION_SYNC_TICK_JOB:
    case LEGACY_JIRA_CHECK_JOB:
      await runExtensionSyncTick();
      return;
    case EXTENSION_SYNC_RUN_JOB:
      await runExtensionSyncJob(data);
      return;
    case LEGACY_JIRA_RUN_JOB:
      await runExtensionSyncJob(legacyJiraRunJobData(data));
      return;
    default:
      throw new Error(`Not an extension sync job: ${name}`);
  }
}

/**
 * "Sync now": readiness (the provider's status and reason), 409 if a run is
 * live or a job is already waiting, otherwise queue the run. `previousRunId`
 * is the newest status-kind run before this request; a client waits for a
 * newer one to finish.
 */
export async function startManualRun(
  key: string,
  orgId: number,
  userId: number,
): Promise<{ jobId: string; previousRunId: number | null }> {
  const provider = getSyncProvider(key);
  const readiness = await provider.readiness(orgId, "manual");
  if (!readiness.ready) throw new SyncNotReadyError(readiness.status, readiness.reason);
  if (await hasLiveRun(key, orgId)) throw new SyncInProgressError();
  const previousRunId = await latestStatusRunId(key, orgId);
  const { jobId, queued } = await enqueueExtensionSyncRun({
    key,
    orgId,
    kind: "manual",
    triggeredBy: userId,
    payload: null,
  });
  if (!queued) throw new SyncInProgressError();
  return { jobId, previousRunId };
}
