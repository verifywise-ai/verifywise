/**
 * Corpus generation as a BullMQ job.
 *
 * One job per corpus (jobId "corpus-<id>"). Every attempt calls
 * runCorpusGeneration, which resumes from the record log, so a retry after a
 * gateway error or a crash redoes only what is missing. A corpus another
 * runner holds is delayed until its lease expires and spends no attempt. A
 * corpus that is no longer running is not retried. After the last attempt
 * the corpus is marked failed, which frees the one-running-per-project index
 * and lets the customer resume it.
 */
import { DelayedError, Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import { REDIS_URL } from "../../../database/redis";
import {
  ConflictException,
  NotFoundException,
} from "../../../domain.layer/exceptions/custom.exception";
import { updateCorpusStatusQuery } from "../../../utils/biasAudit.utils";
import logger from "../../../utils/logger/fileLogger";
import {
  CorpusBusyError,
  LEASE_SECONDS,
  LeaseLostError,
  runCorpusGeneration,
} from "./generateCorpus";

export const CORPUS_QUEUE = "bias-audit-corpus-generation";
const JOB_NAME = "generate";
const ATTEMPTS = 3;
const BACKOFF_MS = 60_000;

export interface CorpusJobData {
  corpusId: number;
  organizationId: number;
}

let queue: Queue<CorpusJobData> | null = null;

/** Opened on first use, so importing this file connects to nothing. */
function corpusQueue(): Queue<CorpusJobData> {
  queue ??= new Queue<CorpusJobData>(CORPUS_QUEUE, { connection: { url: REDIS_URL } });
  return queue;
}

/**
 * Queues generation for a corpus. Finished jobs are removed, so a corpus
 * resumed after its job failed can be queued again under the same id; while
 * a job for it is still waiting or active, the add is a no-op and that job
 * does the work.
 */
export async function enqueueCorpusGeneration(
  corpusId: number,
  organizationId: number,
): Promise<void> {
  await corpusQueue().add(
    JOB_NAME,
    { corpusId, organizationId },
    {
      jobId: `corpus-${corpusId}`,
      attempts: ATTEMPTS,
      backoff: { type: "exponential", delay: BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

/**
 * BullMQ states in which a corpus's job will still run. "active" counts: a
 * job the worker has just taken has not claimed its lease yet. One whose
 * worker died is moved back to waiting by BullMQ's stalled-job check.
 */
const PENDING_STATES = new Set(["waiting", "delayed", "active", "prioritized", "waiting-children"]);

/** How long the stale sweep waits on the queue before giving up. */
export const QUEUE_LOOKUP_TIMEOUT_MS = 2_000;
/** After every lookup timed out (Redis unreachable), sweeps skip the queue for this long. */
export const QUEUE_RETRY_AFTER_MS = 60_000;
let queueUnreadableUntil = 0;
const TIMED_OUT = Symbol("timed out");
const ERRORED = Symbol("errored");
type Lookup = boolean | typeof TIMED_OUT | typeof ERRORED;

/** One corpus's lookup, bounded by QUEUE_LOOKUP_TIMEOUT_MS; an error is logged. */
async function lookup(corpusId: number): Promise<Lookup> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), QUEUE_LOOKUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([corpusJobPending(corpusId), timeout]);
  } catch (error) {
    logger.warn(
      `Stale corpus sweep left corpus ${corpusId} alone: its job could not be read (${
        error instanceof Error ? error.message : "unknown error"
      })`,
    );
    return ERRORED;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Of these corpora, the ones the queue holds no job to run. The lookups run
 * in parallel, each bounded on its own; a corpus whose lookup errors or times
 * out is left alone, so one bad or slow job holds back only itself. When no
 * lookup answered and either one timed out or more than one failed, Redis is
 * taken as unreachable (a slow outage, or a fast one such as a refused
 * connection): the result is null, and sweeps skip the queue for
 * QUEUE_RETRY_AFTER_MS, so an outage neither fails a corpus nor stalls each
 * request that sweeps. A single corpus whose job errors never pauses the
 * sweep for anyone else.
 */
export async function corporaWithoutPendingJob(corpusIds: number[]): Promise<number[] | null> {
  if (Date.now() < queueUnreadableUntil) return null;
  const results = await Promise.all(corpusIds.map(lookup));
  const noneAnswered = results.length > 0 && results.every((r) => typeof r !== "boolean");
  if (noneAnswered && (results.includes(TIMED_OUT) || results.length > 1)) {
    queueUnreadableUntil = Date.now() + QUEUE_RETRY_AFTER_MS;
    logger.warn("Stale corpus sweep skipped: the generation queue did not answer.");
    return null;
  }
  return corpusIds.filter((_, i) => results[i] === false);
}

/** Whether the queue still holds a job that will run this corpus. */
export async function corpusJobPending(corpusId: number): Promise<boolean> {
  const job = await corpusQueue().getJob(`corpus-${corpusId}`);
  if (!job) return false;
  return PENDING_STATES.has(await job.getState());
}

export async function processCorpusJob(
  job: Job<CorpusJobData>,
  token?: string,
): Promise<{ status: "complete" | "blocked"; recordCount: number }> {
  const { corpusId, organizationId } = job.data;
  try {
    const result = await runCorpusGeneration({ corpusId, organizationId });
    return { status: result.status, recordCount: result.recordCount };
  } catch (error) {
    if (error instanceof CorpusBusyError) {
      const until = error.leaseExpiresAt?.getTime() ?? Date.now() + LEASE_SECONDS * 1000;
      await job.moveToDelayed(until + 1000, token);
      throw new DelayedError();
    }
    // Not running or gone: a retry would find the same.
    if (error instanceof ConflictException || error instanceof NotFoundException) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }
}

/** A typed error's own code, else a generic one. Never the message. */
function failureCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(code)
    ? code
    : "generation_error";
}

/**
 * Marks the corpus failed once BullMQ has no attempt left. Before that it does
 * nothing: the retry resumes from the log. A lost lease means another runner
 * holds the corpus, so it is left alone. Cannot throw.
 */
export async function onCorpusJobFailed(
  job: Job<CorpusJobData> | undefined,
  error: Error,
): Promise<void> {
  if (!job) return;
  const attempts = job.opts?.attempts ?? 1;
  if (job.attemptsMade < attempts) return;
  if (error instanceof LeaseLostError) return;
  const { corpusId, organizationId } = job.data;
  const failureCode = failureCodeOf(error);
  try {
    await updateCorpusStatusQuery({ corpusId, status: "failed", failureCode }, organizationId);
    logger.error(
      `Corpus ${corpusId} generation failed after ${job.attemptsMade} attempts: ${failureCode}`,
    );
  } catch {
    // If this write did not land, the stale sweep fails the corpus once its
    // job is gone from the queue and its heartbeat is stale.
  }
}

export function createCorpusGenerationWorker(): Worker<CorpusJobData> {
  const worker = new Worker<CorpusJobData>(
    CORPUS_QUEUE,
    (job, token) => processCorpusJob(job, token),
    { connection: { url: REDIS_URL }, concurrency: 1, lockDuration: 10 * 60_000 },
  );
  worker.on("failed", onCorpusJobFailed);
  return worker;
}
