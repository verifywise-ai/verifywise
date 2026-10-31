/**
 * The mirror job of one list (spec D4.7): download it through the page guard, with the validators
 * of the last download; answer `unchanged` on a 304, or when the bodies hash as the last success's
 * did with the same version of the connector; otherwise parse, check, and write the copy in one
 * transaction.
 *
 * A download that is not the whole list never reaches the copy: a body cut at its limit, a
 * document that is not the list, one that parsed with errors, an empty one, and one that holds
 * more than a fifth fewer records than the copy's active ones all fail the sync, and the copy
 * stays as it was. Every attempt gets a run row. A failure stores and logs a fixed code and the
 * list's id, never a message: an error can carry an address, and the EU file's carries a token.
 *
 * A list read by its changes (the CVE records, Ruling 8 of the M2 plan) keeps the last day it
 * applied as its cursor: the sync applies the changes of each later day in order, each day in a
 * transaction of its own that moves the cursor, and takes no record off the copy. A day that does
 * not parse fails the sync and keeps the cursor at the day before it. A sync of such a list without
 * a cursor is refused as `no_baseline`: its lookback comes from a baseline that an operator loads
 * (scripts/vrdbCveBaseline.ts), and a copy of yesterday's changes alone would read as checked.
 */
import { createHash } from "crypto";
import type { VrdbSourceId } from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import { FetchError } from "../../webResearch/guardedFetch";
import {
  BodyTooLargeError,
  type Connector,
  type ConnectorFetch,
  FeedWithoutFileError,
  type IncrementalConnector,
  NotTheListError,
} from "./connectors/types";
import { type MirrorSource, type VrdbSourceDefinition, vrdbSourceOf } from "./sources";
import type {
  ApplyCounts,
  VrdbDeltaWrite,
  VrdbSnapshotWrite,
  VrdbSourceMark,
  VrdbSourceState,
  VrdbSyncRunResult,
} from "./types";
import { ZipError } from "./zip";

/** A list that lost more than this share of the copy's active records fails the sync. */
export const SHRINK_LIMIT = 0.2;
/** Run rows are kept this many days. */
export const SYNC_RUNS_KEPT_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SyncErrorCode =
  | "fetch_failed"
  | "too_large"
  | "parse_errors"
  | "wrong_root"
  | "empty"
  | "shrank"
  | "feed_without_file"
  | "no_baseline"
  | "unexpected";

export interface SyncResult {
  outcome: "ok" | "unchanged" | "failed";
  errorCode?: SyncErrorCode;
  counts?: ApplyCounts;
  /** For a download whose answer asked for a wait (Retry-After): how long, in milliseconds. */
  retryAfterMs?: number;
}

/** The queries of utils/vrdb.utils.ts that a sync uses. */
export interface SyncStore {
  upsertVrdbSourceQuery(definition: VrdbSourceDefinition, now: Date): Promise<void>;
  getVrdbSourceStatesQuery(ids: readonly VrdbSourceId[]): Promise<VrdbSourceState[]>;
  lastSuccessfulHashQuery(id: VrdbSourceId): Promise<string | null>;
  startVrdbSyncRunQuery(id: VrdbSourceId, at: Date): Promise<number>;
  finishVrdbSyncRunQuery(runId: number, result: VrdbSyncRunResult, at: Date): Promise<void>;
  applyVrdbSnapshotQuery(input: VrdbSnapshotWrite): Promise<ApplyCounts>;
  applyVrdbDeltaQuery(input: VrdbDeltaWrite): Promise<ApplyCounts>;
  markVrdbSourceQuery(id: VrdbSourceId, mark: VrdbSourceMark): Promise<void>;
  pruneVrdbSyncRunsQuery(before: Date): Promise<void>;
}

export interface SyncDeps {
  store: SyncStore;
  connector: Connector | IncrementalConnector;
  fetch: ConnectorFetch;
  now: () => Date;
}

/**
 * The SHA-256 of the connector's version and the bodies of a download, each with its length, so
 * that two files never blur and a new parser reads an unchanged file again.
 */
function hashOf(version: number, bodies: readonly string[]): string {
  const hash = createHash("sha256");
  hash.update(`v${version}\n`);
  for (const body of bodies) hash.update(`${body.length}:${body}`);
  return hash.digest("hex");
}

