/**
 * The vendor risk database (VRDB, spec D4): local copies of public lists (the CISA catalog of known
 * exploited vulnerabilities and three sanctions lists), brought up to date by a scheduled job and
 * looked up by a research run instead of the web, when the VENDOR_RESEARCH_VRDB flag is on. A
 * record is matched to a vendor by keys (keys.ts), never by a model.
 */
import type {
  CoverageSource,
  CredibilityBasis,
  CredibilityLabel,
  FindingSource,
  MatchMethod,
  RecordSourceId,
  RecordStatus,
  ResearchCategory,
  StoredCredibilityBasis,
  VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { PageReader } from "../../webResearch/readPage";
import type { SourceRecord } from "../records/types";
import type { ResearchTarget } from "../target";
import type { ReadThroughSource } from "./sources";

/** One record of a list as a connector reads it, before it is stored. */
export interface ParsedRecord {
  /** The list's own id of the record: a CVE id, an OFAC entity number, a unique id. */
  sourceRecordId: string;
  recordType: "vulnerability" | "sanctions_entity" | "sec_filing";
  title: string;
  /** The record as plain text, word for word the list's: what the model reads and quotes. */
  summary: string;
  /** A public page that shows the record. */
  url: string;
  /** The list's identifiers of the record, as it gives them. */
  identifiers: Record<string, unknown>;
  /** The keys a vendor may match it by (keys.ts): `kev:`, `name:` and `domain:`. */
  matchKeys: string[];
  /** The day the record was published or added to the list, YYYY-MM-DD. */
  publishedAt: string | null;
  /** When the list last changed the record, ISO 8601, when it says. */
  sourceUpdatedAt: string | null;
  /**
   * A record the source itself withdrew from use while it still lists it (a CVE the NVD
   * rejected); absent for an active one. A mirror's records leave by a status of the sync's.
   */
  status?: "active" | "rejected";
  /**
   * When the source itself says the record took its status (a CVE record's `dateRejected`), ISO
   * 8601; absent when it says nothing readable, and the copy then dates the change by its sync.
   */
  statusChangedAt?: string;
}

/** A stored record, as a lookup reads it. */
export interface VrdbRow {
  id: number;
  sourceId: VrdbSourceId;
  sourceRecordId: string;
  recordType: string;
  status: RecordStatus;
  title: string;
  summary: string;
  url: string;
  matchKeys: string[];
  publishedAt: string | null;
  /**
   * The day (YYYY-MM-DD) the record was last read from its source: the last sync of a list, or
   * the last answer of a read-through source that held it. Absent where a caller has no row.
   */
  retrievedAt?: string;
}

/** Where the copy of one list stands. */
export interface VrdbSourceState {
  id: VrdbSourceId;
  lastSuccessAt: Date | null;
  lastOutcome: "ok" | "unchanged" | "failed" | "never";
  /** The list's own version or date, when it gives one. */
  sourceVersion: string | null;
  /** The validators of the last download, for a conditional GET. */
  etag: string | null;
  lastModified: string | null;
  activeRecords: number;
  /**
   * For a list read by its changes (the CVE records): the last day whose changes the copy holds;
   * null before the first, and for any other list. Absent where a state is made by hand.
   */
  cursor?: { day: string } | null;
}

/** What a run keeps of a record it was offered: which record, how it matched, how old the copy. */
export interface VrdbRecordMeta {
  recordId: number;
  sourceId: VrdbSourceId;
  sourceRecordId: string;
  strength: "strong" | "weak";
  method: MatchMethod;
  matchedKey: string;
  status: RecordStatus;
  /** The day of the copy the record was read from, YYYY-MM-DD. */
  asOf: string;
  stale: boolean;
}

/** A record offered to a run as a source, with what the VRDB knows of it. */
export type OfferedRecord = SourceRecord & { vrdb: VrdbRecordMeta };

/** What a lookup gives a run: the records of each list, and the coverage of every list. */
export interface VrdbOutcome {
  records: Array<{
    source: VrdbSourceId;
    records: OfferedRecord[];
    /** Records that matched but were left out: before the lookback, or past the limit. */
    omitted: { old?: number; more?: number };
  }>;
  coverage: CoverageSource[];
}

export interface VrdbLookupInput {
  target: ResearchTarget;
  /** The categories this run researches: a list is looked up only for a category it serves. */
  researchable: readonly ResearchCategory[];
  /** The earliest day a record of each category may have (YYYY-MM-DD); absent for no limit. */
  cutoffs?: Partial<Record<ResearchCategory, string>>;
  now: Date;
  /**
   * The domains that the website check verified as the vendor's (preflight.ts
   * `verifiedDomainsOf`): an entry matches by website only one of them (spec D2.3, D4.5). None
   * when absent.
   */
  verifiedDomains?: readonly string[];
  /** The run's signal: a read-through source is asked within it. None: never cancelled. */
  signal?: AbortSignal;
  /** The run's page reader, for a read-through source that reads a page of a record. */
  readPage?: PageReader;
}

/**
 * What the read-through (readThrough.ts) did for one source of a run: the key it asked by, and
 * when the source last answered for it.
 */
export interface ReadThroughOutcome {
  /** The key the source was asked by (`cpe:<token>`); null when the vendor has none for it. */
  key: string | null;
  /** True for a key found by the name alone (Q3): what it matches is a weak match. */
  weak: boolean;
  /**
   * fresh: a stored answer was young enough; fetched: the source answered now, and the answer is
   * stored; failed: the source could not be asked, now or since a failure that is too recent to
   * try again, and the stored records stand; no_key: the vendor has nothing to ask by.
   */
  outcome: "fresh" | "fetched" | "failed" | "no_key";
  /** When the source last answered for the key; null when it never did. */
  fetchedAt: Date | null;
}

/** The state of one key of a read-through source (`vrdb_lookups`). */
export interface VrdbLookupState {
  /** When the source last answered for the key; null when every answer failed. */
  fetchedAt: Date | null;
  /** Until when the answer stands: the source is not asked again for the key before it. */
  expiresAt: Date;
  /** ok, empty or failed: how the last attempt ended. */
  outcome: string;
}

/**
 * An answer of a read-through source for one key, as it is stored, all or nothing
 * (`saveReadThroughAnswerQuery`). A failed answer holds no records: it moves the time of the next
 * attempt and keeps what is stored.
 */
export interface ReadThroughAnswer {
  definition: ReadThroughSource;
  key: string;
  records: readonly ParsedRecord[];
  outcome: "ok" | "empty" | "failed";
  at: Date;
  expiresAt: Date;
  /**
   * The first day (YYYY-MM-DD) of the window the answer holds in full, when it does: a stored
   * record of the key published since then that the answer lacks is no longer the key's. Absent or
   * null for an answer that may be partial, and for a failed one.
   */
  coversSince?: string | null;
}

/** Looks the vendor up in the VRDB; never throws for what the database does. */
export type VrdbLookup = (input: VrdbLookupInput) => Promise<VrdbOutcome>;

/** A record a vendor matched, as the lookup keeps it for the vendor (`vendor_vrdb_matches`). */
export interface MatchWrite {
  recordId: number;
  method: MatchMethod;
  strength: "strong" | "weak";
  matchedKey: string;
}

/** What a sync writes into the copy of a list, all or nothing (`applyVrdbSnapshotQuery`). */
export interface VrdbSnapshotWrite {
  sourceId: VrdbSourceId;
  /** Every record the list holds now; a stored record that is not among them leaves the list. */
  records: readonly ParsedRecord[];
  /** What a record becomes when the list no longer holds it. */
  missingStatus: "withdrawn" | "delisted";
  /** SHA-256 of the downloaded bodies, hex. */
  rawSnapshotHash: string;
  /** The list's own version, and the validators of the download, kept for the next sync. */
  sourceVersion: string | null;
  etag: string | null;
  lastModified: string | null;
  at: Date;
}

/**
 * What a sync of a list read by its changes writes for one day, all or nothing
 * (`applyVrdbDeltaQuery`): the records that changed, with their status. A stored record that is
 * not among them stays as it is.
 */
export interface VrdbDeltaWrite {
  sourceId: VrdbSourceId;
  records: readonly ParsedRecord[];
  /**
   * The day applied, kept as the list's cursor, and the list is marked synced. Null is a batch of a
   * baseline before its last: the stored cursor, the list's outcome and its last success stay as
   * they are, so a load that stops halfway leaves the list as it was.
   */
  cursor: { day: string } | null;
  /** SHA-256 of what was read, hex. */
  rawSnapshotHash: string;
  at: Date;
}

/** What an apply changed: records read, new, with a new content, and with a new status. */
export interface ApplyCounts {
  seen: number;
  inserted: number;
  updated: number;
  statusChanged: number;
}

/** How a sync attempt ended, as its row keeps it (`vrdb_sync_runs`). */
export interface VrdbSyncRunResult {
  outcome: "ok" | "unchanged" | "failed";
  /** A fixed code, never a message. */
  errorCode?: string;
  bytes?: number;
  counts?: ApplyCounts;
  rawSnapshotHash?: string;
}

/**
 * The state a sync leaves on its list when it applies nothing: unchanged (a success, with the
 * validators of the download when there was one) or failed (with a fixed code).
 */
export type VrdbSourceMark =
  | {
      outcome: "unchanged";
      at: Date;
      validators?: { etag: string | null; lastModified: string | null };
    }
  | { outcome: "failed"; at: Date; errorCode: string };

/**
 * The status a record of the copy has for the findings that cite it (Ruling 9 of the M2 plan: a
 * vulnerability is rejected when any list rejected its CVE), and the day that status began
 * (YYYY-MM-DD, UTC); `rejectedBy` names the list that rejected the CVE when it is another.
 */
export interface RecordStatusChange {
  status: RecordStatus;
  changedOn: string;
  rejectedBy?: RecordSourceId;
}

/**
 * A pending finding with a label that cites a record whose stored status is no longer its status
 * (`findFindingsToRelabelQuery`), with the status of every record of the copy it cites, by id.
 */
export interface FindingToRelabel {
  organization_id: number;
  id: number;
  credibility_basis: StoredCredibilityBasis;
  sources: FindingSource[];
  statuses: ReadonlyMap<number, RecordStatusChange>;
}

/** A finding's label again, its basis and its sources, with the statuses of the records it cites. */
export interface FindingRelabel {
  label: CredibilityLabel;
  basis: CredibilityBasis;
  sources: FindingSource[];
}
