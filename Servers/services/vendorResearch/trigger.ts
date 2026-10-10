/**
 * Starting vendor research: the checks that decide whether a run may start, the queued run and its
 * job, and the automatic start after a vendor is created.
 *
 * `startVendorResearch` checks, in this order, and stops at the first that fails:
 *
 * 1. the vendor is in the organization (the vendor_id foreign key of a run is not scoped to an
 *    organization, so this service cannot rely on its callers for it),
 * 2. search is configured,
 * 3. the organization has an LLM key,
 * 4. the vendor's stale runs are failed, and an active run is returned instead of a new one,
 * 5. the cooldown of a manual start has passed (an automatic start does not wait),
 * 6. the organization is under its daily cap.
 *
 * Then the queued run is created and its job queued. The partial unique index on the runs lets one
 * active run through for each vendor, so a second start that gets past step 4 at the same moment
 * meets the index and returns the run that won.
 *
 * Nothing in this file logs a key: the Tavily key stays in the configuration.
 */
import {
  IVendorResearchRun,
  ResearchTrigger,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { getLLMKeysQuery } from "../../utils/llmKey.utils";
import logger from "../../utils/logger/fileLogger";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import {
  STALE_RUN_MINUTES,
  countRunsSinceQuery,
  createRunQuery,
  failStaleRunsQuery,
  finishRunQuery,
  getActiveRunQuery,
  getLastRunCreatedAtQuery,
} from "../../utils/vendorResearch.utils";
import { enqueueVendorResearch } from "../automations/automationProducer";
import { getVendorResearchConfig, isSearchConfigured } from "./config";

const MINUTE_MS = 60_000;
/** The daily cap counts the runs of a rolling 24 hours. */
const DAY_MS = 24 * 60 * MINUTE_MS;
/** What a run records when its job could not be queued. */
const ENQUEUE_FAILED_NOTE = "could not enqueue";

export interface StartResearchError {
  code:
    | "vendor_not_found"
    | "search_not_configured"
    | "llm_key_missing"
    | "cooldown"
    | "daily_cap"
    | "enqueue_failed";
  /** For `cooldown`: the whole seconds left until the vendor can be researched again. */
  retryAfterSeconds?: number;
}

export type StartResearchResult =
  | { ok: true; run: IVendorResearchRun; alreadyRunning: boolean }
  | { ok: false; error: StartResearchError };

const fail = (
  code: StartResearchError["code"],
  retryAfterSeconds?: number,
): StartResearchResult => ({
  ok: false,
  error: retryAfterSeconds === undefined ? { code } : { code, retryAfterSeconds },
});

/** For log lines: only ids. */
const tag = (organizationId: number, vendorId: number) =>
  `vendor research for vendor ${vendorId} (org ${organizationId})`;

/** The message of an error, for a log line. It never throws: it is called inside catch blocks. */
function describeError(error: unknown): string {
  try {
    return error instanceof Error ? String(error.message) : String(error);
  } catch {
    return "unknown error";
  }
}

/** Whether `error` is a Postgres unique violation, the way Sequelize reports it. */
const isUniqueViolation = (error: unknown): boolean =>
  (error as { parent?: { code?: string } } | null | undefined)?.parent?.code === "23505";

/**
 * Starts a research run for a vendor: returns the run that is already active, or creates a queued
 * run and queues its job. Rejects only when a query fails; every refusal is a result.
 */
export async function startVendorResearch(args: {
  organizationId: number;
  vendorId: number;
  triggerType: ResearchTrigger;
  requestedBy: number | null;
}): Promise<StartResearchResult> {
  const { organizationId, vendorId, triggerType, requestedBy } = args;

  const vendor = await getVendorByIdQuery(vendorId, organizationId);
  if (!vendor) return fail("vendor_not_found");

  // Read now, not at import: the settings are the environment of the running process.
  const config = getVendorResearchConfig();
  if (!isSearchConfigured(config)) return fail("search_not_configured");

  const keys = await getLLMKeysQuery(organizationId);
  if (keys.length === 0) return fail("llm_key_missing");

  await failStaleRunsQuery(organizationId, vendorId, STALE_RUN_MINUTES);

  const active = await getActiveRunQuery(organizationId, vendorId);
  if (active) return { ok: true, run: active, alreadyRunning: true };

  // With a cooldown of zero there is nothing to wait for, whatever the clocks say.
  if (triggerType === "manual" && config.manualCooldownMinutes > 0) {
    const lastRunAt = await getLastRunCreatedAtQuery(organizationId, vendorId);
    if (lastRunAt) {
      const waitMs = lastRunAt.getTime() + config.manualCooldownMinutes * MINUTE_MS - Date.now();
      if (waitMs > 0) return fail("cooldown", Math.ceil(waitMs / 1000));
    }
  }

  const runsInLastDay = await countRunsSinceQuery(organizationId, new Date(Date.now() - DAY_MS));
  if (runsInLastDay >= config.dailyRunCap) return fail("daily_cap");

  let run: IVendorResearchRun;
  try {
    run = await createRunQuery({ organizationId, vendorId, triggerType, requestedBy });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // A start that came a moment before this one created the run: it is the run to return.
    const winner = await getActiveRunQuery(organizationId, vendorId);
    if (!winner) throw error;
    return { ok: true, run: winner, alreadyRunning: true };
  }

  try {
    await enqueueVendorResearch(organizationId, vendorId, run.id);
  } catch (error) {
    logger.error(
      `${tag(organizationId, vendorId)}: run ${run.id} could not be queued: ${describeError(error)}`,
    );
    // Nothing will pick the run up, so it ends now instead of blocking the vendor until the sweep.
    try {
      await finishRunQuery({
        organizationId,
        runId: run.id,
        status: "failed",
        categories: [],
        categorySummary: [],
        evidence: null,
        searchProvider: null,
        model: null,
        promptVersion: null,
        searchesUsed: 0,
        duplicatesDropped: 0,
        error: ENQUEUE_FAILED_NOTE,
      });
    } catch (finishError) {
      logger.error(
        `${tag(organizationId, vendorId)}: run ${run.id} could not be marked as failed: ${describeError(finishError)}`,
      );
    }
    return fail("enqueue_failed");
  }

  return { ok: true, run, alreadyRunning: false };
}

const NOT_STARTED_REASONS: Record<StartResearchError["code"], string> = {
  vendor_not_found: "the vendor was not found",
  search_not_configured: "search is not configured",
  llm_key_missing: "the organization has no LLM key",
  cooldown: "the vendor was researched a moment ago",
  daily_cap: "the daily run cap is reached",
  enqueue_failed: "the job could not be queued",
};

/**
 * The automatic start after a vendor is created. Nothing is persisted when it does not start, and
 * the reason is logged. It never rejects, so a caller that does not wait for it cannot be hurt by
 * it.
 */
export async function triggerAutoResearch(args: {
  organizationId: number;
  vendorId: number;
  isDemo: boolean;
}): Promise<void> {
  const { organizationId, vendorId, isDemo } = args;
  const label = tag(organizationId, vendorId);
  try {
    if (isDemo) {
      logger.info(`${label}: not started, demo vendors are not researched`);
      return;
    }
    if (!getVendorResearchConfig().autoRun) {
      logger.info(`${label}: not started, automatic research is turned off`);
      return;
    }
    const result = await startVendorResearch({
      organizationId,
      vendorId,
      triggerType: "auto",
      requestedBy: null,
    });
    if (!result.ok) {
      logger.info(`${label}: not started, ${NOT_STARTED_REASONS[result.error.code]}`);
    }
  } catch (error) {
    logger.error(`${label}: could not be started: ${describeError(error)}`);
  }
}
