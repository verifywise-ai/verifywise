/**
 * The worker of the vendor risk database's queue (queue.ts), in the process of the other workers
 * (jobs/worker.ts): it takes one job at a time, since a list is tens of megabytes and two syncs
 * share no work. A sync job checks the records switch and its list's gate again, as an operator may
 * turn the records off after its scheduler fired (the database has no flag of its own), and a sync
 * that failed on the way throws so that BullMQ tries it again (VRDB_SYNC_JOB_OPTIONS). A sync the
 * list refused, or whose answer asked for a wait, is not tried again: its list's next scheduled
 * sync is. A sync that changed the status of a record adds the status job of its list
 * (relabel.ts), which the worker takes as it takes a sync.
 */
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { REDIS_URL } from "../../../database/redis";
import {
  VRDB_SOURCE_IDS,
  type VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import * as vrdbStore from "../../../utils/vrdb.utils";
import { guardedConditionalFetch } from "../../webResearch/guardedFetch";
import { type VendorResearchConfig, getVendorResearchConfig } from "../config";
import { cveConnector } from "./connectors/cve";
import { euConnector } from "./connectors/eu";
import { kevConnector } from "./connectors/kev";
import { ofacConnector } from "./connectors/ofac";
import type { Connector, ConnectorFetch, IncrementalConnector } from "./connectors/types";
import { ukConnector } from "./connectors/uk";
import { unConnector } from "./connectors/un";
import { VRDB_QUEUE, VRDB_RELABEL_JOB, VRDB_SYNC_JOB, enqueueRelabel, vrdbSyncsOn } from "./queue";
import { relabelSource } from "./relabel";
import { activeMirrors } from "./sources";
import { type SyncErrorCode, type SyncResult, syncSource } from "./sync";

/**
 * The connector of each list the job copies. A list behind a closed gate (the UN list, Q6) has its
 * connector here, and no job of it runs until the gate opens (`processVrdbJob`). The gate of the
 * CVE records (Q7) is open: their job reads the changes since the baseline that an operator loads
 * (scripts/vrdbCveBaseline.ts), and is refused as `no_baseline` until then.
 */
const CONNECTORS: Partial<Record<VrdbSourceId, Connector | IncrementalConnector>> = {
  kev: kevConnector,
  ofac: ofacConnector,
  uk_sanctions: ukConnector,
  eu_fsf: euConnector,
  cve: cveConnector,
  un_sanctions: unConnector,
};

/**
 * A list's file through the page guard: its address policy, its size cap and content types, the
 * bot's user agent, and the validators of the copy. The lists are files their operators publish
 * for download, read without robots.txt as the per-run lookups of records/ read them.
 */
export const connectorFetch: ConnectorFetch = (url, validators, limits) =>
  guardedConditionalFetch(url, validators, {
    maxBytes: limits.maxBytes,
    allowedContentTypes: limits.allowedContentTypes,
    totalTimeoutMs: limits.totalTimeoutMs,
  });

/** The sync of a list with the database, its connector and the guard. */
const syncWithDatabase = (id: VrdbSourceId): Promise<SyncResult> => {
  const connector = CONNECTORS[id];
  if (connector === undefined) throw new Error(`No connector copies ${id}`);
  return syncSource(id, {
    store: vrdbStore,
    connector,
    fetch: connectorFetch,
    now: () => new Date(),
  });
};

export interface VrdbJobDeps {
  /** The settings now; the environment by default. */
  config?: VendorResearchConfig;
  sync?: (id: VrdbSourceId) => Promise<SyncResult>;
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

/** A sync that failed, by its list and its code: its text holds nothing else, so a log may show it. */
export class VrdbSyncFailed extends Error {
  constructor(sourceId: VrdbSourceId, code: string) {
    super(`The sync of ${sourceId} failed (${code})`);
    this.name = "VrdbSyncFailed";
  }
}

/**
 * A failed sync the job does not try again, by its list and its code: BullMQ ends a job that
 * throws an UnrecoverableError, and the list's next scheduled sync asks again.
 */
export class VrdbSyncNotRetried extends UnrecoverableError {
  constructor(sourceId: VrdbSourceId, code: string) {
    super(`The sync of ${sourceId} failed (${code})`);
  }
}

/**
 * The codes of a sync that was refused: the file was not the list, did not parse, held nothing,
 * lost more than a fifth of the copy's records, was larger than its cap, or the feed named no
 * file, so a download a minute later gets the same file; or a list read by its changes has no
 * baseline yet, which only an operator loads.
 */
const REFUSALS: ReadonlySet<SyncErrorCode> = new Set<SyncErrorCode>([
  "wrong_root",
  "parse_errors",
  "empty",
  "shrank",
  "too_large",
  "feed_without_file",
  "no_baseline",
]);

const isVrdbSourceId = (value: unknown): value is VrdbSourceId =>
  typeof value === "string" && (VRDB_SOURCE_IDS as readonly string[]).includes(value);

/**
 * Carries out one job of the queue, for the list it names: its sync, or its status job. A sync
 * gives its result, or null while the records are off or the list's gate is closed, and adds the
 * status job of its list when it changed a status, a failed sync of a list read by its changes
 * included (the days it applied stay applied). The status job gives what it relabeled; it reads
 * the stored copies only, so neither the records switch nor the gates stop it. It throws for
 * another job, for a list that is not the database's, and for a failed sync, with a fixed text:
 * VrdbSyncFailed for one that failed on the way, which BullMQ tries again, and VrdbSyncNotRetried
 * for one the list refused or whose answer asked for a wait (Retry-After), which a retry a minute
 * later would not help or would send too soon.
 */
export async function processVrdbJob(
  job: Pick<Job, "name" | "data">,
  deps: VrdbJobDeps = {},
): Promise<SyncResult | RelabelResult | null> {
  if (job.name !== VRDB_SYNC_JOB && job.name !== VRDB_RELABEL_JOB) {
    throw new Error(`Unknown job: ${job.name}`);
  }
  const data: unknown = job.data;
  const sourceId =
    typeof data === "object" && data !== null ? (data as { sourceId?: unknown }).sourceId : null;
  if (!isVrdbSourceId(sourceId)) {
    throw new Error("The job names no list of the vendor risk database");
  }
  if (job.name === VRDB_RELABEL_JOB) return (deps.relabel ?? relabelSource)(sourceId);
  const config = deps.config ?? getVendorResearchConfig();
  if (!vrdbSyncsOn(config)) return null;
  if (!activeMirrors().some((definition) => definition.id === sourceId)) return null;
  const result = await (deps.sync ?? syncWithDatabase)(sourceId);
  if ((result.counts?.statusChanged ?? 0) > 0) {
    // The copy stands whether or not the job is added: a later change adds the next one.
    try {
      await (deps.enqueueRelabel ?? enqueueRelabel)(sourceId);
    } catch (error) {
      logger.warn(
        `vendor risk database: the status job of ${sourceId} could not be added (error ${errorName(error)})`,
      );
    }
  }
  if (result.outcome === "failed") {
    const code = result.errorCode ?? "unknown";
    const refused = result.errorCode !== undefined && REFUSALS.has(result.errorCode);
    if (refused || result.retryAfterMs !== undefined) throw new VrdbSyncNotRetried(sourceId, code);
    throw new VrdbSyncFailed(sourceId, code);
  }
  return result;
}

/**
 * `queueName` is the VRDB queue, except in a test against a real Redis, which uses a queue of its
 * own so that it never takes the jobs of a developer's backend.
 */
export const createVrdbWorker = (concurrency: number = 1, queueName: string = VRDB_QUEUE) => {
  const worker = new Worker(queueName, async (job: Job) => processVrdbJob(job), {
    connection: { url: REDIS_URL },
    concurrency,
  });

  worker.on("completed", (job) => {
    logger.debug(`vendor risk database job ${job.id} has been completed`);
  });
  worker.on("failed", (job, error) => {
    // A failed sync says which list and why; any other error, the status job's from the database
    // say, is logged by its name: its message can carry a query's values or an address.
    const failure =
      error instanceof VrdbSyncFailed || error instanceof VrdbSyncNotRetried
        ? error.message
        : errorName(error);
    logger.error(`vendor risk database job ${job?.id} failed: ${failure}`);
  });

  return worker;
};
