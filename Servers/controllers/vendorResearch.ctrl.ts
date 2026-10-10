/**
 * The vendor research endpoints: starting a run, reading the latest run of a vendor, the research
 * settings of the organization and the list of findings that runs produced.
 *
 * Every id in a path is looked up in the caller's organization before anything else uses it, and
 * a vendor of another organization is a 404, the same as a vendor that does not exist.
 */
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { toId } from "../utils/validations/validation.utils";
import { getVendorByIdQuery } from "../utils/vendor.utils";
import { getLLMKeysQuery } from "../utils/llmKey.utils";
import {
  failStaleRunsQuery,
  getLatestRunQuery,
  listFindingsQuery,
} from "../utils/vendorResearch.utils";
import { getVendorResearchConfig, isSearchConfigured } from "../services/vendorResearch/config";
import { StartResearchError, startVendorResearch } from "../services/vendorResearch/trigger";
import { FindingStatus, IVendorResearchRun } from "../domain.layer/interfaces/i.vendorResearch";

const FILE_NAME = "vendorResearch.ctrl.ts";

/**
 * A run that has been queued or running for this long is lost, for example because the worker
 * restarted: reading the latest run fails it, as starting a new run does.
 */
const STALE_RUN_MINUTES = 15;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const FINDING_STATUSES: readonly FindingStatus[] = ["pending", "accepted", "dismissed"];

const isFindingStatus = (value: unknown): value is FindingStatus =>
  FINDING_STATUSES.includes(value as FindingStatus);

/** An id off the wire that is a positive whole number, or NaN. */
const positiveId = (value: unknown): number => {
  const id = toId(value);
  return id > 0 ? id : NaN;
};

type RunResponse = Pick<
  IVendorResearchRun,
  | "id"
  | "vendor_id"
  | "status"
  | "trigger_type"
  | "categories"
  | "category_summary"
  | "duplicates_dropped"
  | "error"
  | "started_at"
  | "finished_at"
  | "created_at"
>;

/**
 * The fields of a run that leave the server. The row also holds the evidence pack (up to 40 KB of
 * text from third-party pages) and the provider, model and prompt version of the run. They are an
 * audit trail, not part of the API, so a field is added here on purpose or not at all.
 */
const toRunResponse = (run: IVendorResearchRun): RunResponse => ({
  id: run.id,
  vendor_id: run.vendor_id,
  status: run.status,
  trigger_type: run.trigger_type,
  categories: run.categories,
  category_summary: run.category_summary,
  duplicates_dropped: run.duplicates_dropped,
  error: run.error,
  started_at: run.started_at,
  finished_at: run.finished_at,
  created_at: run.created_at,
});

/**
 * The reply to a start that was refused. What the caller can do about it is in the status and in
 * `data.code`: 409 needs a setting changed, 429 needs time (`Retry-After` says how much, for a
 * cooldown), 503 can simply be tried again.
 */
function replyToRefusal(req: Request, res: Response, error: StartResearchError): Response {
  switch (error.code) {
    case "vendor_not_found":
      return res.status(404).json(STATUS_CODE[404](req.t!("Vendor not found")));
    case "search_not_configured":
    case "llm_key_missing":
      return res.status(409).json(STATUS_CODE[409]({ code: error.code }));
    case "cooldown":
      if (error.retryAfterSeconds !== undefined) {
        res.set("Retry-After", String(error.retryAfterSeconds));
      }
      return res
        .status(429)
        .json(STATUS_CODE[429]({ code: error.code, retryAfterSeconds: error.retryAfterSeconds }));
    case "daily_cap":
      return res.status(429).json(STATUS_CODE[429]({ code: error.code }));
    case "enqueue_failed":
      return res
        .status(503)
        .json(
          STATUS_CODE[503](
            req.t!(
              "The research could not be started because the job queue is unavailable. Nothing was lost, so it is safe to try again later.",
            ),
          ),
        );
  }
}

