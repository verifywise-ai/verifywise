/**
 * The vendor research endpoints: starting a run, reading the latest run of a vendor, the trace of a
 * run (for those who manage the organization's LLM key), the research settings of the organization,
 * the list of findings that runs produced, and the two decisions on a finding: accept it into the
 * vendor risk register (as it is, or as the person edited it in the vendor risk form) or dismiss it.
 *
 * Every id in a path is looked up in the caller's organization before anything else uses it, and
 * a vendor or a finding of another organization is a 404, the same as one that does not exist.
 * The organization and the user always come from the request, never from the body or the path.
 */
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { toId } from "../utils/validations/validation.utils";
import { getVendorByIdQuery } from "../utils/vendor.utils";
import { getLLMKeysQuery } from "../utils/llmKey.utils";
import {
  STALE_RUN_MINUTES,
  failStaleRunsQuery,
  getDecisionCountsQuery,
  getLatestRunQuery,
  getRunTraceQuery,
  getVendorResearchSettingsQuery,
  listFindingsQuery,
} from "../utils/vendorResearch.utils";
import { getVendorResearchConfig } from "../services/vendorResearch/config";
import { credibilityRationale } from "../services/vendorResearch/credibilityText";
import { foldDecisionStats, sumByPromptVersion } from "../services/vendorResearch/decisionStats";
import {
  FindingEdits,
  acceptFinding,
  dismissFinding,
} from "../services/vendorResearch/findings.service";
import { saveVendorResearchSettings } from "../services/vendorResearch/settings.service";
import { StartResearchError, startVendorResearch } from "../services/vendorResearch/trigger";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import {
  DISMISS_REASONS,
  DismissReason,
  FindingStatus,
  IVendorResearchRun,
  IVendorRiskFinding,
  SCAN_INTERVAL_DAYS,
} from "../domain.layer/interfaces/i.vendorResearch";

const FILE_NAME = "vendorResearch.ctrl.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const FINDING_STATUSES: readonly FindingStatus[] = ["pending", "accepted", "dismissed"];

const isFindingStatus = (value: unknown): value is FindingStatus =>
  FINDING_STATUSES.includes(value as FindingStatus);

const isDismissReason = (value: unknown): value is DismissReason =>
  DISMISS_REASONS.includes(value as DismissReason);

/**
 * An id off the wire that is a positive whole number a float holds exactly, or NaN. `toId` turns
 * any string of digits into a number, so a long one gets through it: a number above 2^53 - 1 is a
 * float that is not a safe integer (a 308-digit one is still finite), and only a number above
 * about 1.797e308 becomes Infinity. Both are greater than zero but are not ids, and
 * `Number.isSafeInteger` rejects both.
 */
const positiveId = (value: unknown): number => {
  const id = toId(value);
  return Number.isSafeInteger(id) && id > 0 ? id : NaN;
};

type RunResponse = Pick<
  IVendorResearchRun,
  | "id"
  | "vendor_id"
  | "status"
  | "trigger_type"
  | "categories"
  | "category_summary"
  | "coverage"
  | "searches_used"
  | "pages_read"
  | "duplicates_dropped"
  | "error"
  | "progress"
  | "started_at"
  | "finished_at"
  | "created_at"
>;

/**
 * The fields of a run that leave the server. The row also holds the evidence pack (up to 100,000
 * bytes of text from third-party pages) and the model and prompt version of the run. They are an
 * audit trail, not part of the API, so a field is added here on purpose or not at all. `progress`
 * is on purpose: it holds counts and closed words only (see `RunProgress`), and every role that
 * sees the run sees what it is doing. So is `coverage`: the lists the run checked, their names,
 * attributions and dates, and counts.
 */
const toRunResponse = (run: IVendorResearchRun): RunResponse => ({
  id: run.id,
  vendor_id: run.vendor_id,
  status: run.status,
  trigger_type: run.trigger_type,
  categories: run.categories,
  category_summary: run.category_summary,
  coverage: run.coverage,
  searches_used: run.searches_used,
  pages_read: run.pages_read,
  duplicates_dropped: run.duplicates_dropped,
  error: run.error,
  progress: run.progress,
  started_at: run.started_at,
  finished_at: run.finished_at,
  created_at: run.created_at,
});

