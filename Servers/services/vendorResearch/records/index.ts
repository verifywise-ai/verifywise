/**
 * The lookup of a vendor in the public databases: the CISA catalog of known exploited
 * vulnerabilities, the NVD, Have I Been Pwned, the filings of the SEC, the incident history of
 * the vendor's status page and the sanctions list of the United States Treasury. It is made by the
 * code before the first turn of the model, costs the model nothing, and its answers are records
 * that enter the session as sources that were read (see WebSession.addRecords). A database that
 * cannot be reached is an answer, not an error. The answers are kept in the memory of the process
 * for a while: the catalog is one file for every vendor, and the NVD is asked politely, by all the
 * workers together (see sharedSpacer.ts).
 *
 * Each database is a record of one category (RECORD_CATEGORY) and is asked only when the run
 * researches it, with the lookback of that category. The hosts of the status page are guesses, so
 * where none is found the answer is empty, and a guess that fails is no failure of a database.
 *
 * The sanctions list is two files of 7 MB together, and the download belongs to the process, not to
 * a run: a run waits for it as long as the lookups have, and a run that cannot wait leaves it to
 * the next, which finds it done (see `within`).
 */
import { FetchError, guardedFetch } from "../../webResearch/guardedFetch";
import { PageReadError } from "../../webResearch/readPage";
import { type VendorResearchConfig, getVendorResearchConfig } from "../config";
import { VRDB_GATES, type VrdbGate } from "../vrdb/gates";
import { fetchCsv } from "./csvFetch";
import { fetchFeed } from "./feedFetch";
import { type Breach, HIBP_MAX_BYTES, hibpRecords, hibpUrl, parseHibp } from "./hibp";
import { KEV_MAX_BYTES, KEV_URL, type KevEntry, kevRecords, parseKev } from "./kev";
import { cpeVendorOf, nameKeys } from "./match";
import { createMemo } from "./memo";
import { type Cve, NVD_MAX_BYTES, nvdRecords, nvdUrl, parseNvd } from "./nvd";
import {
  OFAC_ALT_MAX_BYTES,
  OFAC_ALT_URL,
  OFAC_SDN_MAX_BYTES,
  OFAC_SDN_URL,
  type OfacList,
  ofacRecords,
  parseOfac,
} from "./ofac";
import {
  type Registrant,
  SEC_SUBMISSIONS_MAX_BYTES,
  SEC_TICKERS_MAX_BYTES,
  SEC_TICKERS_URL,
  type Submissions,
  filingUrl,
  incidentFilings,
  item105Text,
  parseSubmissions,
  parseTickers,
  registrantOf,
  secRecord,
  secSubmissionsUrl,
  storedCikOf,
} from "./sec";
import { NVD_SPACER_KEY, applicationRedis, createSharedSpacer } from "./sharedSpacer";
import type { Spacer, SpacerLimits } from "./spacer";
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
  type SourceRecord,
} from "./types";

export type { RecordSourceId, RecordsLookup, RecordsOutcome, SourceRecord } from "./types";

/** All the lookups of one run together: a database that has not answered by then has failed. */
const RECORDS_TIMEOUT_MS = 8_000;
/** How long a database that failed is left alone, so that a blocked host costs one wait, not one a run. */
const COOL_DOWN_MS = 5 * 60_000;
const KEV_TTL_MS = 30 * 60_000;
const SLOW_TTL_MS = 6 * 60 * 60_000;
/** The SEC updates its list of registrants daily, and a filing never changes once it is filed. */
const DAY_TTL_MS = 24 * 60 * 60_000;
/** The filings of a registrant: a new report of an incident is news, so not for long. */
const FILINGS_TTL_MS = 60 * 60_000;
/** The incident history of a status page: an outage is news while it lasts, so not for long. */
const FEEDS_TTL_MS = 60 * 60_000;
/** The sanctions list changes on days nobody can tell, and a delisting is old news at six hours. */
const SANCTIONS_TTL_MS = 6 * 60 * 60_000;
/** The download of the sanctions list has longer than a run, so that a slow link still gets it done. */
const SANCTIONS_LOAD_TIMEOUT_MS = 45_000;
/** The NVD allows 5 requests in 30 seconds without a key: four, to keep within it. */
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
  /** Gets a file of the sanctions list, whole; the guarded fetch of csvFetch.ts by default. */
  fetchCsv?: FetchText;
  /**
   * Keeps the requests to the NVD within its limit; the default allows four in 30 seconds to all
   * the workers together (sharedSpacer.ts).
   */
  nvdSpacer?: Spacer;
  /** The time in milliseconds, for the rest after a failure. */
  clock?: () => number;
  /** How long the lookups of one run have together; 8,000 ms by default. */
  timeoutMs?: number;
  /** How long the download of the sanctions list has, which is no run's time; 45,000 ms by default. */
  loadTimeoutMs?: number;
  /** The databases it may ask; all of them by default. */
  sources?: readonly RecordSourceId[];
}

