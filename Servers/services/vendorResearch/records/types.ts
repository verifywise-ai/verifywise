/**
 * The records of public databases that a research run reads as sources: the CISA catalog of known
 * exploited vulnerabilities, the National Vulnerability Database, Have I Been Pwned, the filings
 * of the SEC, the incident history of the vendor's status page and the sanctions list of the
 * United States Treasury. They are looked up by the vendor's name and domain with no model and no
 * search, and each record enters the ledger as a source that was read (see WebSession.addRecords).
 */
import type {
  RecordSourceId,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { FetchFailureReason } from "../../webResearch/guardedFetch";
import type { PageReader } from "../../webResearch/readPage";
import type { ResearchTarget } from "../target";

export type { RecordSourceId } from "../../../domain.layer/interfaces/i.vendorResearch";

/** The category whose sources the records of each database are: what it is a record of. */
export const RECORD_CATEGORY: Readonly<Record<RecordSourceId, ResearchCategory>> = {
  kev: "security_incidents",
  nvd: "security_incidents",
  hibp: "security_incidents",
  sec: "security_incidents",
  statuspage: "availability",
  ofac: "legal_regulatory",
  uk_sanctions: "legal_regulatory",
  eu_fsf: "legal_regulatory",
  cve: "security_incidents",
  un_sanctions: "legal_regulatory",
};

/** One record of a database, written out as a source. */
export interface SourceRecord {
  /** A public page that shows the record. */
  url: string;
  title: string;
  /** The record as plain text: what the model reads and quotes, word for word the database's. */
  text: string;
  /** The day the record was published or added to the database, YYYY-MM-DD. */
  publishedAt: string;
}

/** Why a lookup failed, in the words of the failures of a read. */
export type RecordFailure = Exclude<FetchFailureReason, "not_allowed" | "blocked_by_robots">;

/** What came of one lookup. */
export interface RecordsOutcome {
  source: RecordSourceId;
  /** The address that was asked, for the trace. */
  url: string;
  outcome: "ok" | "empty" | "failed";
  reason?: RecordFailure;
  records: SourceRecord[];
  /** Records that matched but were left out: before the lookback, or past the limit. */
  omitted: { old?: number; more?: number };
  ms: number;
}

export interface RecordsInput {
  target: ResearchTarget;
  /** The categories this run researches: a database is asked only for a category it serves. */
  researchable: readonly ResearchCategory[];
  /** The earliest day a record of each category may have (YYYY-MM-DD); absent for no limit. */
  cutoffs?: Partial<Record<ResearchCategory, string>>;
  /** Today, from which a lookup names the window it asks for. */
  now: Date;
  signal: AbortSignal;
  /**
   * The run's page reader, for the documents that a record points to (the text of a filing of the
   * SEC): its robots.txt rules, its guard and its cache apply. Without it a record holds the
   * facts of the database only.
   */
  readPage?: PageReader;
}

/** Looks the vendor up in the databases; never throws for what the web does. */
export type RecordsLookup = (input: RecordsInput) => Promise<RecordsOutcome[]>;

/**
 * Gets a JSON document from a public address and parses it. It throws a FetchError when the
 * answer is not a document that can be read: the failure words are those of a read.
 */
export type FetchJson = (
  url: string,
  /** `userAgent` replaces the bot's, for a database that asks for a contact (the SEC, Q4). */
  options: { maxBytes: number; signal: AbortSignal; userAgent?: string },
) => Promise<unknown>;

/**
 * Gets a document of text (a feed) from a public address of a vendor's website, as the page reader
 * does: robots.txt allows it, the address policy applies. It throws a FetchError when the answer is
 * not a document that can be read; `blocked_by_robots` is the reason for a page the site keeps robots
 * from.
 */
export type FetchText = (
  url: string,
  options: { maxBytes: number; signal: AbortSignal },
) => Promise<string>;

/**
 * The most records one database gives to a run: the newest, so that a big vendor is not a flood.
 * The status page gives its summary and three incidents. A sanctions list gives two entries: a
 * name that two entries share is a reason to check who the vendor is, not a list to read.
 */
export const MAX_RECORDS = {
  kev: 5,
  nvd: 3,
  hibp: 3,
  sec: 3,
  statuspage: 4,
  ofac: 2,
  uk_sanctions: 2,
  eu_fsf: 2,
  cve: 3,
  un_sanctions: 2,
} as const satisfies Record<RecordSourceId, number>;
