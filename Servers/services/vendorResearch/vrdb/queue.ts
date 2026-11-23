/**
 * The queue of the vendor risk database: the load of the bundled lists (loadBundled.ts) and the
 * status job of a list whose records changed status (relabel.ts, Ruling 12 of the M2 plan), taken
 * one at a time by the worker of worker.ts. A queue of its own, as the research has one (R28), and
 * never emptied.
 *
 * Nothing is downloaded: each release ships the lists as bundles (bundle.ts). At every start the
 * backend (jobs/producer.ts) queues one load job while the records are on (VENDOR_RESEARCH_RECORDS);
 * the job writes only the bundles that are new since the last start. It also removes the per-list
 * sync schedulers that builds before the bundles registered, so that no deployment keeps
 * downloading after an upgrade.
 */
import { type JobsOptions, Queue } from "bullmq";
import {
  VRDB_SOURCE_IDS,
  type VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { REDIS_URL } from "../../../database/redis";
import { type VendorResearchConfig, getVendorResearchConfig } from "../config";

/** The name of the queue. The producer and the worker must agree on it. */
export const VRDB_QUEUE = "vendor-risk-database";

/** The job name of the load of the bundled lists; it carries no data. */
export const VRDB_LOAD_JOB = "vrdb_load";

/** The job name of the status job of one list, `{ sourceId }` (relabel.ts). */
export const VRDB_RELABEL_JOB = "vrdb_relabel";

/**
 * A failed job is tried again three times, a minute apart and then more: the database may be busy
 * at start. Settled jobs are not kept.
 */
export const VRDB_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

export const vrdbQueue = new Queue(VRDB_QUEUE, { connection: { url: REDIS_URL } });

/** The id of the sync scheduler that builds before the bundles registered for a list. */
export const legacySyncSchedulerId = (id: VrdbSourceId): string => `vrdb_sync_${id}`;

/**
 * The deduplication id of the load job: while one waits or runs, the load another replica's start
 * adds is dropped. A load writes only what changed, so a second one would only read the bundles.
 */
export const VRDB_LOAD_DEDUPLICATION_ID = "vrdb_load";

/**
 * The deduplication id of the status job of a list. While a job of the list waits, an add is
 * dropped: the waiting job reads the findings when it starts. While one runs, an add is kept as the
 * next job of the list (BullMQ's `keepLastIfActive`): the running job may have read the findings
 * before the change was written. It is no job id: BullMQ drops an add whose job id exists before it
 * looks at the deduplication, the running job's included.
 */
export const vrdbRelabelJobId = (id: VrdbSourceId): string => `vrdb_relabel_${id}`;

/** Adds the status job of a list whose records changed status. `queue` is for the tests. */
export async function enqueueRelabel(
  sourceId: VrdbSourceId,
  queue: Pick<Queue, "add"> = vrdbQueue,
): Promise<void> {
  await queue.add(
    VRDB_RELABEL_JOB,
    { sourceId },
    {
      ...VRDB_JOB_OPTIONS,
      deduplication: { id: vrdbRelabelJobId(sourceId), keepLastIfActive: true },
    },
  );
}

/** Whether the lists are loaded: unless the records are off, which is the only switch. */
export const vrdbRecordsOn = (config: Pick<VendorResearchConfig, "records">): boolean =>
  config.records;

/**
 * Removes the sync schedulers of earlier builds, and queues the load of the bundles while the
 * records are on. `config` and `queue` are for the tests.
 */
export async function scheduleVendorRiskDatabaseLoad(
  config: VendorResearchConfig = getVendorResearchConfig(),
  queue: Pick<Queue, "removeJobScheduler" | "add"> = vrdbQueue,
): Promise<void> {
  for (const id of VRDB_SOURCE_IDS) await queue.removeJobScheduler(legacySyncSchedulerId(id));
  if (!vrdbRecordsOn(config)) return;
  await queue.add(
    VRDB_LOAD_JOB,
    {},
    { ...VRDB_JOB_OPTIONS, deduplication: { id: VRDB_LOAD_DEDUPLICATION_ID } },
  );
}
