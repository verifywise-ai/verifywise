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
  csl: "legal_regulatory",
  aiid: "ai_specific",
  atlas: "ai_specific",
  nhtsa_sgo: "ai_specific",
  fda_ai_devices: "ai_specific",
  fda_device_recalls: "ai_specific",
  canada_sema: "legal_regulatory",
  california_breaches: "security_incidents",
  uk_ofsi: "legal_regulatory",
  charlotin: "ai_specific",
  ftc_penalties: "legal_regulatory",
  piperoll: "ai_specific",
  eu_dg_comp: "legal_regulatory",
  disclose_io: "security_incidents",
  uk_cma: "legal_regulatory",
  canada_ai_register: "ai_specific",
  ftc_competition: "legal_regulatory",
  omb_ai_inventory: "ai_specific",
  co_sic_penalties: "legal_regulatory",
  uk_atrs: "ai_specific",
  nhtsa_recalls: "legal_regulatory",
  fmti: "ai_specific",
  uk_mhra: "legal_regulatory",
  nl_algoritmeregister: "ai_specific",
  nhtsa_odi: "legal_regulatory",
  fedramp: "certifications",
  epoch_ai: "ai_specific",
  c2pa_conforming: "certifications",
  gleif: "financial_health",
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
  csl: 2,
  aiid: 3,
  atlas: 3,
  nhtsa_sgo: 3,
  fda_ai_devices: 2,
  fda_device_recalls: 3,
  canada_sema: 2,
  california_breaches: 2,
  uk_ofsi: 1,
  charlotin: 2,
  ftc_penalties: 2,
  piperoll: 1,
  eu_dg_comp: 2,
  disclose_io: 1,
  uk_cma: 1,
  canada_ai_register: 1,
  ftc_competition: 2,
  omb_ai_inventory: 1,
  co_sic_penalties: 2,
  uk_atrs: 1,
  nhtsa_recalls: 2,
  fmti: 1,
  uk_mhra: 1,
  nl_algoritmeregister: 1,
  nhtsa_odi: 2,
  fedramp: 2,
  epoch_ai: 1,
  c2pa_conforming: 1,
  gleif: 1,
} as const satisfies Record<RecordSourceId, number>;

/**
 * The lists whose records never raise a risk (prompt vr-15, the register or status lists): context
 * for another risk. The pack gives them up first, and they never support a credibility label.
 * fda_ai_devices raises no risk either, but keeps its shipped behaviour.
 */
export const CONTEXT_ONLY_RECORD_SOURCES: ReadonlySet<RecordSourceId> = new Set<RecordSourceId>([
  "canada_ai_register",
  "omb_ai_inventory",
  "nl_algoritmeregister",
  "uk_atrs",
  "epoch_ai",
  "fmti",
  "c2pa_conforming",
  "fedramp",
  "disclose_io",
  "gleif",
]);

/**
 * The lists added on 2026-11-10, but Canada's sanctions list: the briefing of the loop names one of
 * them only when it gave records or failed, and counts the others in one line (`describeGathered`,
 * gather.ts), because one line for each list on every step of the loop costs about 5 KB a step. The
 * lists shipped before, and the sanctions lists, keep their lines. It is the server twin of
 * `LISTS_SHOWN_WHEN_FOUND` of the client (Clients/src/application/utils/vendorResearchText.ts), which
 * does the same for the coverage a person reads: the two hold the same 22 ids.
 */
export const LISTS_NAMED_WHEN_FOUND: ReadonlySet<RecordSourceId> = new Set<RecordSourceId>([
  "uk_ofsi",
  "ftc_penalties",
  "eu_dg_comp",
  "uk_cma",
  "ftc_competition",
  "co_sic_penalties",
  "nhtsa_recalls",
  "uk_mhra",
  "nhtsa_odi",
  "california_breaches",
  "charlotin",
  "piperoll",
  "canada_ai_register",
  "omb_ai_inventory",
  "uk_atrs",
  "nl_algoritmeregister",
  "epoch_ai",
  "fmti",
  "fedramp",
  "c2pa_conforming",
  "disclose_io",
  "gleif",
]);
