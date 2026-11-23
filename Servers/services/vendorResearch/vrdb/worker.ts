/**
 * The worker of the vendor risk database's queue (queue.ts), in the process of the other workers
 * (jobs/worker.ts): it takes one job at a time. The load job loads the bundles the release ships
 * (loadBundled.ts) and checks the records switch again, as an operator may turn the records off
 * after the job was queued; it downloads nothing. A load that changed the status of a record adds
 * the status job of its list (relabel.ts), which the worker takes as it takes a load.
 */
import { type Job, Worker } from "bullmq";
import { REDIS_URL } from "../../../database/redis";
import {
  VRDB_SOURCE_IDS,
  type VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import * as vrdbStore from "../../../utils/vrdb.utils";
import { type VendorResearchConfig, getVendorResearchConfig } from "../config";
import { type LoadResult, loadBundledSources } from "./loadBundled";
import {
  VRDB_LOAD_JOB,
  VRDB_QUEUE,
  VRDB_RELABEL_JOB,
  enqueueRelabel,
  vrdbRecordsOn,
} from "./queue";
import { relabelSource } from "./relabel";

export interface VrdbJobDeps {
  /** The settings now; the environment by default. */
  config?: VendorResearchConfig;
  /** Loads every bundle (loadBundled.ts). */
  load?: () => Promise<LoadResult[]>;
  /** Adds the status job of a list (queue.ts). */
  enqueueRelabel?: (id: VrdbSourceId) => Promise<void>;
  /** The status job of a list (relabel.ts). */
  relabel?: (id: VrdbSourceId) => Promise<RelabelResult>;
}

/** What the status job of a list did. */
export interface RelabelResult {
  relabeled: number;
}

/** The name of an error, for a log line: its message can carry a query. */
function errorName(error: unknown): string {
  return error instanceof Error && /^[A-Za-z_$][\w$.]{0,59}$/.test(error.name)
    ? error.name
    : "unknown";
}

/** A load in which the database failed to take some lists; its text names only their ids. */
export class VrdbLoadFailed extends Error {
  constructor(readonly sourceIds: VrdbSourceId[]) {
    super(`The load of ${sourceIds.join(", ")} failed`);
    this.name = "VrdbLoadFailed";
  }
}

const isVrdbSourceId = (value: unknown): value is VrdbSourceId =>
  typeof value === "string" && (VRDB_SOURCE_IDS as readonly string[]).includes(value);

/**
 * Carries out one job of the queue. The load gives what it did for each list, or null while the
 * records are off, and adds the status job of each list whose records changed status. The status
 * job gives what it relabeled; it reads the stored copies only, so the records switch does not
 * stop it. It throws for another job, and for a status job that names no list of the database.
 */
export async function processVrdbJob(
  job: Pick<Job, "name" | "data">,
  deps: VrdbJobDeps = {},
): Promise<LoadResult[] | RelabelResult | null> {
  if (job.name === VRDB_LOAD_JOB) {
    if (!vrdbRecordsOn(deps.config ?? getVendorResearchConfig())) return null;
    const results = await (deps.load ?? (() => loadBundledSources({ store: vrdbStore })))();
    for (const result of results) {
      if ((result.counts?.statusChanged ?? 0) === 0) continue;
      // The copy stands whether or not the job is added: the next load that changes it adds one.
      try {
        await (deps.enqueueRelabel ?? enqueueRelabel)(result.sourceId);
      } catch (error) {
        logger.warn(
          `vendor risk database: the status job of ${result.sourceId} could not be added (error ${errorName(error)})`,
        );
      }
    }
    // A list the database failed to take (load_failed) is tried again by the job's retries
    // (VRDB_JOB_OPTIONS): the database may be busy at start. The lists that loaded are skipped on
    // the retry by their hash. A missing or unreadable bundle (bundle_*) is no reason to retry:
    // the next try reads the same file.
    const failed = results.filter((result) => result.errorCode === "load_failed");
    if (failed.length > 0) throw new VrdbLoadFailed(failed.map((result) => result.sourceId));
    return results;
  }
  if (job.name !== VRDB_RELABEL_JOB) throw new Error(`Unknown job: ${job.name}`);
  const data: unknown = job.data;
  const sourceId =
    typeof data === "object" && data !== null ? (data as { sourceId?: unknown }).sourceId : null;
  if (!isVrdbSourceId(sourceId)) {
    throw new Error("The job names no list of the vendor risk database");
  }
  return (deps.relabel ?? relabelSource)(sourceId);
}

export const createVrdbWorker = (concurrency: number = 1, queueName: string = VRDB_QUEUE) => {
  const worker = new Worker(queueName, async (job: Job) => processVrdbJob(job), {
    connection: { url: REDIS_URL },
    concurrency,
  });

  worker.on("completed", (job) => {
    logger.debug(`vendor risk database job ${job.id} has been completed`);
  });
  worker.on("failed", (job, error) => {
    // A failed load names its lists; any other error is logged by its name: the message of a
    // database error can carry a query's values.
    const failure = error instanceof VrdbLoadFailed ? error.message : errorName(error);
    logger.error(`vendor risk database job ${job?.id} failed: ${failure}`);
  });

  return worker;
};