function codeOf(error: unknown): SyncErrorCode {
  if (error instanceof BodyTooLargeError) return "too_large";
  if (error instanceof FeedWithoutFileError) return "feed_without_file";
  if (error instanceof NotTheListError) return "wrong_root";
  if (error instanceof FetchError) return "fetch_failed";
  if (error instanceof ZipError) {
    if (error.code === "too_large") return "too_large";
    return error.code === "not_zip" ? "wrong_root" : "parse_errors";
  }
  return "unexpected";
}

/** The wait the server of a failed download asked for, as the result gives it; none for any other. */
const waitOf = (error: unknown): { retryAfterMs?: number } =>
  error instanceof FetchError && error.retryAfterMs !== undefined
    ? { retryAfterMs: error.retryAfterMs }
    : {};

/** A sync that ends without an exception, but does not apply what it read. */
class Refused extends Error {
  constructor(readonly code: SyncErrorCode) {
    super(code);
    this.name = "Refused";
  }
}

/**
 * The row of one sync attempt, and the note it leaves on its list. Noting is best effort: a store
 * that cannot note the end of an attempt is logged, and the sync's answer stands.
 */
function attemptOf(id: VrdbSourceId, store: SyncStore, now: () => Date) {
  let runId: number | null = null;
  return {
    /** Writes the list's definition, opens the run row, and gives where the copy stands. */
    async start(definition: VrdbSourceDefinition): Promise<VrdbSourceState | undefined> {
      const startedAt = now();
      await store.upsertVrdbSourceQuery(definition, startedAt);
      runId = await store.startVrdbSyncRunQuery(id, startedAt);
      const [state] = await store.getVrdbSourceStatesQuery([id]);
      return state;
    },
    async finish(result: VrdbSyncRunResult, mark?: VrdbSourceMark): Promise<void> {
      const at = now();
      try {
        if (mark) await store.markVrdbSourceQuery(id, mark);
        if (runId !== null) await store.finishVrdbSyncRunQuery(runId, result, at);
        await store.pruneVrdbSyncRunsQuery(new Date(at.getTime() - SYNC_RUNS_KEPT_DAYS * DAY_MS));
      } catch (error) {
        logger.warn(
          `vendor risk database: the sync of ${id} could not be noted (${codeOf(error)})`,
        );
      }
    },
  };
}

/**
 * Brings the copy of one list up to date. It answers what happened, failed included, and throws
 * only for an id whose list the connector does not read the way the list's definition says: whole,
 * or by its changes.
 */
export async function syncSource(id: VrdbSourceId, deps: SyncDeps): Promise<SyncResult> {
  const definition = vrdbSourceOf(id);
  const { connector } = deps;
  if (connector.kind === "incremental") {
    if (definition.mode !== "mirror" || definition.missingStatus !== null) {
      throw new Error(`${id} is not read by its changes`);
    }
    return syncChanges(id, definition, { ...deps, connector });
  }
  if (definition.mode !== "mirror" || definition.missingStatus === null) {
    throw new Error(`The copy of ${id} is not taken as a whole`);
  }
  return syncWhole(id, definition, definition.missingStatus, { ...deps, connector });
}

