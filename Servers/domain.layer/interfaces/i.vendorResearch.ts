import { IVendorRisk } from "./i.vendorRisk";

/** The topics the vendor research agent covers. */
export const RESEARCH_CATEGORIES = [
  "security_incidents",
  "certifications",
  "legal_regulatory",
  "ai_specific",
  "availability",
  "financial_health",
] as const;
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number];

/**
 * The public databases whose records a research run reads as sources (see
 * services/vendorResearch/records).
 */
export const RECORD_SOURCE_IDS = [
  "kev",
  "nvd",
  "hibp",
  "sec",
  "statuspage",
  "ofac",
  "uk_sanctions",
  "eu_fsf",
  "cve",
  "un_sanctions",
] as const;
export type RecordSourceId = (typeof RECORD_SOURCE_IDS)[number];

/**
 * The lists the vendor risk database mirrors, and the databases it reads through (the NVD, the
 * SEC), in services/vendorResearch/vrdb: their records are looked up in the database, not on the
 * web, when the VENDOR_RESEARCH_VRDB flag is on. A list behind a closed gate (vrdb/gates.ts: sec,
 * cve, un_sanctions) is neither copied nor looked up.
 */
export const VRDB_SOURCE_IDS = [
  "kev",
  "nvd",
  "sec",
  "ofac",
  "uk_sanctions",
  "eu_fsf",
  "cve",
  "un_sanctions",
] as const;
export type VrdbSourceId = (typeof VRDB_SOURCE_IDS)[number];

/**
 * How a record was found to be about the vendor: a strong match names the vendor or its domain the
 * way the database does (a KEV vendor, a CPE vendor, a CIK, a domain, an identifier), and a weak
 * one only shares its name.
 */
export const MATCH_METHODS = [
  "kev_vendor",
  "cve_affected_vendor",
  "nvd_cpe_vendor",
  "sec_cik",
  "domain",
  "identifier",
  "name_exact",
] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

/**
 * What a run learned from one source of records: records were found, none were, the lookup
 * failed, the source is switched off, or the run did not research the category it serves.
 */
export const COVERAGE_OUTCOMES = ["found", "none", "failed", "off", "not_researched"] as const;
export type CoverageOutcome = (typeof COVERAGE_OUTCOMES)[number];

/** One list of the vendor risk database as a run saw it; stored in the run's `coverage`. */
export interface CoverageSource {
  id: VrdbSourceId;
  name: string;
  attribution: string;
  mode: "mirror" | "read_through";
  checked: boolean;
  outcome: CoverageOutcome;
  /** The records found by a strong match, and by the name alone. */
  strong: number;
  weak: number;
  /** When the copy was last brought up to date, ISO 8601; null when it never was. */
  last_success_at: string | null;
  stale: boolean;
}

/** A database the run still asks on the web (NVD, HIBP, the SEC, the status page). */
export interface CoverageLookup {
  id: RecordSourceId;
  outcome: CoverageOutcome;
}

/** What a run checked, and the categories of the sources its findings cite. */
export interface RunCoverage {
  registry_version: string;
  sources: CoverageSource[];
  lookups: CoverageLookup[];
  cited: Record<SourceCategory, number>;
}

/**
 * What a cited source is, decided by code from the source registry (see
 * services/vendorResearch/sourceRegistry): a government, regulator, court or official database, a
 * reviewed news publisher, the vendor speaking for itself, or anything else.
 */
export const SOURCE_CATEGORIES = ["official", "trusted_press", "vendor", "unverified"] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

/**
 * Whether a database still stands by a record: an entry withdrawn from a catalog, a rejected CVE
 * or a name delisted from a sanctions list supports nothing.
 */
