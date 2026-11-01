/**
 * The run-time lookup of the vendor risk database (spec D4.8): first the read-through sources
 * (readThrough.ts) for the keys whose stored answer expired, then the vendor's keys (keys.ts) with
 * the read-through keys against the stored records, in two queries, then the records a run is
 * offered as sources and the coverage of every list. It takes the place of the per-run lookups of
 * KEV, the NVD and OFAC, and of the SEC's once Q4 is open; only a read-through source reaches the
 * web. It has no flag: with the records off (VENDOR_RESEARCH_RECORDS=false) it asks nothing and
 * every list says `off`.
 *
 * `offerRecords` decides, with no I/O: only active records that share a key with the vendor; the
 * strong matches first, then the newest; a vulnerability or a filing older than the category's
 * lookback is left out and counted as old (a designation is a state, so the lookback does not apply
 * to it); at most MAX_RECORDS of a list, the rest counted as more; a CVE one list matched is
 * offered by no later one (KEV, then the NVD, then the CVE List). Each record's text is the list's
 * own, the lookup note for a match by name alone, and the day of the copy or answer ("As of …"). A
 * list with no copy yet is `failed`, one that has not been brought up to date for 48 hours is
 * stale, and the records of a stale copy are offered all the same; a read-through source whose
 * answer could not be refreshed is `failed` and offers its stored records. A list behind a closed
 * gate (gates.ts) is neither looked up nor in the coverage.
 */
