/**
 * The read-through of the vendor risk database (spec D4.8 step 3, Ruling 2 of the M2 plan): a
 * database asked at run time by a key of the vendor, whose answers are kept in the tables of the
 * copies (the records in `vrdb_records`, the state of each key in `vrdb_lookups`) and offered by the
 * lookup like the records of a copy (lookup.ts).
 *
 * A stored answer younger than the hours of its source is not asked again. An expired one, or a key
 * never asked, is asked within the run's eight seconds, on the turn of the source's spacer, and the
 * answer is stored. A failure keeps the stored records in use and says failed, and the source is
 * not asked again for that key for five minutes, by any run: unless it was the run that stopped,
 * or the turn of the source was too far off, which says the source is busy, not down. A source
 * that does not stop when the time is up is not waited for. It never throws for what a source or
 * the store does.
 */
import type { VrdbSourceId } from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import type { PageReader } from "../../webResearch/readPage";
import type { Spacer } from "../records/spacer";
import type { FetchJson } from "../records/types";
import type { ResearchTarget } from "../target";
import type { ReadThroughConnector, ReadThroughFetched } from "./connectors/types";
import type { ReadThroughSource } from "./sources";
import type { ReadThroughAnswer, ReadThroughOutcome, VrdbLookupState } from "./types";

/** How long the read-through of a run has, for all of its sources together. */
export const READ_THROUGH_TIMEOUT_MS = 8_000;
/** How long a key whose source failed is left alone, by every run. */
export const RETRY_AFTER_FAILURE_MS = 300_000;

const HOUR_MS = 3_600_000;

/** The queries of the read-through (utils/vrdb.utils.ts). */
export interface ReadThroughStore {
  lookupOf(sourceId: VrdbSourceId, key: string): Promise<VrdbLookupState | null>;
  saveAnswer(input: ReadThroughAnswer): Promise<{ statusChanged: number }>;
}

export interface ReadThroughDeps {
  store: ReadThroughStore;
  /** The connector of each source; a source without one has nothing to ask by. */
  connectors: Partial<Record<VrdbSourceId, ReadThroughConnector>>;
  fetchJson: FetchJson;
  /** The spacer of each source that has a limit (records/sharedSpacer.ts). */
  spacers: Partial<Record<VrdbSourceId, Spacer>>;
  /** Replaces READ_THROUGH_TIMEOUT_MS, for tests. */
  timeoutMs?: number;
}

export interface ReadThroughInput {
  /** The read-through sources of the categories the run researches. */
  sources: readonly ReadThroughSource[];
  target: ResearchTarget;
  now: Date;
  signal: AbortSignal;
  readPage?: PageReader;
}

/** The name of an error, for a log line: its message can carry an address. */
function errorName(error: unknown): string {
  return error instanceof Error && /^[A-Za-z_$][\w$.]{0,59}$/.test(error.name)
    ? error.name
    : "unknown";
}

/** The work's value, or undefined once the signal aborts: a source that does not stop is not waited for. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  // A failure of the work after the signal is no one's to handle.
  work.catch(() => undefined);
  return new Promise<T | undefined>((resolve, reject) => {
    if (signal.aborted) return resolve(undefined);
    const stop = () => resolve(undefined);
    signal.addEventListener("abort", stop, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", stop);
        reject(error);
      },
    );
  });
}

/** Stores an answer; false, and a line in the log, when the store fails. */
async function saved(store: ReadThroughStore, answer: ReadThroughAnswer): Promise<boolean> {
  try {
    await store.saveAnswer(answer);
    return true;
  } catch (error) {
    logger.warn(
      `vendor research: an answer of ${answer.definition.id} could not be stored (error ${errorName(error)})`,
    );
    return false;
  }
}

async function readSource(
  source: ReadThroughSource,
  input: ReadThroughInput,
  deps: ReadThroughDeps,
  signal: AbortSignal,
): Promise<ReadThroughOutcome> {
  const connector = deps.connectors[source.id];
  if (connector === undefined)
    return { key: null, weak: false, outcome: "no_key", fetchedAt: null };
  let found: { key: string; weak: boolean } | null | undefined;
  try {
    found = await untilAborted(
      connector.keyOf(input.target, { signal, fetchJson: deps.fetchJson }),
      signal,
    );
  } catch {
    found = undefined;
  }
  if (found === undefined) return { key: null, weak: false, outcome: "failed", fetchedAt: null };
  if (found === null) return { key: null, weak: false, outcome: "no_key", fetchedAt: null };
  const { key, weak } = found;
  const failed = (fetchedAt: Date | null): ReadThroughOutcome => ({
    key,
    weak,
    outcome: "failed",
    fetchedAt,
  });

  let stored: VrdbLookupState | null;
  try {
    stored = await deps.store.lookupOf(source.id, key);
  } catch (error) {
    logger.warn(
      `vendor research: the answers of ${source.id} could not be read (error ${errorName(error)})`,
    );
    return failed(null);
  }
  const fetchedAt = stored?.fetchedAt ?? null;
  if (stored !== null && stored.expiresAt.getTime() > input.now.getTime()) {
    return { key, weak, outcome: stored.outcome === "failed" ? "failed" : "fresh", fetchedAt };
  }

  // A turn too far off, or a run that stops before its turn, is no sign that the source is down.
  const spacer = deps.spacers[source.id];
  try {
    if (spacer !== undefined && !(await spacer(signal))) return failed(fetchedAt);
  } catch {
    return failed(fetchedAt);
  }
  let fetched: ReadThroughFetched | undefined;
  try {
    fetched = await untilAborted(
      connector.fetch(key, {
        now: input.now,
        signal,
        fetchJson: deps.fetchJson,
        readPage: input.readPage,
      }),
      signal,
    );
  } catch {
    fetched = undefined;
  }
  const at = input.now;
  if (fetched === undefined) {
    // A run that was stopped is no sign that the source is down either.
    if (!input.signal.aborted) {
      await saved(deps.store, {
        definition: source,
        key,
        records: [],
        outcome: "failed",
        at,
        expiresAt: new Date(at.getTime() + RETRY_AFTER_FAILURE_MS),
      });
    }
    return failed(fetchedAt);
  }
  const { records, coversSince } = fetched;
  const kept = await saved(deps.store, {
    definition: source,
    key,
    records,
    outcome: records.length > 0 ? "ok" : "empty",
    at,
    expiresAt: new Date(at.getTime() + source.ttlHours * HOUR_MS),
    coversSince,
  });
  // An answer that was not stored cannot be found by the lookup.
  return kept ? { key, weak, outcome: "fetched", fetchedAt: at } : failed(fetchedAt);
}

/** What each read-through source did for the run: the sources are asked at once. */
export async function readThrough(
  input: ReadThroughInput,
  deps: ReadThroughDeps,
): Promise<Map<VrdbSourceId, ReadThroughOutcome>> {
  const signal = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(deps.timeoutMs ?? READ_THROUGH_TIMEOUT_MS),
  ]);
  const outcomes = await Promise.all(
    input.sources.map(
      async (source) => [source.id, await readSource(source, input, deps, signal)] as const,
    ),
  );
  return new Map(outcomes);
}