export const RECORD_STATUSES = ["active", "withdrawn", "rejected", "delisted"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export type ResearchRunStatus = "queued" | "running" | "completed" | "failed";
/**
 * Who started a run: the system after a vendor was created (`auto`), a person (`manual`), or the
 * scheduled scan of the organization (`scheduled`), which analyses only the sources that are new.
 */
export type ResearchTrigger = "auto" | "manual" | "scheduled";
export type CategoryOutcome = "findings" | "nothing_found" | "search_failed" | "skipped";

/** What happened to one category in a run. */
export interface CategorySummaryEntry {
  category: ResearchCategory;
  outcome: CategoryOutcome;
  note: string;
}

/**
 * One source shown to the model, a search result's snippet or a page's excerpt; stored in the
 * run's `evidence` column.
 */
export interface EvidenceSource {
  id: string;
  category: ResearchCategory;
  kind: "result" | "page";
  /**
   * True when the source is on the vendor's own website, as the research decided it: a page by the
   * address that answered after redirects, not by the one that was asked for.
   */
  onVendorSite: boolean;
  url: string;
  title: string;
  content: string;
  publishedAt: string | null;
}

/**
 * A source a finding cites; stored in the finding's `sources` column. A run of the vendor risk
 * database (the VENDOR_RESEARCH_VRDB flag) also stores what the credibility rule found it to be;
 * a finding from another run has none of those fields.
 */
export interface FindingSource {
  url: string;
  title: string;
  quote: string;
  published_at: string | null;
  category?: SourceCategory;
  /** The key of independence, as the basis has it: the registry entry, the database, or "vendor". */
  publisher?: string;
  flags?: Array<"downgraded" | "syndicated" | "user_content">;
  /**
   * For the record of a public database: which, its row in the vendor risk database (null for a
   * record looked up on the web), its status, and how surely it is the vendor's.
   */
  record?: {
    source_id: RecordSourceId;
    record_id: number | null;
    status: RecordStatus;
    match_strength: "strong" | "weak" | null;
  };
}

export type FindingConfidence = "low" | "medium" | "high";
export type FindingStatus = "pending" | "accepted" | "dismissed";

/**
 * How well the cited sources of a finding establish its facts, computed by code from the source
 * registry and never by a model (see services/vendorResearch/credibility.ts). It says nothing of
 * how likely or how serious the risk is.
 */
export const CREDIBILITY_LABELS = ["low", "medium", "high"] as const;
export type CredibilityLabel = (typeof CREDIBILITY_LABELS)[number];

/**
 * The rule that decided a label: the four that give `high`, the two that give `medium`, and the
 * five that give `low`, each group in the order the rule tries them.
 */
export const CREDIBILITY_RULES = [
  "official_record",
  "official_page",
  "vendor_statement",
  "trusted_press_two",
  "capped_unconfirmed",
  "trusted_press_one",
  "contradicted",
  "name_only",
  "unverified",
  "self_claim",
  "inactive",
] as const;
export type CredibilityRule = (typeof CREDIBILITY_RULES)[number];

/** A cited source as the credibility rule saw it. */
export interface CredibilitySource {
  url: string;
  category: SourceCategory;
  /** The key of independence: the registry entry, the database, or "vendor". */
  publisher: string;
  /** The publisher's name, for display: given for trusted press whose entry names it. */
  publisher_name?: string;
  /** The registry entry that classified the source; null for none, a record, or the vendor's site. */
  entry: string | null;
  /** False for a host the registry does not know. */
  reviewed: boolean;
  /**
   * `read` for a page the research read or a result whose page holds the quote, `contradicted`
   * for a result whose page does not, and `unconfirmed` for a result whose page nobody read.
   */
  reading: "read" | "unconfirmed" | "contradicted";
  /** For the vendor's own word: what it reports (a statement), or what it claims of itself. */
  vendor_kind?: "statement" | "self_claim";
  /**
   * For the record of a public database: which, how surely it is the vendor's, and its status;
   * for a record of the vendor risk database also its id in the list, the day of the copy it was
   * read from (YYYY-MM-DD), and whether that copy was out of date. Once the status job changed its
   * status, `as_of` is the day it changed; `rejected_by` names the list that rejected its CVE when
   * that list is another (Ruling 9 of the M2 plan).
   */
  record?: {
    source: RecordSourceId;
    match: "strong" | "weak" | null;
    status: RecordStatus;
    source_record_id?: string;
    as_of?: string;
    stale?: true;
    rejected_by?: RecordSourceId;
  };
  downgraded?: true;
  syndicated?: true;
  blocked?: true;
  /** User content: a forum, a community or a platform where users publish (Q25). */
  user_content?: true;
}

/** Why a finding has its label: what a person, and the client's wording of it, reads it from. */
export interface CredibilityBasis {
  rule: CredibilityRule;
  /** The version of the source registry that classified the sources. */
  registry_version: string;
  /** True when a cited record matched the vendor by name only: "this may be another company". */
  name_only: boolean;
  /** In the order the finding cites them. */
  sources: CredibilitySource[];
}

/**
 * The rule of a label the backfill gave a pending finding of a run before the rule (spec D4.6): the
 * rule that decided it, under a name that says so (`backfill_official_record`).
 */
export type BackfillRule = `backfill_${CredibilityRule}`;

/** The rule of a label the backfill carried over from a decided finding's confidence (spec D4.6). */
export const LEGACY_CONFIDENCE_RULE = "legacy_confidence";

/** The basis the backfill stored for a pending finding: the rule's own, under the backfill's name. */
export interface BackfilledCredibilityBasis extends Omit<CredibilityBasis, "rule"> {
  rule: BackfillRule;
}

/** The basis the backfill stored for an accepted or dismissed finding: its confidence, as it was. */
export interface LegacyCredibilityBasis {
  rule: typeof LEGACY_CONFIDENCE_RULE;
}

/** A basis as the column stores it: the rule's, or one the backfill wrote (M3). */
export type StoredCredibilityBasis =
  CredibilityBasis | BackfilledCredibilityBasis | LegacyCredibilityBasis;

/**
 * Why a person dismissed a finding. `wrong_vendor` (the sources are about another company) and
 * `outdated` (the sources are too old to matter) say what the agent got wrong rather than what
 * the person decided about the risk, which is what the rate of acceptance by reason is read for.
 */
export const DISMISS_REASONS = [
  "not_applicable",
  "already_covered",
  "inaccurate",
  "accepted_risk",
  "wrong_vendor",
  "outdated",
  "other",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

/** Where a running run is: it researches the web, then analyses what it found. */
export const RUN_PHASES = ["researching", "analysing"] as const;
export type RunPhase = (typeof RUN_PHASES)[number];

/**
 * What a running run is doing, written at every step of the research and read by the page while
 * the run is active; null for a run that is queued or has ended. It is served to every role, so it
 * holds counts, closed words and a time and nothing that a web page or the model wrote: no query,
 * address, title or thought (those are in the trace, for administrators).
 */
export interface RunProgress {
  phase: RunPhase;
  /** The model turns the research loop has taken so far. */
  steps: number;
  /** What the latest turn did on the web; null before the first turn, and for a turn that did none. */
  action: "search" | "read" | null;
  /** The category of the latest turn, when it had one. */
  category: ResearchCategory | null;
  searchesUsed: number;
  pagesRead: number;
  /** The categories the research has worked on so far, in the order of the categories. */
  categories: ResearchCategory[];
  /** When this was written (ISO 8601), so that a reader can tell whether the run has moved. */
  updatedAt: string;
}

/** A row of `vendor_research_runs`. */
export interface IVendorResearchRun {
  id: number;
  organization_id: number;
  vendor_id: number;
  trigger_type: ResearchTrigger;
  status: ResearchRunStatus;
  /** Categories the run executed; empty until it finishes. */
  categories: ResearchCategory[];
  /** One entry per category; empty until the run finishes. */
  category_summary: CategorySummaryEntry[];
  /**
   * The evidence pack the model saw (audit trail), capped at 100,000 bytes; null when the run has
   * none.
   */
  evidence: EvidenceSource[] | null;
  model: string | null;
  prompt_version: string | null;
  searches_used: number;
  pages_read: number;
  duplicates_dropped: number;
  /** Truncated to 500 characters; set when the run failed. */
  error: string | null;
  /** What the run is doing now; null unless it is running (see `RunProgress`). */
  progress: RunProgress | null;
  /** Null for automatic runs and when the requesting user was deleted. */
  requested_by: number | null;
  /**
   * What a run of the vendor risk database checked and what its findings cite; null for a run
   * without the flag, and for one that has not ended.
   */
  coverage: RunCoverage | null;
  /** The version of the source registry that classified the run's sources; null as `coverage`. */
  registry_version: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

/** A row of `vendor_risk_findings`: a risk candidate waiting to be accepted into the register or dismissed. */
export interface IVendorRiskFinding {
  id: number;
  organization_id: number;
  vendor_id: number;
  run_id: number;
  category: ResearchCategory;
  risk_description: string;
  impact_description: string;
  action_plan: string;
  likelihood: IVendorRisk["likelihood"];
  risk_severity: IVendorRisk["risk_severity"];
  /** For example "High Risk". */
  risk_level: string;
  confidence: FindingConfidence;
  /**
   * How well the cited sources establish the facts, computed by code (see `CredibilityLabel`), and
   * why: null for a finding of a run without the vendor risk database flag.
   */
  credibility: CredibilityLabel | null;
  credibility_basis: StoredCredibilityBasis | null;
  /**
   * One sentence on why this likelihood and this severity, written by the model. Null for a
   * finding from before the column and for one whose model gave none.
   */
  rationale: string | null;
  /** A finding cites at least one source. */
  sources: FindingSource[];
  /**
   * True when the sources of the finding are search results that nobody confirmed on a page: the
   * check after the analysis (see services/vendorResearch/verifySnippets.ts) found no page that
   * holds the quote, because the page does not or because it could not be read. False for a
   * finding that rests on a page, one whose page was checked, one from before the column, and one
   * that was not checked.
   */
  snippet_only: boolean;
  status: FindingStatus;
  dismissed_reason: DismissReason | null;
  dismissed_note: string | null;
  accepted_vendor_risk_id: number | null;
  decided_by: number | null;
  decided_at: Date | null;
  created_at: Date;
}

/**
 * The columns of a finding that the model produces; the rest is set by the system. `snippet_only`
 * is set by the check after the analysis, and absent means false; the credibility label and its
 * basis are set by code under the vendor risk database flag, and absent means null.
 */
export type NewFinding = Pick<
  IVendorRiskFinding,
  | "category"
  | "risk_description"
  | "impact_description"
  | "action_plan"
  | "likelihood"
  | "risk_severity"
  | "risk_level"
  | "confidence"
  | "rationale"
  | "sources"
> &
  Partial<Pick<IVendorRiskFinding, "snippet_only">> &
  Partial<Pick<IVendorRiskFinding, "credibility">> & {
    /** A run writes the rule's own basis; only the backfill's script writes the others (M3). */
    credibility_basis?: CredibilityBasis | null;
  };

/**
 * Which of the organization's LLM keys a research run uses. A choice that is null means the
 * default: the newest key for the research, and the key of the research for the analysis.
 */
export interface VendorResearchKeyChoice {
  researchKeyId: number | null;
  analysisKeyId: number | null;
}

/** The days between two scheduled scans of a vendor that an administrator can choose from. */
export const SCAN_INTERVAL_DAYS = [7, 14, 30] as const;

/**
 * What an administrator chose for the research of the organization: the keys, and how often the
 * scheduled scan researches each vendor again. A scan interval that is null means the scan is off,
 * which is what an organization has until it chooses.
 */
export interface VendorResearchSettings extends VendorResearchKeyChoice {
  scanIntervalDays: number | null;
}

/**
 * The kinds of page where a vendor states its terms, and of which a run keeps the text (see
 * services/vendorResearch/policySnapshots.ts).
 */
export const POLICY_KINDS = ["terms", "privacy", "dpa", "subprocessors", "security"] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

/** What `vendor_research_snapshots` keeps of a page. */
export interface StoredSnapshot {
  hash: string;
  /** The lines of the page, as `linesOf` makes them, joined by a line feed. */
  body: string;
  /** The last time a run read the page with this text. */
  lastSeenAt: Date;
}

/** A page to keep once the run has completed. */
export interface SnapshotWrite {
  pageKey: string;
  url: string;
  kind: PolicyKind;
  title: string;
  hash: string;
  body: string;
}