export async function startVendorResearchRun(req: Request, res: Response): Promise<any> {
  const functionName = "startVendorResearchRun";
  const vendorId = positiveId(req.params.id);
  if (isNaN(vendorId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }

  logProcessing({
    description: `starting startVendorResearchRun for vendor ID ${vendorId}`,
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Nothing ties the vendor of a run to an organization in the database, so the vendor is
    // looked up in the caller's organization before the id is used for anything else.
    const vendor = await getVendorByIdQuery(vendorId, req.organizationId!);
    if (!vendor) {
      await logSuccess({
        eventType: "Read",
        description: `vendor not found for research: ID ${vendorId}`,
        functionName,
        fileName: FILE_NAME,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("Vendor not found")));
    }

    const result = await startVendorResearch({
      organizationId: req.organizationId!,
      vendorId,
      triggerType: "manual",
      requestedBy: req.userId!,
    });

    if (!result.ok) {
      await logSuccess({
        eventType: "Read",
        description: `research of vendor ID ${vendorId} was not started: ${result.error.code}`,
        functionName,
        fileName: FILE_NAME,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return replyToRefusal(req, res, result.error);
    }

    await logSuccess({
      // Returning the run that is already active creates nothing.
      eventType: result.alreadyRunning ? "Read" : "Create",
      description: result.alreadyRunning
        ? `research run ${result.run.id} of vendor ID ${vendorId} is already active`
        : `started research run ${result.run.id} for vendor ID ${vendorId}`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(202).json(
      STATUS_CODE[202]({
        run: toRunResponse(result.run),
        alreadyRunning: result.alreadyRunning,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: `failed to start research for vendor ID ${vendorId}`,
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getLatestVendorResearch(req: Request, res: Response): Promise<any> {
  const functionName = "getLatestVendorResearch";
  const vendorId = positiveId(req.params.id);
  if (isNaN(vendorId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }

  logProcessing({
    description: `starting getLatestVendorResearch for vendor ID ${vendorId}`,
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendor = await getVendorByIdQuery(vendorId, req.organizationId!);
    if (!vendor) {
      await logSuccess({
        eventType: "Read",
        description: `vendor not found for research: ID ${vendorId}`,
        functionName,
        fileName: FILE_NAME,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("Vendor not found")));
    }

    // A run that a restarted worker left behind must not look active for ever.
    await failStaleRunsQuery(req.organizationId!, vendorId, STALE_RUN_MINUTES);
    const run = await getLatestRunQuery(req.organizationId!, vendorId);

    await logSuccess({
      eventType: "Read",
      description: run
        ? `retrieved research run ${run.id} of vendor ID ${vendorId}`
        : `vendor ID ${vendorId} has no research run`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](run ? toRunResponse(run) : null));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve the latest research run of vendor ID ${vendorId}`,
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** What the page needs to know to offer research. It carries booleans only, never a key. */
export async function getResearchConfig(req: Request, res: Response): Promise<any> {
  const functionName = "getResearchConfig";

  logProcessing({
    description: "starting getResearchConfig",
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const config = getVendorResearchConfig();
    const llmKeys = await getLLMKeysQuery(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: "retrieved the vendor research settings",
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(
      STATUS_CODE[200]({
        searchConfigured: isSearchConfigured(config),
        hasLlmKey: llmKeys.length > 0,
        autoRunEnabled: config.autoRun,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve the vendor research settings",
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

interface FindingsFilter {
  status: FindingStatus;
  vendorId?: number;
  limit: number;
  offset: number;
}

/**
 * The filter of a list request, or the message for the first parameter that is not valid. A
 * parameter that is given twice arrives as an array and is not valid either.
 */
function parseFindingsFilter(req: Request): { filter: FindingsFilter } | { error: string } {
  const { status, vendorId, limit, offset } = req.query;

  const wantedStatus = status === undefined ? "pending" : status;
  if (!isFindingStatus(wantedStatus)) return { error: req.t!("Invalid status filter") };

  let wantedVendorId: number | undefined;
  if (vendorId !== undefined) {
    wantedVendorId = positiveId(vendorId);
    if (isNaN(wantedVendorId)) return { error: req.t!("Invalid vendor ID") };
  }

  const wantedLimit = limit === undefined ? DEFAULT_LIMIT : toId(limit);
  if (!(wantedLimit >= 1)) return { error: req.t!("Invalid limit") };

  // A whole number the database can take as an offset.
  const wantedOffset = offset === undefined ? 0 : toId(offset);
  if (!Number.isSafeInteger(wantedOffset) || wantedOffset < 0) {
    return { error: req.t!("Invalid offset") };
  }

  return {
    filter: {
      status: wantedStatus,
      vendorId: wantedVendorId,
      limit: Math.min(wantedLimit, MAX_LIMIT),
      offset: wantedOffset,
    },
  };
}

export async function listVendorRiskFindings(req: Request, res: Response): Promise<any> {
  const functionName = "listVendorRiskFindings";
  const parsed = parseFindingsFilter(req);
  if ("error" in parsed) {
    return res.status(400).json(STATUS_CODE[400](parsed.error));
  }

  logProcessing({
    description: "starting listVendorRiskFindings",
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const page = await listFindingsQuery(req.organizationId!, parsed.filter);

    await logSuccess({
      eventType: "Read",
      description: `retrieved ${page.rows.length} of ${page.total} ${parsed.filter.status} vendor risk findings`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](page));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve vendor risk findings",
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