async function syncWhole(
  id: VrdbSourceId,
  definition: MirrorSource,
  missingStatus: "withdrawn" | "delisted",
  deps: SyncDeps & { connector: Connector },
): Promise<SyncResult> {
  const { store, connector, fetch, now } = deps;
  const attempt = attemptOf(id, store, now);
  let download: { bytes: number; rawSnapshotHash: string } | undefined;

  try {
    const state = await attempt.start(definition);

    const snapshot = await connector.download(fetch, {
      etag: state?.etag ?? null,
      lastModified: state?.lastModified ?? null,
    });
    const at = now();
    if (snapshot === "unchanged") {
      await attempt.finish({ outcome: "unchanged" }, { outcome: "unchanged", at });
      return { outcome: "unchanged" };
    }
    download = {
      bytes: snapshot.bytes,
      rawSnapshotHash: hashOf(connector.version, snapshot.bodies),
    };
    if (download.rawSnapshotHash === (await store.lastSuccessfulHashQuery(id))) {
      await attempt.finish(
        { outcome: "unchanged", ...download },
        {
          outcome: "unchanged",
          at,
          validators: { etag: snapshot.etag, lastModified: snapshot.lastModified },
        },
      );
      return { outcome: "unchanged" };
    }

    const parsed = connector.parse(snapshot);
    if (parsed.root === null) throw new Refused("wrong_root");
    if (parsed.errors > 0) throw new Refused("parse_errors");
    const seen = new Set(parsed.records.map((record) => record.sourceRecordId)).size;
    if (seen === 0) throw new Refused("empty");
    const active = state?.activeRecords ?? 0;
    if (active > 0 && (active - seen) / active > SHRINK_LIMIT) throw new Refused("shrank");

    const counts = await store.applyVrdbSnapshotQuery({
      sourceId: id,
      records: parsed.records,
      missingStatus,
      rawSnapshotHash: download.rawSnapshotHash,
      sourceVersion: parsed.sourceVersion,
      etag: snapshot.etag,
      lastModified: snapshot.lastModified,
      at,
    });
    await attempt.finish({ outcome: "ok", ...download, counts });
    logger.info(
      `vendor risk database: ${id} synced (${counts.seen} records, ${counts.inserted} new, ${counts.updated} changed, ${counts.statusChanged} with a new status)`,
    );
    return { outcome: "ok", counts };
  } catch (error) {
    const errorCode = error instanceof Refused ? error.code : codeOf(error);
    logger.warn(`vendor risk database: the sync of ${id} failed (${errorCode})`);
    await attempt.finish(
      { outcome: "failed", errorCode, ...download },
      { outcome: "failed", at: now(), errorCode },
    );
    return { outcome: "failed", errorCode, ...waitOf(error) };
  }
}

/**
 * The sync of a list read by its changes: the connector reads the days after the cursor, and each
 * day is checked and applied in order, moving the cursor. A day that does not parse fails the sync
 * after the days before it were applied; what they changed is the run's count.
 */
async function syncChanges(
  id: VrdbSourceId,
  definition: MirrorSource,
  deps: SyncDeps & { connector: IncrementalConnector },
): Promise<SyncResult> {
  const { store, connector, fetch, now } = deps;
  const attempt = attemptOf(id, store, now);
  let download: { bytes: number; rawSnapshotHash: string } | undefined;
  let applied: ApplyCounts | undefined;

  try {
    const state = await attempt.start(definition);
    const cursor = state?.cursor ?? null;
    if (cursor === null) throw new Refused("no_baseline");

    const days = await connector.download(fetch, cursor, now());
    if (days === "unchanged" || days.length === 0) {
      await attempt.finish({ outcome: "unchanged" }, { outcome: "unchanged", at: now() });
      return { outcome: "unchanged" };
    }
    download = {
      bytes: days.reduce((sum, { snapshot }) => sum + snapshot.bytes, 0),
      rawSnapshotHash: hashOf(
        connector.version,
        days.flatMap(({ snapshot }) => snapshot.bodies),
      ),
    };

    for (const { day, snapshot } of days) {
      const parsed = connector.parse(snapshot);
      if (parsed.root === null) throw new Refused("wrong_root");
      if (parsed.errors > 0) throw new Refused("parse_errors");
      const counts = await store.applyVrdbDeltaQuery({
        sourceId: id,
        records: parsed.records,
        cursor: { day },
        rawSnapshotHash: hashOf(connector.version, snapshot.bodies),
        at: now(),
      });
      applied = {
        seen: (applied?.seen ?? 0) + counts.seen,
        inserted: (applied?.inserted ?? 0) + counts.inserted,
        updated: (applied?.updated ?? 0) + counts.updated,
        statusChanged: (applied?.statusChanged ?? 0) + counts.statusChanged,
      };
    }
    const counts = applied ?? { seen: 0, inserted: 0, updated: 0, statusChanged: 0 };
    await attempt.finish({ outcome: "ok", ...download, counts });
    logger.info(
      `vendor risk database: ${id} synced (${days.length} days, ${counts.seen} records, ${counts.inserted} new, ${counts.updated} changed, ${counts.statusChanged} with a new status)`,
    );
    return { outcome: "ok", counts };
  } catch (error) {
    const errorCode = error instanceof Refused ? error.code : codeOf(error);
    logger.warn(`vendor risk database: the sync of ${id} failed (${errorCode})`);
    const counts = applied === undefined ? {} : { counts: applied };
    await attempt.finish(
      { outcome: "failed", errorCode, ...download, ...counts },
      { outcome: "failed", at: now(), errorCode },
    );
    return { outcome: "failed", errorCode, ...counts, ...waitOf(error) };
  }
}