import type {
  CoverageSource,
  ResearchCategory,
  VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import {
  findVrdbRecordsByKeysQuery,
  getVrdbLookupQuery,
  getVrdbSourceStatesQuery,
  recordVendorVrdbMatchesQuery,
  saveReadThroughAnswerQuery,
} from "../../../utils/vrdb.utils";
import { type VendorResearchConfig, getVendorResearchConfig } from "../config";
import { NVD_LIMITS, fetchJson } from "../records";
import { NAME_ONLY_LOOKUP_NOTE } from "../records/ofac";
import { joinSentences } from "../records/sentence";
import {
  NVD_SPACER_KEY,
  SEC_LIMITS,
  SEC_SPACER_KEY,
  applicationRedis,
  createSharedSpacer,
} from "../records/sharedSpacer";
import { MAX_RECORDS } from "../records/types";
import type { ResearchTarget } from "../target";
import { nvdConnector } from "./connectors/nvd";
import { secConnector } from "./connectors/sec";
import type { ReadThroughConnector } from "./connectors/types";
import { SEC_CONTACT } from "./gates";
import { matchOf, vendorKeys } from "./keys";
import { type ReadThroughDeps, type ReadThroughStore, readThrough } from "./readThrough";
import { activeReadThroughs, activeVrdbSources, isMirror, isStale } from "./sources";
import type {
  MatchWrite,
  OfferedRecord,
  ReadThroughOutcome,
  VrdbLookup,
  VrdbOutcome,
  VrdbRow,
  VrdbSourceState,
} from "./types";

/** The queries a lookup makes (utils/vrdb.utils.ts). */
export interface LookupStore {
  sourceStates(ids: readonly VrdbSourceId[]): Promise<VrdbSourceState[]>;
  findRecords(keys: readonly string[], sources: readonly VrdbSourceId[]): Promise<VrdbRow[]>;
  recordMatches(
    organizationId: number,
    vendorId: number,
    matches: readonly MatchWrite[],
    at: Date,
  ): Promise<void>;
}

export interface OfferInput {
  rows: readonly VrdbRow[];
  states: readonly VrdbSourceState[];
  target: ResearchTarget;
  researchable: readonly ResearchCategory[];
  cutoffs?: Partial<Record<ResearchCategory, string>>;
  now: Date;
  /** The domains the website check verified (see `VrdbLookupInput`); none when absent. */
  verifiedDomains?: readonly string[];
  /** False when the records are off (VENDOR_RESEARCH_RECORDS=false): every list is `off`. */
  enabled: boolean;
  /** What the read-through did for each of its sources the run researches; none for the others. */
  readThrough: ReadonlyMap<VrdbSourceId, ReadThroughOutcome>;
}

/** The ids of the active lists whose category the run researches. */
const researchedSources = (researchable: readonly ResearchCategory[]): VrdbSourceId[] =>
  activeVrdbSources()
    .filter((definition) => researchable.includes(definition.category))
    .map((definition) => definition.id);

/**
 * The keys a vendor's records are looked up and matched by: the vendor's own, and the key of each
 * read-through source that had one; a read-through key found by the name alone matches weakly.
 */
function lookupKeysOf(input: Pick<OfferInput, "target" | "verifiedDomains" | "readThrough">): {
  keys: string[];
  weakKeys: Set<string>;
} {
  const keys = vendorKeys(input.target, input.verifiedDomains);
  const weakKeys = new Set<string>();
  for (const { key, weak } of input.readThrough.values()) {
    if (key === null) continue;
    if (!keys.includes(key)) keys.push(key);
    if (weak) weakKeys.add(key);
  }
  return { keys, weakKeys };
}

/** A vulnerability: one CVE is offered by one list (Ruling 10 of the M2 plan). */
const isVulnerability = (row: VrdbRow) => row.recordType === "vulnerability";

/** A record that is an event, a vulnerability or a filing: the lookback applies, and it keeps its day. */
const isEvent = (row: VrdbRow) => isVulnerability(row) || row.recordType === "sec_filing";

/** The strong first, then the newest (no day last), then the greater id (CVE-2026-10 after -9). */
function byStrengthAndAge(
  a: { row: VrdbRow; strength: "strong" | "weak" },
  b: { row: VrdbRow; strength: "strong" | "weak" },
): number {
  if (a.strength !== b.strength) return a.strength === "strong" ? -1 : 1;
  const dayA = a.row.publishedAt ?? "";
  const dayB = b.row.publishedAt ?? "";
  if (dayA !== dayB) return dayB.localeCompare(dayA);
  return b.row.sourceRecordId.localeCompare(a.row.sourceRecordId, "en", { numeric: true });
}

/**
 * The records the run is offered from the rows the lookup found, the coverage of every list, and
 * a match row for each offered record. Pure.
 */
export function offerRecords(input: OfferInput): { outcome: VrdbOutcome; matches: MatchWrite[] } {
  const { keys, weakKeys } = lookupKeysOf(input);
  const records: VrdbOutcome["records"] = [];
  const coverage: CoverageSource[] = [];
  const matches: MatchWrite[] = [];
  /** The CVEs a list matched: a later list does not offer them again (Ruling 10 of the M2 plan). */
  const claimed = new Set<string>();

  for (const definition of activeVrdbSources()) {
    const answer = isMirror(definition) ? undefined : input.readThrough.get(definition.id);
    const lastSuccessAt = isMirror(definition)
      ? (input.states.find((state) => state.id === definition.id)?.lastSuccessAt ?? null)
      : (answer?.fetchedAt ?? null);
    const stale = lastSuccessAt !== null && isStale(definition, lastSuccessAt, input.now);
    const listed = (
      outcome: CoverageSource["outcome"],
      counts: { strong: number; weak: number } = { strong: 0, weak: 0 },
    ): CoverageSource => ({
      id: definition.id,
      name: definition.name,
      attribution: definition.attribution,
      mode: definition.mode,
      checked: outcome === "found" || outcome === "none",
      outcome,
      ...counts,
      last_success_at: lastSuccessAt?.toISOString() ?? null,
      stale,
    });
    if (!input.enabled) {
      coverage.push(listed("off"));
      continue;
    }
    if (
      !input.researchable.includes(definition.category) ||
      (!isMirror(definition) && (answer === undefined || answer.outcome === "no_key"))
    ) {
      coverage.push(listed("not_researched"));
      continue;
    }
    if (lastSuccessAt === null) {
      coverage.push(listed("failed"));
      continue;
    }

    const asOf = lastSuccessAt.toISOString().slice(0, 10);
    const cutoff = input.cutoffs?.[definition.category];
    const matched = input.rows.flatMap((row) => {
      if (row.sourceId !== definition.id || row.status !== "active") return [];
      if (isVulnerability(row) && claimed.has(row.sourceRecordId)) return [];
      const match = matchOf(row.matchKeys, keys, weakKeys);
      return match === null ? [] : [{ row, ...match }];
    });
    for (const { row } of matched) if (isVulnerability(row)) claimed.add(row.sourceRecordId);
    const recent = matched.filter(
      ({ row }) =>
        !isEvent(row) ||
        cutoff === undefined ||
        row.publishedAt === null ||
        row.publishedAt >= cutoff,
    );
    recent.sort(byStrengthAndAge);
    const kept = recent.slice(0, MAX_RECORDS[definition.id]);
    const old = matched.length - recent.length;
    const more = recent.length - kept.length;

    const offered: OfferedRecord[] = kept.map(({ row, method, strength, matchedKey }) => {
      matches.push({ recordId: row.id, method, strength, matchedKey });
      // A record of a read-through source is as of the last answer that held it: one that aged out
      // of the window stays, though later answers lack it (M2 final review, Important 1).
      const recordAsOf =
        !isMirror(definition) && row.retrievedAt !== undefined ? row.retrievedAt : asOf;
      return {
        url: row.url,
        title: row.title,
        text: joinSentences([
          row.summary,
          method === "name_exact" ? NAME_ONLY_LOOKUP_NOTE : "",
          `As of ${recordAsOf}.`,
        ]),
        publishedAt: isEvent(row) ? (row.publishedAt ?? recordAsOf) : recordAsOf,
        vrdb: {
          recordId: row.id,
          sourceId: definition.id,
          sourceRecordId: row.sourceRecordId,
          strength,
          method,
          matchedKey,
          status: row.status,
          asOf: recordAsOf,
          stale,
        },
      };
    });
    records.push({
      source: definition.id,
      records: offered,
      omitted: { ...(old > 0 ? { old } : {}), ...(more > 0 ? { more } : {}) },
    });
    coverage.push(
      listed(answer?.outcome === "failed" ? "failed" : offered.length > 0 ? "found" : "none", {
        strong: offered.filter((record) => record.vrdb.strength === "strong").length,
        weak: offered.filter((record) => record.vrdb.strength === "weak").length,
      }),
    );
  }
  return { outcome: { records, coverage }, matches };
}

/** The name of an error, for a log line: its message can carry a query. */
function errorName(error: unknown): string {
  return error instanceof Error && /^[A-Za-z_$][\w$.]{0,59}$/.test(error.name)
    ? error.name
    : "unknown";
}

/** The answers with every key that was asked failed: the store that holds them failed. */
const failedAnswers = (
  answers: ReadonlyMap<VrdbSourceId, ReadThroughOutcome>,
): Map<VrdbSourceId, ReadThroughOutcome> =>
  new Map(
    [...answers].map(([id, answer]): [VrdbSourceId, ReadThroughOutcome] => [
      id,
      answer.outcome === "no_key" ? answer : { ...answer, outcome: "failed", fetchedAt: null },
    ]),
  );

/**
 * The lookup of one vendor of one organization. The read-through sources the run researches are
 * asked first (`readThrough`; without it they are not researched). A store that fails gives
 * `failed` for every list the run researches and no records; a match row that cannot be written is
 * logged and the records are offered all the same. It never throws.
 */
export function createVrdbLookup(deps: {
  store: LookupStore;
  organizationId: number;
  vendorId: number;
  enabled: boolean;
  readThrough?: ReadThroughDeps;
}): VrdbLookup {
  const { store, organizationId, vendorId, enabled } = deps;
  return async (input) => {
    const offer = (
      rows: VrdbRow[],
      states: VrdbSourceState[],
      answers: ReadonlyMap<VrdbSourceId, ReadThroughOutcome> = new Map(),
    ) => offerRecords({ ...input, rows, states, enabled, readThrough: answers });
    if (!enabled) return offer([], []).outcome;

    const sources = researchedSources(input.researchable);
    const readThroughs = activeReadThroughs().filter((definition) =>
      input.researchable.includes(definition.category),
    );
    const answers =
      deps.readThrough === undefined || readThroughs.length === 0
        ? new Map<VrdbSourceId, ReadThroughOutcome>()
        : await readThrough(
            {
              sources: readThroughs,
              target: input.target,
              now: input.now,
              signal: input.signal ?? new AbortController().signal,
              readPage: input.readPage,
            },
            deps.readThrough,
          );
    let found: { outcome: VrdbOutcome; matches: MatchWrite[] };
    try {
      const { keys } = lookupKeysOf({ ...input, readThrough: answers });
      // A read-through source's state is the answer of its key, not a sync.
      const mirrors = sources.filter((id) => !readThroughs.some((source) => source.id === id));
      const [states, rows] = await Promise.all([
        store.sourceStates(mirrors),
        store.findRecords(keys, sources),
      ]);
      found = offer(rows, states, answers);
    } catch (error) {
      logger.warn(
        `vendor research (org ${organizationId}): the vendor risk database could not be read (error ${errorName(error)})`,
      );
      return offer([], [], failedAnswers(answers)).outcome;
    }
    if (found.matches.length > 0) {
      try {
        await store.recordMatches(organizationId, vendorId, found.matches, input.now);
      } catch (error) {
        logger.warn(
          `vendor research (org ${organizationId}): the matches of the vendor risk database could not be kept (error ${errorName(error)})`,
        );
      }
    }
    return found.outcome;
  };
}

/** The store of the lookup in the database. */
export const databaseLookupStore: LookupStore = {
  sourceStates: (ids) => getVrdbSourceStatesQuery(ids),
  findRecords: (keys, sources) => findVrdbRecordsByKeysQuery(keys, sources),
  recordMatches: (organizationId, vendorId, matches, at) =>
    recordVendorVrdbMatchesQuery(organizationId, vendorId, matches, at),
};

/**
 * Adds the status job of a read-through source whose answer changed the status of a record (Ruling
 * 12 of the M2 plan). The queue is loaded on the first change, so that a process that changes none
 * opens no connection to it; a failure is logged, and the answer stays stored. It never throws, so
 * the read-through starts it and does not wait for it: a Redis that stalls would otherwise hold the
 * vendor's run past its time limit.
 */
async function relabelAfterAnswer(sourceId: VrdbSourceId): Promise<void> {
  try {
    const { enqueueRelabel } = await import("./queue");
    await enqueueRelabel(sourceId);
  } catch (error) {
    logger.warn(
      `vendor research: the status job of ${sourceId} could not be added (error ${errorName(error)})`,
    );
  }
}

/** The store of the read-through in the database. */
export const databaseReadThroughStore: ReadThroughStore = {
  lookupOf: (sourceId, key) => getVrdbLookupQuery(sourceId, key),
  saveAnswer: async (answer) => {
    const saved = await saveReadThroughAnswerQuery(answer);
    if (saved.statusChanged > 0) void relabelAfterAnswer(answer.definition.id);
    return saved;
  },
};

/** The SEC's connector of the process: one, so that the runs share its memory of the tickers file. */
let processSec: { contact: string; connector: ReadThroughConnector } | undefined;

/**
 * The read-through of a run: the NVD, and the SEC once Q4 gives the address its requests name,
 * asked through the guarded fetch on the turns that every worker shares (records/sharedSpacer.ts).
 * `contact` is for the tests.
 */
export function runReadThrough(contact: string | null = SEC_CONTACT): ReadThroughDeps {
  const nvdSpacer = createSharedSpacer(NVD_LIMITS, {
    redis: applicationRedis,
    key: NVD_SPACER_KEY,
  });
  if (contact === null) {
    return {
      store: databaseReadThroughStore,
      connectors: { nvd: nvdConnector },
      fetchJson,
      spacers: { nvd: nvdSpacer },
    };
  }
  if (processSec?.contact !== contact) {
    processSec = { contact, connector: secConnector(contact) };
  }
  return {
    store: databaseReadThroughStore,
    connectors: { nvd: nvdConnector, sec: processSec.connector },
    fetchJson,
    spacers: {
      nvd: nvdSpacer,
      sec: createSharedSpacer(SEC_LIMITS, { redis: applicationRedis, key: SEC_SPACER_KEY }),
    },
  };
}

/**
 * The lookup of a vendor's run in the database. It is always there: the records switch
 * (VENDOR_RESEARCH_RECORDS) decides whether it asks anything, and a lookup that is switched off
 * says `off` for every list, which the run keeps in its coverage. `config` and `readThroughDeps`
 * are for the tests.
 */
export function sharedVrdbLookup(
  ids: { organizationId: number; vendorId: number },
  config: Pick<VendorResearchConfig, "records"> = getVendorResearchConfig(),
  readThroughDeps: ReadThroughDeps = runReadThrough(),
): VrdbLookup {
  return createVrdbLookup({
    store: databaseLookupStore,
    ...ids,
    enabled: config.records,
    readThrough: readThroughDeps,
  });
}
