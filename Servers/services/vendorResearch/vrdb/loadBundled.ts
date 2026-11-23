/**
 * Loads the bundled copies of the lists (bundle.ts) into the vendor risk database. Nothing is
 * downloaded: the release carries the bundles, and the worker loads them once at start (queue.ts).
 *
 * A bundle already loaded is left alone: its hash is the snapshot hash of the list's last
 * successful load, so a restart writes nothing. A new bundle is applied as a sync applied a
 * download, with the same queries, and its records and the list's last success are dated by the
 * day the bundle was built, so that "As of" says how old the copy is, not when the server started.
 *
 * - A list taken whole replaces its copy: a stored record that the new bundle lacks becomes
 *   withdrawn or delisted, as the list's definition says (applyVrdbSnapshotQuery).
 * - The CVE records are applied as changes (applyVrdbDeltaQuery): the bundle's records, and the ids
 *   the copy holds that the bundle no longer does are retired (they lose their keys, so no run is
 *   offered them). The cursor is the last day the bundle holds.
 *
 * A list with no bundle, or one that cannot be read, is noted as failed and keeps its copy.
 */
import type { VrdbSourceId } from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import type * as vrdbStore from "../../../utils/vrdb.utils";
import { BundleError, type VrdbBundle, bundleDir, readBundle } from "./bundle";
import { type MirrorSource, activeMirrors } from "./sources";
import type { ApplyCounts } from "./types";

/** Run rows are kept this many days. */
export const LOAD_RUNS_KEPT_DAYS = 90;
/** The CVE records and retired ids are applied in batches of this many, as the baseline was. */
export const DELTA_BATCH = 1_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LoadStore = Pick<
  typeof vrdbStore,
  | "upsertVrdbSourceQuery"
  | "lastSuccessfulHashQuery"
  | "startVrdbSyncRunQuery"
  | "finishVrdbSyncRunQuery"
  | "markVrdbSourceQuery"
  | "pruneVrdbSyncRunsQuery"
  | "applyVrdbSnapshotQuery"
  | "applyVrdbDeltaQuery"
  | "listVrdbKeyedRecordIdsQuery"
>;

export interface LoadDeps {
  store: LoadStore;
  dir?: string;
  now?: () => Date;
}

export interface LoadResult {
  sourceId: VrdbSourceId;
  outcome: "ok" | "unchanged" | "failed";
  errorCode?: string;
  counts?: ApplyCounts;
}

const NO_COUNTS: ApplyCounts = { seen: 0, inserted: 0, updated: 0, statusChanged: 0 };

const sum = (a: ApplyCounts, b: ApplyCounts): ApplyCounts => ({
  seen: a.seen + b.seen,
  inserted: a.inserted + b.inserted,
  updated: a.updated + b.updated,
  statusChanged: a.statusChanged + b.statusChanged,
});

async function applyWhole(
  definition: MirrorSource,
  missingStatus: "withdrawn" | "delisted",
  bundle: VrdbBundle,
  sha256: string,
  store: LoadStore,
): Promise<ApplyCounts> {
  return store.applyVrdbSnapshotQuery({
    sourceId: definition.id,
    records: bundle.records,
    missingStatus,
    rawSnapshotHash: sha256,
    sourceVersion: bundle.sourceVersion,
    etag: null,
    lastModified: null,
    at: new Date(bundle.builtAt),
  });
}

