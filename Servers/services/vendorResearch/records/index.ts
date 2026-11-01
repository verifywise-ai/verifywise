/**
 * The lookup of a vendor in the public databases that a run asks itself: Have I Been Pwned and the
 * incident history of the vendor's status page. It is made by the code before the first turn of the
 * model, costs the model nothing, and its answers are records that enter the session as sources
 * that were read (see WebSession.addRecords). A database that cannot be reached is an answer, not
 * an error. The answers are kept in the memory of the process for a while.
 *
 * The other databases belong to the vendor risk database, which mirrors the catalog of CISA and the
 * sanctions lists, copies the CVE records and reads the NVD and the SEC through (see vrdb/). A run
 * looks those up there, so this lookup does not ask for them (`sourcesBesideVrdb`). It keeps
 * `NVD_LIMITS` and `fetchJson` for the read-through of the database, and `mergeSameAddress`, which
 * merges the catalog's record and the NVD's of one CVE into one source (gather.ts).
 *
 * Each database is a record of one category (RECORD_CATEGORY) and is asked only when the run
 * researches it, with the lookback of that category. The hosts of the status page are guesses, so
 * where none is found the answer is empty, and a guess that fails is no failure of a database.
 */
import { FetchError, guardedFetch } from "../../webResearch/guardedFetch";
import { type VendorResearchConfig, getVendorResearchConfig } from "../config";
import { fetchFeed } from "./feedFetch";
import { type Breach, HIBP_MAX_BYTES, hibpRecords, hibpUrl, parseHibp } from "./hibp";
import { nameKeys } from "./match";
import { createMemo } from "./memo";
import type { SpacerLimits } from "./spacer";
import {
  STATUS_FEED_MAX_BYTES,
  type StatusFeed,
  parseStatusFeed,
  statusFeedNamesVendor,
  statusFeedUrl,
  statusHostsOf,
  statusRecords,
} from "./statuspage";
import {
  type FetchJson,
  type FetchText,
  RECORD_CATEGORY,
  type RecordFailure,
  type RecordSourceId,
  type RecordsLookup,
  type RecordsOutcome,
} from "./types";

export type { RecordSourceId, RecordsLookup, RecordsOutcome, SourceRecord } from "./types";

/** All the lookups of one run together: a database that has not answered by then has failed. */
const RECORDS_TIMEOUT_MS = 8_000;
/** How long a database that failed is left alone, so that a blocked host costs one wait, not one a run. */
const COOL_DOWN_MS = 5 * 60_000;
const SLOW_TTL_MS = 6 * 60 * 60_000;
/** The incident history of a status page: an outage is news while it lasts, so not for long. */
const FEEDS_TTL_MS = 60 * 60_000;
/**
 * The NVD allows 5 requests in 30 seconds without a key: four, to keep within it. The read-through
 * of the vendor risk database takes its turns in this window (vrdb/lookup.ts).
 */
export const NVD_LIMITS: SpacerLimits = { limit: 4, windowMs: 30_000, maxWaitMs: 3_000 };

/** The default way to get a document: a guarded GET of JSON, read whole. */
export const fetchJson: FetchJson = async (url, { maxBytes, signal, userAgent }) => {
  const response = await guardedFetch(url, {
    allowedContentTypes: ["application/json"],
    maxBytes,
    signal,
    ...(userAgent === undefined ? {} : { userAgent }),
  });
  // A document that was cut cannot be read, and one that is not JSON is not what was asked for.
  if (response.truncated) throw new FetchError("unsupported_type");
  try {
    return JSON.parse(response.body.toString("utf8"));
  } catch {
    throw new FetchError("unsupported_type");
  }
};

export interface RecordsDeps {
  fetchJson?: FetchJson;
  /** Gets the feed of a status page, robots.txt allowing; the guarded fetch of feedFetch.ts by default. */
  fetchFeed?: FetchText;
  /** The time in milliseconds, for the rest after a failure. */
  clock?: () => number;
  /** How long the lookups of one run have together; 8,000 ms by default. */
  timeoutMs?: number;
}

/** The databases a run asks itself, in the order the lookup answers for them. */
const PER_RUN_SOURCES = ["hibp", "statuspage"] as const satisfies readonly RecordSourceId[];

/**
 * The databases a run asks itself: the vendor risk database mirrors the catalog of CISA and the
 * sanctions lists, copies the CVE records and reads the NVD and the SEC through, and the run looks
 * those up there (see vrdb/lookup.ts). It stays Have I Been Pwned and the status page, whatever
 * the gates of the database say.
 */
export function sourcesBesideVrdb(): RecordSourceId[] {
  return [...PER_RUN_SOURCES];
}

const failureOf = (error: unknown): RecordFailure => {
  if (!(error instanceof FetchError)) throw error;
  return error.reason === "not_allowed" || error.reason === "blocked_by_robots"
    ? "unreachable"
    : error.reason;
};

/**
 * Makes the lookup of a process. Build it once: the memory of the answers belongs to it.
 */
