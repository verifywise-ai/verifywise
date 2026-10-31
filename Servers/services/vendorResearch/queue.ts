/**
 * The queue of the vendor research runs, and the producer that adds a run to it.
 *
 * A run has a queue of its own, with a worker of its own (see worker.ts), and does not share the
 * queue of the automations. A run holds its place for minutes (up to 5 for the research loop, 2 for
 * the analysis and half a minute for the checks after it), while every other job on that queue is
 * short, so on a shared queue a burst of runs kept the notifications, the recomputes and the
 * reports waiting, and a long line of other jobs could leave a run queued past the 15 minutes
 * after which it is not started. The automation queue is also emptied each time the backend starts
 * (`obliterate` in the schedulers of automationProducer.ts), which lost the runs that were waiting.
 * This queue is never emptied. A run lost another way (Redis wiped) is ended by the stale rule, as
 * before.
 *
 * The queue also carries the repeating job of the scheduled scan (see scan.ts): one job an hour that
 * starts the runs of the vendors that are due. It is a scheduler of BullMQ, which the backend
 * registers at startup in jobs/producer.ts; registering it again changes nothing.
 */
import { type JobsOptions, Queue } from "bullmq";
import { REDIS_URL } from "../../database/redis";

/** The name of the queue of the research runs. The producer and the worker must agree on it. */
export const VENDOR_RESEARCH_QUEUE = "vendor-research";

export const vendorResearchQueue = new Queue(VENDOR_RESEARCH_QUEUE, {
  connection: { url: REDIS_URL },
});

/** The name of the job that carries out one vendor research run; the worker checks it. */
export const VENDOR_RESEARCH_JOB = "vendor_research";

/** The name of the repeating job of the scheduled scan; the worker checks it too. */
export const VENDOR_RESEARCH_SCAN_JOB = "vendor_research_scan";

/**
 * The id of the queue job of one vendor research run.
 *
 * One id per RUN, not per vendor. BullMQ silently ignores an `add` whose jobId still exists, and
 * the job of an earlier run can still sit in Redis: the stale sweep fails a run that waited too
 * long, for example because the worker was down, and its job stays in the queue. An id per vendor
 * would then swallow the `add` of the vendor's next run, and that run would never start. The
 * partial unique index vendor_research_runs_active_uniq already allows one active run per vendor,
 * so an id per vendor would add no protection.
 *
 * The id has no colon: BullMQ 6.3.11 rejects a custom id with a colon unless it has exactly three
 * parts.
 */
export const vendorResearchJobId = (
  organizationId: number,
  vendorId: number,
  runId: number,
): string => `vendor-research-${organizationId}-${vendorId}-${runId}`;

/**
 * Two attempts, for the failures that make the job throw: those of Redis and the database before
 * the run is marked running, when the run is still queued and a retry can start it. The pipeline
 * catches a failing model call, and a web that cannot be reached at all, itself and ends the run as
 * failed; a search that fails or a page that cannot be read is a result inside the run. So a retry
 * never pays for the model calls or the searches twice. Settled jobs are removed, so no retained
 * job holds on to an id.
 */
export const VENDOR_RESEARCH_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
};

/** Research one vendor in the background, for a run that was just created as queued. */
export async function enqueueVendorResearch(
  organizationId: number,
  vendorId: number,
  runId: number,
) {
  return vendorResearchQueue.add(
    VENDOR_RESEARCH_JOB,
    { organizationId, vendorId, runId },
    {
      jobId: vendorResearchJobId(organizationId, vendorId, runId),
      ...VENDOR_RESEARCH_JOB_OPTIONS,
    },
  );
}

/**
 * Adds the repeating job of the scheduled scan: at 17 minutes past every hour, off the slots where
 * the other schedulers pile up (the top of the hour, every 5 minutes, every 15 minutes). The
 * approval overdue sweep (automationProducer.ts) starts at the same minute, but it runs on the
 * automation queue, which has a worker of its own, so the two never wait for each other. The
 * scheduler id is the job name, and an upsert by id changes nothing when it exists, so every start
 * of the backend can call this. It does not empty the queue, which holds the runs that are waiting.
 * The job has a single attempt and is not kept: a scan that fails is logged by the worker, and the
 * scan of the next hour does its work.
 */
export async function scheduleVendorResearchScan(): Promise<void> {
  await vendorResearchQueue.upsertJobScheduler(
    VENDOR_RESEARCH_SCAN_JOB,
    { pattern: "17 * * * *" },
    {
      name: VENDOR_RESEARCH_SCAN_JOB,
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    },
  );
}