async function applyChanges(
  definition: MirrorSource,
  bundle: VrdbBundle,
  sha256: string,
  store: LoadStore,
): Promise<ApplyCounts> {
  if (bundle.cursor === null) throw new BundleError("wrong_format", definition.id);
  const at = new Date(bundle.builtAt);
  const kept = new Set(bundle.records.map((record) => record.sourceRecordId));
  const stored = await store.listVrdbKeyedRecordIdsQuery(definition.id);
  const retire = stored.filter((id) => !kept.has(id));

  let counts = NO_COUNTS;
  const batches = Math.max(
    1,
    Math.ceil(bundle.records.length / DELTA_BATCH),
    Math.ceil(retire.length / DELTA_BATCH),
  );
  for (let index = 0; index < batches; index += 1) {
    const last = index === batches - 1;
    counts = sum(
      counts,
      await store.applyVrdbDeltaQuery({
        sourceId: definition.id,
        records: bundle.records.slice(index * DELTA_BATCH, (index + 1) * DELTA_BATCH),
        retire: retire.slice(index * DELTA_BATCH, (index + 1) * DELTA_BATCH),
        // Only the last batch moves the cursor and notes the success, so that a load that stops
        // halfway leaves the list's state as it was and is applied again at the next start.
        cursor: last ? bundle.cursor : null,
        rawSnapshotHash: sha256,
        at,
      }),
    );
  }
  return counts;
}

/** Loads one list's bundle, unless it is the one already loaded. */
export async function loadBundledSource(
  definition: MirrorSource,
  deps: LoadDeps,
): Promise<LoadResult> {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const id = definition.id;
  const startedAt = now();
  await store.upsertVrdbSourceQuery(definition, startedAt);

  let read: { bundle: VrdbBundle; sha256: string };
  try {
    read = readBundle(id, deps.dir ?? bundleDir());
  } catch (error) {
    const errorCode = error instanceof BundleError ? `bundle_${error.code}` : "bundle_unreadable";
    logger.warn(
      `vendor risk database: ${id} was not loaded (${errorCode}); its copy stays as it was`,
    );
    await store.markVrdbSourceQuery(id, { outcome: "failed", at: startedAt, errorCode });
    return { sourceId: id, outcome: "failed", errorCode };
  }
  const { bundle, sha256 } = read;
  if (sha256 === (await store.lastSuccessfulHashQuery(id))) {
    // No run and no apply: the copy is this bundle. The list is noted current again, as of the
    // bundle, so that a failure noted since (a release that shipped without the bundle) clears.
    await store.markVrdbSourceQuery(id, { outcome: "unchanged", at: new Date(bundle.builtAt) });
    return { sourceId: id, outcome: "unchanged" };
  }

  const runId = await store.startVrdbSyncRunQuery(id, startedAt);
  try {
    const counts =
      definition.missingStatus === null
        ? await applyChanges(definition, bundle, sha256, store)
        : await applyWhole(definition, definition.missingStatus, bundle, sha256, store);
    await store.finishVrdbSyncRunQuery(
      runId,
      { outcome: "ok", counts, rawSnapshotHash: sha256 },
      now(),
    );
    await store.pruneVrdbSyncRunsQuery(new Date(now().getTime() - LOAD_RUNS_KEPT_DAYS * DAY_MS));
    logger.info(
      `vendor risk database: ${id} loaded from its bundle of ${bundle.builtAt.slice(0, 10)} (${counts.seen} records, ${counts.inserted} new, ${counts.updated} changed, ${counts.statusChanged} with a new status)`,
    );
    return { sourceId: id, outcome: "ok", counts };
  } catch (error) {
    const errorCode = error instanceof BundleError ? `bundle_${error.code}` : "load_failed";
    logger.warn(`vendor risk database: ${id} could not be loaded (${errorCode})`);
    await store.finishVrdbSyncRunQuery(runId, { outcome: "failed", errorCode }, now());
    await store.markVrdbSourceQuery(id, { outcome: "failed", at: now(), errorCode });
    return { sourceId: id, outcome: "failed", errorCode };
  }
}

/** Loads the bundle of every list the gates allow, one after another. */
export async function loadBundledSources(deps: LoadDeps): Promise<LoadResult[]> {
  const results: LoadResult[] = [];
  for (const definition of activeMirrors()) {
    try {
      results.push(await loadBundledSource(definition, deps));
    } catch (error) {
      // A database failure on one list is no reason to skip the others.
      const name = error instanceof Error ? error.name : "unknown";
      logger.warn(`vendor risk database: ${definition.id} could not be loaded (${name})`);
      results.push({ sourceId: definition.id, outcome: "failed", errorCode: "load_failed" });
    }
  }
  return results;
}