export function createRecordsLookup(deps: RecordsDeps = {}): RecordsLookup {
  const get = deps.fetchJson ?? fetchJson;
  const getFeed = deps.fetchFeed ?? fetchFeed;
  const clock = deps.clock ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? RECORDS_TIMEOUT_MS;
  /** Until when a database that failed is left alone. */
  const coolDown = new Map<RecordSourceId, number>();
  const breaches = createMemo<Breach[]>(SLOW_TTL_MS, 200);
  const feeds = createMemo<StatusFeed | null>(FEEDS_TTL_MS, 200);

  /**
   * The incident history of a status page, or null when the host has none. A host that does not
   * answer a feed, or that is not a status page at all, is the usual answer to a guess: it is kept
   * for a while when the site answered, and forgotten at once when it did not.
   */
  async function feedOf(host: string, signal: AbortSignal): Promise<StatusFeed | null> {
    const url = statusFeedUrl(host);
    try {
      return await feeds.get(url, async () => {
        try {
          return parseStatusFeed(await getFeed(url, { maxBytes: STATUS_FEED_MAX_BYTES, signal }));
        } catch (error) {
          const answered =
            error instanceof FetchError &&
            (error.reason === "not_found" || error.reason === "unsupported_type");
          if (answered) return null;
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof FetchError) return null;
      throw error;
    }
  }

  async function outcomeOf(
    source: RecordSourceId,
    url: string,
    cancelled: AbortSignal,
    // A lookup of two steps tells where it is with `at`, so that the trace names the address asked.
    run: (
      at: (url: string) => void,
    ) => Promise<{ records: RecordsOutcome["records"]; omitted: RecordsOutcome["omitted"] }>,
  ): Promise<RecordsOutcome> {
    const startedAt = performance.now();
    const took = () => Math.round(performance.now() - startedAt);
    let asked = url;
    const failed = (reason: RecordFailure): RecordsOutcome => ({
      source,
      url: asked,
      outcome: "failed",
      reason,
      records: [],
      omitted: {},
      ms: took(),
    });
    if ((coolDown.get(source) ?? 0) > clock()) return failed("unreachable");
    try {
      const { records, omitted } = await run((next) => {
        asked = next;
      });
      return {
        source,
        url: asked,
        outcome: records.length === 0 ? "empty" : "ok",
        records,
        omitted,
        ms: took(),
      };
    } catch (error) {
      const reason = failureOf(error);
      // A run that was cancelled is no sign that the database is down.
      if (!cancelled.aborted) coolDown.set(source, clock() + COOL_DOWN_MS);
      return failed(reason);
    }
  }

  return async ({ target, researchable, cutoffs, now, signal: runSignal }) => {
    const signal = AbortSignal.any([runSignal, AbortSignal.timeout(timeoutMs)]);
    /** Whether the run researches the category of the records of the database. */
    const serves = (source: RecordSourceId): boolean =>
      researchable.includes(RECORD_CATEGORY[source]);
    const cutoffOf = (source: RecordSourceId): string | undefined =>
      cutoffs?.[RECORD_CATEGORY[source]];
    const keys = nameKeys(target);
    const lookups: Array<Promise<RecordsOutcome>> = [];

    if (serves("hibp") && target.domain !== null) {
      const domain = target.domain;
      const url = hibpUrl(domain);
      lookups.push(
        outcomeOf("hibp", url, runSignal, async () => {
          const list = await breaches.get(url, async () =>
            parseHibp(await get(url, { maxBytes: HIBP_MAX_BYTES, signal })),
          );
          return hibpRecords(list, { domain, cutoff: cutoffOf("hibp") });
        }),
      );
    }
    if (serves("statuspage") && target.domain !== null) {
      const hosts = statusHostsOf(target.domain);
      lookups.push(
        outcomeOf("statuspage", statusFeedUrl(hosts[0].host), runSignal, async (at) => {
          // Every candidate is asked at once, and the first in the order of the list that has a feed wins.
          const found = await Promise.all(
            hosts.map(async ({ host, own }) => {
              const feed = await feedOf(host, signal);
              return feed !== null && (own || statusFeedNamesVendor(feed, keys)) ? feed : null;
            }),
          );
          const index = found.findIndex((feed) => feed !== null);
          const feed = found[index];
          if (feed === null || feed === undefined) return { records: [], omitted: {} };
          const { host } = hosts[index];
          at(statusFeedUrl(host));
          return statusRecords(feed, { host, cutoff: cutoffOf("statuspage"), now });
        }),
      );
    }
    return Promise.all(lookups);
  };
}

/**
 * A CVE that the catalog lists and the NVD scores is one source, at the address of the CVE: the
 * ledger keeps one source for an address, so the NVD's words are added to the catalog's. The
 * catalog's record keeps everything else it has, such as what the vendor risk database knows of it.
 * Both come from the vendor risk database now (gather.ts); the function takes the outcomes of any
 * lookup.
 */
export function mergeSameAddress(outcomes: RecordsOutcome[]): RecordsOutcome[] {
  const kev = outcomes.find((outcome) => outcome.source === "kev");
  const nvd = outcomes.find((outcome) => outcome.source === "nvd");
  if (kev === undefined || nvd === undefined) return outcomes;
  const scored = new Map(nvd.records.map((record) => [record.url, record]));
  const records = kev.records.map((record) => {
    const same = scored.get(record.url);
    return same === undefined ? record : { ...record, text: `${record.text} ${same.text}` };
  });
  const kept = nvd.records.filter((record) => !kev.records.some((it) => it.url === record.url));
  return outcomes.map((outcome) => {
    if (outcome === kev) return { ...kev, records };
    if (outcome === nvd) {
      return {
        ...nvd,
        records: kept,
        outcome: nvd.outcome === "ok" && kept.length === 0 ? "empty" : nvd.outcome,
      };
    }
    return outcome;
  });
}

let shared: RecordsLookup | undefined;

/**
 * The lookup of the process, or undefined when an operator turned the records off. It is built
 * once, so that the runs of a process share what it remembers of the databases. The vendor risk
 * database is always on, so it asks only the databases that the VRDB does not mirror or read
 * through (`sourcesBesideVrdb`).
 */
export function sharedRecordsLookup(
  config: Pick<VendorResearchConfig, "records"> = getVendorResearchConfig(),
): RecordsLookup | undefined {
  if (!config.records) return undefined;
  shared ??= createRecordsLookup();
  return shared;
}
