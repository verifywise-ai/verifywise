/**
 * The queue of the vendor risk database (spec D4.7): the syncs of the mirrored lists, one job per
 * list and sync, and the status job of a list whose records changed status (relabel.ts, Ruling 12
 * of the M2 plan), taken one at a time by the worker of worker.ts. A queue of its own, as the
 * research has one (R28): a sync downloads tens of megabytes and must not hold the places of the
 * automations, and this queue is never emptied.
 *
 * One BullMQ scheduler per active list, at the list's own minute (vrdb/sources.ts), in UTC. The
 * backend registers them at startup (jobs/producer.ts) while the records are on
 * (VENDOR_RESEARCH_RECORDS; the database has no switch of its own), and removes them otherwise, so
 * turning the records off stops every download; a list behind a closed gate (gates.ts) has no
 * scheduler either. An upsert by id changes nothing when the scheduler exists, so every start can
 * call it. An active list that was never copied gets a first sync at once as well, so that a new
 * deployment does not leave the runs without it until its scheduler's next minute, up to six hours
 * later. A list read by its changes (the CVE records) gets none: its first copy is a baseline that
 * an operator loads (scripts/vrdbCveBaseline.ts), and a sync before that is refused as
 * `no_baseline`.
 */
import { type JobsOptions, Queue } from "bullmq";
import type { VrdbSourceId } from "../../../domain.layer/interfaces/i.vendorResearch";
import { REDIS_URL } from "../../../database/redis";
import logger from "../../../utils/logger/fileLogger";
import { getVrdbSourceStatesQuery } from "../../../utils/vrdb.utils";
import { type VendorResearchConfig, getVendorResearchConfig } from "../config";
import { VRDB_SOURCES, activeMirrors, isMirror } from "./sources";
import type { VrdbSourceState } from "./types";

/** The name of the queue of the syncs. The producer and the worker must agree on it. */
export const VRDB_QUEUE = "vendor-risk-database";

/** The job name of the sync of one list, `{ sourceId }`. */
export const VRDB_SYNC_JOB = "vrdb_sync";

/** The job name of the status job of one list, `{ sourceId }` (relabel.ts). */
export const VRDB_RELABEL_JOB = "vrdb_relabel";

/**
 * A failed sync is tried again three times, a minute apart and then more: a list's host that is
 * down for a moment should not leave the copy a sync older. Settled jobs are not kept.
 */
export const VRDB_SYNC_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

/**
 * A failed status job is tried again as a failed sync is. A settled one is not kept either: it
 * would keep its id, and BullMQ would add no later status job of its list.
 */
export const VRDB_RELABEL_JOB_OPTIONS: JobsOptions = VRDB_SYNC_JOB_OPTIONS;

export const vrdbQueue = new Queue(VRDB_QUEUE, { connection: { url: REDIS_URL } });

/** The id of the scheduler of a list; no colon, as no scheduler id of the code base has one. */
export const vrdbSchedulerId = (id: VrdbSourceId): string => `vrdb_sync_${id}`;

/**
 * The id of the first sync of a list that was never copied. BullMQ adds nothing while a job of the
 * id is waiting or running, so two starts in a row queue one sync.
 */
export const vrdbFirstSyncJobId = (id: VrdbSourceId): string => `vrdb_sync_first_${id}`;

/**
 * The id of the status job of a list. BullMQ adds nothing while a job of the id is waiting or
 * running, so one waits per list, and the changes of several syncs are relabeled by one job.
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
    { ...VRDB_RELABEL_JOB_OPTIONS, jobId: vrdbRelabelJobId(sourceId) },
  );
}

/** Whether the lists are mirrored: unless the records are off, which is the only switch. */
export const vrdbSyncsOn = (config: Pick<VendorResearchConfig, "records">): boolean =>
  config.records;

/** The name of an error, for a log line: its message can carry a query. */
function errorName(error: unknown): string {
  return error instanceof Error && /^[A-Za-z_$][\w$.]{0,59}$/.test(error.name)
    ? error.name
    : "unknown";
}

/**
 * Upserts the scheduler of every active list while the syncs are on, and queues a first sync of
 * every active list that has no copy yet and is copied whole, not read by its changes; removes the
 * schedulers of the other lists, and of every list while the syncs are off. A failure to read the
 * lists' states is logged and queues nothing: the schedulers sync them at their minutes. `config`,
 * `queue` and `sourceStates` are for the tests.
 */
export async function scheduleVendorRiskDatabaseSync(
  config: VendorResearchConfig = getVendorResearchConfig(),
  queue: Pick<Queue, "upsertJobScheduler" | "removeJobScheduler" | "add"> = vrdbQueue,
  sourceStates: (
    ids: readonly VrdbSourceId[],
  ) => Promise<VrdbSourceState[]> = getVrdbSourceStatesQuery,
): Promise<void> {
  const active = vrdbSyncsOn(config) ? activeMirrors() : [];
  for (const definition of VRDB_SOURCES.filter(isMirror)) {
    const schedulerId = vrdbSchedulerId(definition.id);
    if (active.includes(definition)) {
      await queue.upsertJobScheduler(
        schedulerId,
        { pattern: definition.schedule, tz: "UTC" },
        { name: VRDB_SYNC_JOB, data: { sourceId: definition.id }, opts: VRDB_SYNC_JOB_OPTIONS },
      );
    } else {
      await queue.removeJobScheduler(schedulerId);
    }
  }
  if (active.length === 0) return;

  let states: VrdbSourceState[];
  try {
    states = await sourceStates(active.map((definition) => definition.id));
  } catch (error) {
    logger.warn(
      `vendor risk database: the states of the lists could not be read, so no first sync was queued (error ${errorName(error)})`,
    );
    return;
  }
  for (const definition of active) {
    // A list read by its changes gets its first copy from its baseline (scripts/vrdbCveBaseline.ts),
    // which an operator loads once. Without a cursor a sync of it is refused as no_baseline, so a
    // first sync would only record a failed sync at every start.
    if (definition.missingStatus === null) continue;
    const copied = states.some(
      (state) => state.id === definition.id && state.lastSuccessAt !== null,
    );
    if (copied) continue;
    await queue.add(
      VRDB_SYNC_JOB,
      { sourceId: definition.id },
      { ...VRDB_SYNC_JOB_OPTIONS, jobId: vrdbFirstSyncJobId(definition.id) },
    );
  }
}