/**
 * A finding as it leaves the server: its row, and the English line of its credibility label
 * (spec D5.5) for the clients that do not translate the basis; null for a finding without one.
 */
const withRationale = <T extends IVendorRiskFinding>(
  finding: T,
): T & { credibility_rationale: string | null } => {
  const basis = finding.credibility_basis ?? null;
  const line = basis === null ? "" : credibilityRationale(basis);
  return { ...finding, credibility_rationale: line === "" ? null : line };
};

/**
 * The reply to a start that was refused. What the caller can do about it is in the status and in
 * `data.code`: 409 needs a setting changed, 429 needs time (`Retry-After` says how much, for a
 * cooldown), 503 can simply be tried again.
 */
function replyToRefusal(req: Request, res: Response, error: StartResearchError): Response {
  switch (error.code) {
    case "vendor_not_found":
      return res.status(404).json(STATUS_CODE[404](req.t!("Vendor not found")));
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

/**
 * What a run did: its searches, reads, model calls with their tokens, and what each check turned
 * away (see services/vendorResearch/trace.ts). The route limits it to the holders of `llmKeys.admin`
 * (built-in: Admin): the trace holds the queries and addresses the agent used, which the run
 * summary that every role reads does not, and it is the account of what the organization's LLM key
 * was spent on.
 */
export async function getVendorResearchRunTrace(req: Request, res: Response): Promise<any> {
  const functionName = "getVendorResearchRunTrace";
  const vendorId = positiveId(req.params.id);
  if (isNaN(vendorId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor ID")));
  }
  const runId = positiveId(req.params.runId);
  if (isNaN(runId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid run ID")));
  }

  logProcessing({
    description: `starting getVendorResearchRunTrace for run ${runId} of vendor ID ${vendorId}`,
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendor = await getVendorByIdQuery(vendorId, req.organizationId!);
    const trace = vendor ? await getRunTraceQuery(req.organizationId!, vendorId, runId) : null;
    if (!vendor || trace === null) {
      await logSuccess({
        eventType: "Read",
        description: `no research trace for run ${runId} of vendor ID ${vendorId}`,
        functionName,
        fileName: FILE_NAME,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("Research trace not found")));
    }

    await logSuccess({
      eventType: "Read",
      description: `retrieved the research trace of run ${runId} of vendor ID ${vendorId}`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](trace));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `failed to retrieve the research trace of run ${runId} of vendor ID ${vendorId}`,
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * How the findings were decided, by prompt version and by category: the rate of acceptance that a
 * change to the agent is measured by. Counts only, nothing a third party wrote. The route limits it
 * to the holders of `llmKeys.admin`, like the trace.
 */
export async function getDecisionStats(req: Request, res: Response): Promise<any> {
  const functionName = "getDecisionStats";

  logProcessing({
    description: "starting getDecisionStats",
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const byCategory = foldDecisionStats(await getDecisionCountsQuery(req.organizationId!));

    await logSuccess({
      eventType: "Read",
      description: "retrieved the decision statistics of the vendor research findings",
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res
      .status(200)
      .json(STATUS_CODE[200]({ byPromptVersion: sumByPromptVersion(byCategory), byCategory }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve the decision statistics of the vendor research findings",
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

/**
 * The choice of an LLM key in a request body: `null` (no choice) or a positive whole number a float
 * holds exactly; `undefined` for anything else, text included, because a body is JSON and an id is
 * a number in it.
 */
function keyChoiceOf(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * The scan interval in a request body: the days to wait between two scans of a vendor, one of
 * SCAN_INTERVAL_DAYS, or `null` for off. `value` is `undefined` when the body does not name it,
 * which leaves the stored choice as it is; anything else is `ok: false`.
 */
function scanIntervalOf(
  body: Record<string, unknown>,
): { ok: true; value: number | null | undefined } | { ok: false } {
  if (!("scanIntervalDays" in body)) return { ok: true, value: undefined };
  const given = body.scanIntervalDays;
  if (given === null) return { ok: true, value: null };
  const offered = (SCAN_INTERVAL_DAYS as readonly unknown[]).includes(given);
  return offered ? { ok: true, value: given as number } : { ok: false };
}

/**
 * Which of the organization's LLM keys the research and the analysis use, by id, and how often the
 * scheduled scan researches a vendor again. For those who manage the organization's LLM keys; the
 * page joins the ids with the key list it already has.
 */
export async function getResearchSettings(req: Request, res: Response): Promise<any> {
  const functionName = "getResearchSettings";

  logProcessing({
    description: "starting getResearchSettings",
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const settings = await getVendorResearchSettingsQuery(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: "retrieved the LLM key choice of the vendor research",
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve the LLM key choice of the vendor research",
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Stores which of the organization's LLM keys the research and the analysis use, and how often the
 * scheduled scan researches a vendor again. Both key choices are in the body, each a key id or null
 * for the default; a key that is not the organization's is a 404. `scanIntervalDays` is 7, 14, 30
 * or null (off); a body that does not name it leaves it as it is.
 */
export async function saveResearchSettings(req: Request, res: Response): Promise<any> {
  const functionName = "saveResearchSettings";

  logProcessing({
    description: "starting saveResearchSettings",
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const body = req.body as Record<string, unknown> | undefined;
  const isObject = typeof body === "object" && body !== null && !Array.isArray(body);
  const researchKeyId = isObject ? keyChoiceOf(body.researchKeyId) : undefined;
  const analysisKeyId = isObject ? keyChoiceOf(body.analysisKeyId) : undefined;
  if (researchKeyId === undefined || analysisKeyId === undefined) {
    await logFailure({
      eventType: "Update",
      description: "refused the LLM key choice of the vendor research: not a key id or null",
      functionName,
      fileName: FILE_NAME,
      error: new ValidationException("researchKeyId and analysisKeyId must be a key id or null"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          req.t!("researchKeyId and analysisKeyId must each be an LLM key ID or null"),
        ),
      );
  }

  const scanInterval = scanIntervalOf(body ?? {});
  if (!scanInterval.ok) {
    await logFailure({
      eventType: "Update",
      description: "refused the scan interval of the vendor research: not 7, 14, 30 or null",
      functionName,
      fileName: FILE_NAME,
      error: new ValidationException("scanIntervalDays must be 7, 14, 30 or null"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("scanIntervalDays must be 7, 14, 30 or null")));
  }

  try {
    const saved = await saveVendorResearchSettings({
      organizationId: req.organizationId!,
      userId: req.userId!,
      researchKeyId,
      analysisKeyId,
      scanIntervalDays: scanInterval.value,
    });
    if (!saved.ok) {
      await logFailure({
        eventType: "Update",
        description: "refused the LLM key choice of the vendor research: an unknown key",
        functionName,
        fileName: FILE_NAME,
        error: new NotFoundException("LLM key not found"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("LLM key not found")));
    }

    await logSuccess({
      eventType: "Update",
      description: "saved the LLM key choice of the vendor research",
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](saved.settings));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "failed to save the LLM key choice of the vendor research",
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
    return res.status(200).json(STATUS_CODE[200]({ ...page, rows: page.rows.map(withRationale) }));
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

/** The body of a request as an object: a request without one, or with a list, names nothing. */
const requestBody = (req: Request): Record<string, unknown> =>
  req.body !== null && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

/**
 * The action owner of an accept: `undefined` when the body does not name one (the service takes
 * the vendor's assignee), `null` for no owner, else the id of a user. Anything else is not an id.
 * Whether the user belongs to the organization is for the service to say.
 */
function parseActionOwner(
  req: Request,
): { actionOwner: number | null | undefined } | { error: string } {
  const actionOwner = requestBody(req).action_owner;
  if (actionOwner === undefined || actionOwner === null) return { actionOwner };
  if (typeof actionOwner === "number" && Number.isSafeInteger(actionOwner) && actionOwner > 0) {
    return { actionOwner };
  }
  return { error: req.t!("Invalid action owner") };
}

/** The fields of a finding that the person accepting it may change; the service checks them. */
const EDITABLE_FIELDS = [
  "risk_description",
  "impact_description",
  "action_plan",
  "likelihood",
  "risk_severity",
  "risk_level",
  "frameworks",
] as const;

/**
 * The edits of an accept: the editable fields the body names, as they came. The vendor, the state
 * of the finding and everything else in the body are not edits and are left out. What a value may
 * be is for the service to say, so a `null` or a value of the wrong type is passed on to be refused.
 */
function acceptEdits(req: Request): FindingEdits {
  const body = requestBody(req);
  const edits: FindingEdits = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) edits[field] = body[field];
  }
  return edits;
}

/**
 * The reason and the optional note of a dismissal, or the message for the first of them that is
 * not valid. A note of `null` is no note, as an absent one is. How long the note may be is for the
 * service to say.
 */
function parseDismissal(
  req: Request,
): { reason: DismissReason; note: string | undefined } | { error: string } {
  const { reason, note } = requestBody(req);
  if (!isDismissReason(reason)) return { error: req.t!("Invalid dismissal reason") };
  if (note !== undefined && note !== null && typeof note !== "string") {
    return { error: req.t!("Invalid dismissal note") };
  }
  return { reason, note: note ?? undefined };
}

/** The status for a refusal by the findings service; any other error is not one. */
function refusalStatus(error: unknown): 400 | 404 | 409 | undefined {
  if (error instanceof NotFoundException) return 404;
  if (error instanceof ConflictException) return 409;
  if (error instanceof ValidationException) return 400;
  return undefined;
}

export async function acceptVendorRiskFinding(req: Request, res: Response): Promise<any> {
  const functionName = "acceptVendorRiskFinding";
  const findingId = positiveId(req.params.id);
  if (isNaN(findingId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid finding ID")));
  }
  const parsed = parseActionOwner(req);
  if ("error" in parsed) {
    return res.status(400).json(STATUS_CODE[400](parsed.error));
  }

  logProcessing({
    description: `starting acceptVendorRiskFinding for finding ID ${findingId}`,
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const result = await acceptFinding({
      organizationId: req.organizationId!,
      findingId,
      userId: req.userId!,
      actionOwner: parsed.actionOwner,
      edits: acceptEdits(req),
    });

    await logSuccess({
      eventType: "Create",
      description: `accepted finding ID ${findingId} as vendor risk ID ${result.vendorRisk.id}`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res
      .status(200)
      .json(STATUS_CODE[200]({ ...result, finding: withRationale(result.finding) }));
  } catch (error) {
    const status = refusalStatus(error);
    if (status === undefined) {
      await logFailure({
        eventType: "Create",
        description: `failed to accept finding ID ${findingId}`,
        functionName,
        fileName: FILE_NAME,
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }

    // Nothing was created: a refusal is logged as a read, like a refused start.
    await logSuccess({
      eventType: "Read",
      description: `finding ID ${findingId} was not accepted: ${(error as Error).message}`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(status).json(STATUS_CODE[status](translateError(req, error)));
  }
}

export async function dismissVendorRiskFinding(req: Request, res: Response): Promise<any> {
  const functionName = "dismissVendorRiskFinding";
  const findingId = positiveId(req.params.id);
  if (isNaN(findingId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid finding ID")));
  }
  const parsed = parseDismissal(req);
  if ("error" in parsed) {
    return res.status(400).json(STATUS_CODE[400](parsed.error));
  }

  logProcessing({
    description: `starting dismissVendorRiskFinding for finding ID ${findingId}`,
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const finding = await dismissFinding({
      organizationId: req.organizationId!,
      findingId,
      userId: req.userId!,
      reason: parsed.reason,
      note: parsed.note,
    });

    await logSuccess({
      eventType: "Update",
      description: `dismissed finding ID ${findingId}: ${parsed.reason}`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](withRationale(finding)));
  } catch (error) {
    const status = refusalStatus(error);
    if (status === undefined) {
      await logFailure({
        eventType: "Update",
        description: `failed to dismiss finding ID ${findingId}`,
        functionName,
        fileName: FILE_NAME,
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }

    await logSuccess({
      eventType: "Read",
      description: `finding ID ${findingId} was not dismissed: ${(error as Error).message}`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(status).json(STATUS_CODE[status](translateError(req, error)));
  }
}
