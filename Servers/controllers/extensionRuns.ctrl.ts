import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import {
  BackgroundJobsUnavailableError,
  hasPendingExtensionSyncJob,
} from "../services/automations/automationProducer";
import {
  SyncInProgressError,
  SyncNotReadyError,
  SyncValidationError,
} from "../extensions/sync-engine/errors";
import { startManualRun } from "../extensions/sync-engine/jobs";
import { findSyncProvider, getSyncProvider } from "../extensions/sync-engine/registry";
import { parseSchedulePatch, saveSchedule } from "../extensions/sync-engine/schedule";
import { getRunStatus, listRuns, parseRunsLimit } from "../extensions/sync-engine/status";

const fileName = "extensionRuns.ctrl.ts";

function keyParam(req: Request): string {
  const raw = req.params.key;
  return Array.isArray(raw) ? String(raw[0]) : String(raw);
}
function orgId(req: Request): number {
  return (req as any).organizationId;
}
function uid(req: Request): number {
  return (req as any).userId;
}

/**
 * The generic routes exist only for extensions with a sync provider. Any other
 * key passes the request on (next("route")), so these routes never shadow the
 * per-extension routers mounted after this one.
 */
export function onlySyncProviderKeys(req: Request, _res: Response, next: NextFunction): void {
  if (findSyncProvider(keyParam(req))) next();
  else next("route");
}

function isExpectedError(err: unknown): boolean {
  return (
    err instanceof SyncNotReadyError ||
    err instanceof SyncValidationError ||
    err instanceof SyncInProgressError
  );
}

/**
 * - SyncNotReadyError → its status (400 or 404) with the provider's reason
 * - SyncValidationError → 400
 * - SyncInProgressError → 409
 * - BackgroundJobsUnavailableError → 503
 * - anything else → 500, logged
 */
function sendSyncError(req: Request, res: Response, err: unknown, functionName: string) {
  if (err instanceof SyncNotReadyError) {
    return res.status(err.status).json(STATUS_CODE[err.status](err.message));
  }
  if (err instanceof SyncValidationError) {
    return res.status(400).json(STATUS_CODE[400](err.message));
  }
  if (err instanceof SyncInProgressError) {
    return res.status(409).json(STATUS_CODE[409](err.message));
  }
  if (err instanceof BackgroundJobsUnavailableError) {
    return res.status(503).json(STATUS_CODE[503](err.message));
  }
  logStructured("error", `extension runs ${functionName} failed`, functionName, fileName);
  logger.error(`Error in extension runs ${functionName}:`, err);
  return res.status(500).json(STATUS_CODE[500](translateError(req, err)));
}

/** POST /:key/runs — start a manual run in the background (202 { jobId, previousRunId }). */
export async function postRunCtrl(req: Request, res: Response): Promise<any> {
  try {
    const started = await startManualRun(keyParam(req), orgId(req), uid(req));
    return res.status(202).json(STATUS_CODE[202](started));
  } catch (err) {
    return sendSyncError(req, res, err, "postRunCtrl");
  }
}

/** GET /:key/runs/status — schedule, running, latest_run, last_finished_run and queued (null if the queue does not answer). */
export async function getRunStatusCtrl(req: Request, res: Response): Promise<any> {
  const key = keyParam(req);
  try {
    const status = await getRunStatus(key, orgId(req));
    let queued: boolean | null = null;
    try {
      queued = await hasPendingExtensionSyncJob(key, orgId(req));
    } catch (err) {
      logger.warn(`extension runs status: queue state unavailable: ${(err as Error).message}`);
    }
    return res.status(200).json(STATUS_CODE[200]({ ...status, queued }));
  } catch (err) {
    return sendSyncError(req, res, err, "getRunStatusCtrl");
  }
}

/** GET /:key/runs?limit= — the org's runs of the extension, newest first (default 20, max 200). */
export async function getRunsCtrl(req: Request, res: Response): Promise<any> {
  try {
    const runs = await listRuns(keyParam(req), orgId(req), parseRunsLimit(req.query.limit));
    return res.status(200).json(STATUS_CODE[200](runs));
  } catch (err) {
    return sendSyncError(req, res, err, "getRunsCtrl");
  }
}

/** PATCH /:key/schedule — `{ enabled?, interval_hours? }`; the provider may refuse. Event-logged. */
export async function patchScheduleCtrl(req: Request, res: Response): Promise<any> {
  const key = keyParam(req);
  // onlySyncProviderKeys guarantees a provider; its displayName keeps the
  // event-log wording Jira's PATCH /config/sync has always written.
  const provider = getSyncProvider(key);
  const name = provider.displayName ?? key;
  const ctx = {
    functionName: "patchScheduleCtrl",
    fileName,
    userId: uid(req),
    organizationId: orgId(req),
  };
  logProcessing({ ...ctx, description: `updating ${name} sync settings` });
  try {
    const patch = parseSchedulePatch(req.body);
    if (provider.canSchedule) {
      const allowed = await provider.canSchedule(orgId(req));
      if (!allowed.ready) throw new SyncNotReadyError(allowed.status, allowed.reason);
    }
    const schedule = await saveSchedule(key, orgId(req), patch, { userId: uid(req) });
    await logSuccess({
      ...ctx,
      eventType: "Update",
      description: `Updated ${name} sync settings (enabled: ${schedule.enabled}, every ${schedule.interval_hours} h)`,
    });
    return res.status(200).json(STATUS_CODE[200](schedule));
  } catch (err) {
    if (!isExpectedError(err)) {
      await logFailure({
        ...ctx,
        eventType: "Update",
        description: `Failed to update ${name} sync settings`,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
    return sendSyncError(req, res, err, "patchScheduleCtrl");
  }
}