/**
 * The databases a run asks itself while the vendor risk database is on: it mirrors the catalog of
 * CISA and the sanctions lists and reads the NVD through, and the run looks those up there (see
 * vrdb/lookup.ts). The SEC is asked by the run until Q4 opens, and then read through by the
 * database as well. `gates` is for the tests.
 */
export function sourcesBesideVrdb(
  gates: Readonly<Record<VrdbGate, boolean>> = VRDB_GATES,
): RecordSourceId[] {
  return gates.Q4 ? ["hibp", "statuspage"] : ["hibp", "sec", "statuspage"];
}

/** The NVD's turn was too far off: the database is busy, not down. */
class TurnTooFar extends Error {}

/** The download of the sanctions list was not done when the run stopped waiting: it is under way, not down. */
class StillLoading extends Error {}

/**
 * Waits for a load that the runs of the process share, but not past the signal of this run. The
 * load goes on for the others when this run stops waiting.
 */
function within<T>(load: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new StillLoading());
    if (signal.aborted) stop();
    signal.addEventListener("abort", stop, { once: true });
    load.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
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
  const getCsv = deps.fetchCsv ?? fetchCsv;
  const clock = deps.clock ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? RECORDS_TIMEOUT_MS;
  const loadTimeoutMs = deps.loadTimeoutMs ?? SANCTIONS_LOAD_TIMEOUT_MS;
  /** Until when a database that failed is left alone. */
  const coolDown = new Map<RecordSourceId, number>();
  const spacer =
    deps.nvdSpacer ??
    createSharedSpacer(NVD_LIMITS, { redis: applicationRedis, key: NVD_SPACER_KEY });
  const catalog = createMemo<KevEntry[]>(KEV_TTL_MS, 1);
  const breaches = createMemo<Breach[]>(SLOW_TTL_MS, 200);
  const cves = createMemo<Cve[]>(SLOW_TTL_MS, 200);
  const registrants = createMemo<Registrant[]>(DAY_TTL_MS, 1);
  const filingLists = createMemo<Submissions>(FILINGS_TTL_MS, 200);
  const excerpts = createMemo<string | null>(DAY_TTL_MS, 200);
  const feeds = createMemo<StatusFeed | null>(FEEDS_TTL_MS, 200);
  const sanctions = createMemo<OfacList>(SANCTIONS_TTL_MS, 1);

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
    ) => Promise<{ records: SourceRecord[]; omitted: RecordsOutcome["omitted"] }>,
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
      if (error instanceof TurnTooFar || error instanceof StillLoading)
        return failed("unreachable");
      const reason = failureOf(error);
      // A run that was cancelled is no sign that the database is down.
      if (!cancelled.aborted) coolDown.set(source, clock() + COOL_DOWN_MS);
      return failed(reason);
    }
  }

  return async ({ target, researchable, cutoffs, now, signal: runSignal, readPage }) => {
    const signal = AbortSignal.any([runSignal, AbortSignal.timeout(timeoutMs)]);
    /** Whether the lookup may ask a database, and the run researches the category of its records. */
    const serves = (source: RecordSourceId): boolean =>
      (deps.sources === undefined || deps.sources.includes(source)) &&
      researchable.includes(RECORD_CATEGORY[source]);
    const cutoffOf = (source: RecordSourceId): string | undefined =>
      cutoffs?.[RECORD_CATEGORY[source]];
    const keys = nameKeys(target);
    // A registrant of the SEC is found by the names of the vendor alone: the brand of its domain is
    // no name of a company, and a company of that name could be another one. A CIK a person stored
    // names the registrant, and then no name is looked for.
    const names = nameKeys({ ...target, domain: null });
    const storedCik = storedCikOf(target);
    const token = cpeVendorOf(target);
    const lookups: Array<Promise<RecordsOutcome>> = [];

    if (serves("kev") && keys.length > 0) {
      lookups.push(
        outcomeOf("kev", KEV_URL, runSignal, async () => {
          const entries = await catalog.get(KEV_URL, async () =>
            parseKev(await get(KEV_URL, { maxBytes: KEV_MAX_BYTES, signal })),
          );
          return kevRecords(entries, { keys, cutoff: cutoffOf("kev") });
        }),
      );
    }
    if (serves("nvd") && token !== null) {
      const url = nvdUrl(token, now, cutoffOf("nvd"));
      lookups.push(
        outcomeOf("nvd", url, runSignal, async () => {
          const list = await cves.get(url, async () => {
            // The turn is taken only for a request that is made: a memory hit needs none.
            if (!(await spacer(signal))) throw new TurnTooFar();
            return parseNvd(await get(url, { maxBytes: NVD_MAX_BYTES, signal }));
          });
          return nvdRecords(list, { cutoff: cutoffOf("nvd") });
        }),
      );
    }
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
    if (serves("sec") && (storedCik !== null || names.length > 0)) {
      /** The text of Item 1.05 of a filing; none when it cannot be read, which is no failure of the lookup. */
      const excerptOf = async (url: string): Promise<string | null> => {
        if (readPage === undefined) return null;
        try {
          return await excerpts.get(url, async () =>
            item105Text((await readPage(url, signal)).text),
          );
        } catch (error) {
          if (error instanceof PageReadError) return null;
          throw error;
        }
      };
      const first = storedCik === null ? SEC_TICKERS_URL : secSubmissionsUrl(storedCik);
      lookups.push(
        outcomeOf("sec", first, runSignal, async (at) => {
          let cik = storedCik;
          if (cik === null) {
            const list = await registrants.get(SEC_TICKERS_URL, async () =>
              parseTickers(await get(SEC_TICKERS_URL, { maxBytes: SEC_TICKERS_MAX_BYTES, signal })),
            );
            const registrant = registrantOf(list, names);
            if (registrant === null) return { records: [], omitted: {} };
            cik = registrant.cik;
          }
          const url = secSubmissionsUrl(cik);
          at(url);
          const submissions = await filingLists.get(url, async () => {
            const parsed = parseSubmissions(
              await get(url, { maxBytes: SEC_SUBMISSIONS_MAX_BYTES, signal }),
            );
            // A document that is no list of filings is not what was asked for.
            if (parsed === null) throw new FetchError("unsupported_type");
            return parsed;
          });
          const { filings, omitted } = incidentFilings(submissions, { cutoff: cutoffOf("sec") });
          const records = await Promise.all(
            filings.map(async (filing) =>
              secRecord(submissions, filing, await excerptOf(filingUrl(submissions.cik, filing))),
            ),
          );
          return { records, omitted };
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
    if (serves("ofac") && names.length > 0) {
      lookups.push(
        outcomeOf("ofac", OFAC_SDN_URL, runSignal, async () => {
          const list = await within(
            sanctions.get(OFAC_SDN_URL, async () => {
              // The download has a time of its own: it is shared, and it outlives the run that began it.
              const loading = AbortSignal.timeout(loadTimeoutMs);
              const [sdn, alt] = await Promise.all([
                getCsv(OFAC_SDN_URL, { maxBytes: OFAC_SDN_MAX_BYTES, signal: loading }),
                getCsv(OFAC_ALT_URL, { maxBytes: OFAC_ALT_MAX_BYTES, signal: loading }),
              ]);
              return parseOfac(sdn, alt);
            }),
            signal,
          );
          return ofacRecords(list, { keys: names, now });
        }),
      );
    }
    return mergeSameAddress(await Promise.all(lookups));
  };
}

/**
 * A CVE that the catalog lists and the NVD scores is one source, at the address of the CVE: the
 * ledger keeps one source for an address, so the NVD's words are added to the catalog's. The
 * catalog's record keeps everything else it has, such as what the vendor risk database knows of it.
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
let sharedBesideVrdb: RecordsLookup | undefined;

/**
 * The lookup of the process, or undefined when an operator turned the records off. It is built
 * once, so that the runs of a process share what it remembers of the databases. While the vendor
 * risk database is on it asks only the databases that the VRDB does not mirror.
 */
export function sharedRecordsLookup(
  config: Pick<VendorResearchConfig, "records"> &
    Partial<Pick<VendorResearchConfig, "vrdb">> = getVendorResearchConfig(),
): RecordsLookup | undefined {
  if (!config.records) return undefined;
  if (config.vrdb === true) {
    sharedBesideVrdb ??= createRecordsLookup({ sources: sourcesBesideVrdb() });
    return sharedBesideVrdb;
  }
  shared ??= createRecordsLookup();
  return shared;
}
