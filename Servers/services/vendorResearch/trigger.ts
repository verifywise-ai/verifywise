/**
 * Starting vendor research: the checks that decide whether a run may start, the queued run and its
 * job, and the automatic start after a vendor is created.
 *
 * `startVendorResearch` checks, in this order, and stops at the first that fails:
 *
 * 1. the vendor is in the organization (the vendor_id foreign key of a run is not scoped to an
 *    organization, so this service cannot rely on its callers for it),
 * 2. the organization has an LLM key (the agent runs on it and needs no other account),
 * 3. the vendor's stale runs are failed, and an active run is returned instead of a new one,
 * 4. the cooldown of a manual start has passed (an automatic start does not wait),
 * 5. the organization is under its daily cap.
 *
 * Then the queued run is created and its job queued. The partial unique index on the runs lets one
 * active run through for each vendor, so a second start that gets past step 3 at the same moment
 * meets the index and returns the run that won. A queue that does not take the job within
 * ENQUEUE_TIMEOUT_MS is a queue that refused it: the run ends as failed ("could not enqueue", which
 * counts toward neither limit) and the start answers `enqueue_failed`.
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
import { getVendorResearchConfig } from "./config";
import { enqueueVendorResearch } from "./queue";

const MINUTE_MS = 60_000;
/**
 * The daily cap counts the runs of a rolling 24 hours, but not those that failed before they
 * started or that have waited in the queue for longer than the stale limit (see `COUNTS_AS_A_RUN`).
 */
const DAY_MS = 24 * 60 * MINUTE_MS;
/** What a run records when its job could not be queued. */
const ENQUEUE_FAILED_NOTE = "could not enqueue";
/**
 * How long a start waits for its job to be queued, in milliseconds. With Redis down, `Queue.add`
 * does not fail: BullMQ keeps the command in the offline queue of its Redis client, which rejects it
 * only after a number of reconnect attempts (20 seconds to several minutes) or, when Redis was
 * already down as the process started, not at all. A manual start would hang until a proxy answered
 * 504, with a run sitting in `queued`. After this long the start gives up and answers the 503 of
 * `enqueue_failed` instead.
 */
export const ENQUEUE_TIMEOUT_MS = 5000;

export interface StartResearchError {
  code: "vendor_not_found" | "llm_key_missing" | "cooldown" | "daily_cap" | "enqueue_failed";
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
 * Queues the job of a run, and gives up after ENQUEUE_TIMEOUT_MS. The timeout rejects like a
 * refused `add`, so the caller handles both the same way.
 *
 * The `add` is not cancelled. If it lands after the timeout, the job reaches the worker for a run
 * that is failed by then ("could not enqueue"), and the worker skips it: `markRunRunningQuery`
 * only moves a queued run (one that has not waited past the stale limit) to running and answers
 * false for a failed one, so the pipeline returns "skipped" before it searches or calls a model.
 * This holds once the failed state is written. A job that lands in the few milliseconds before
 * that write could still start the run, because `finishRunQuery` has no status guard; the caller
 * was told "could not enqueue", tries again, and the vendor is researched twice at worst.
 */
async function enqueueWithTimeout(
  organizationId: number,
  vendorId: number,
  runId: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const adding = enqueueVendorResearch(organizationId, vendorId, runId);
    // Belt and braces: `Promise.race` already attaches a handler to `adding`, so a rejection that
    // comes after the timer has won is handled either way. This keeps that true whatever happens to
    // the race, because an unhandled rejection ends the process on Node 22.
    adding.catch(() => undefined);
    await Promise.race([
      adding,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`the job was not queued within ${ENQUEUE_TIMEOUT_MS} ms`)),
          ENQUEUE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
    await enqueueWithTimeout(organizationId, vendorId, run.id);
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
        model: null,
        promptVersion: null,
        searchesUsed: 0,
        pagesRead: 0,
        duplicatesDropped: 0,
        error: ENQUEUE_FAILED_NOTE,
        trace: null,
        coverage: null,
        registryVersion: null,
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
    const config = getVendorResearchConfig();
    if (!config.autoRun) {
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
