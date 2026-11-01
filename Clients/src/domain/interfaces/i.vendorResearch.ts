import { VendorRisk } from "../types/VendorRisk";

/*
 * What the vendor research endpoints send. Names and unions mirror
 * Servers/domain.layer/interfaces/i.vendorResearch.ts, so the fields stay
 * snake_case. Dates cross the wire as ISO strings, not Date objects.
 */

/** The topics the vendor research agent covers. */
export type ResearchCategory =
  | "security_incidents"
  | "certifications"
  | "legal_regulatory"
  | "ai_specific"
  | "availability"
  | "financial_health";

export type ResearchRunStatus = "queued" | "running" | "completed" | "failed";
/** Who started a run: the system after a vendor was created, a person, or the scheduled scan. */
export type ResearchTrigger = "auto" | "manual" | "scheduled";
export type CategoryOutcome = "findings" | "nothing_found" | "search_failed" | "skipped";

/** What happened to one category in a run. */
export interface CategorySummaryEntry {
  category: ResearchCategory;
  outcome: CategoryOutcome;
  /**
   * A fixed sentence from the server, or, for a `nothing_found` category where the
   * model proposed nothing, text the model wrote. Treat it as untrusted plain text.
   */
  note: string;
}

/**
 * What a running run is doing, as the server writes it at every step of the research. Counts and
 * closed words only, so it is safe to show to everyone who sees the run.
 */
export interface RunProgress {
  /** Where the run is: researching the web, then analysing what it found. */
  phase: "researching" | "analysing";
  /** The model turns the research loop has taken so far; 0 before the first one. */
  steps: number;
  /** What the latest turn did on the web; null before the first turn and for a turn that did none. */
  action: "search" | "read" | null;
  /** The category of the latest turn, when it had one. */
  category: ResearchCategory | null;
  searchesUsed: number;
  pagesRead: number;
  /** The categories the research has worked on so far. */
  categories: ResearchCategory[];
  /** When the server wrote this (ISO 8601): another value than before means the run has moved. */
  updatedAt: string;
}

/** The public databases whose records a research run reads as sources. */
export type RecordSourceId =
  | "kev"
  | "nvd"
  | "hibp"
  | "sec"
  | "statuspage"
  | "ofac"
  | "uk_sanctions"
  | "eu_fsf"
  | "cve"
  | "un_sanctions";

/**
 * The lists the vendor risk database mirrors, and the databases it reads through (the NVD, the
 * SEC): looked up in the database instead of on the web.
 */
export type VrdbSourceId =
  "kev" | "nvd" | "sec" | "ofac" | "uk_sanctions" | "eu_fsf" | "cve" | "un_sanctions";

/**
 * What a run learned from one source of records: records were found, none were, the lookup
 * failed, the source is switched off, or the run did not research the category it serves.
 */
export type CoverageOutcome = "found" | "none" | "failed" | "off" | "not_researched";

/**
 * What a cited source is, decided by the server from its source registry: a government, regulator,
 * court or official database, a reviewed news publisher, the vendor speaking for itself, or
 * anything else.
 */
export type SourceCategory = "official" | "trusted_press" | "vendor" | "unverified";

/** Whether a database still stands by a record. */
export type RecordStatus = "active" | "withdrawn" | "rejected" | "delisted";

/**
 * One list of the vendor risk database as a run saw it: a copy (`mirror`), or a database it reads
 * through and keeps the answers of for a while (`read_through`), whose day is that of the answer.
 */
export interface CoverageSource {
  id: VrdbSourceId;
  /** The server's English name and attribution; the screen words them from `id` instead. */
  name: string;
  attribution: string;
  mode: "mirror" | "read_through";
  /** True when the run asked the list: its outcome is `found` or `none`. */
  checked: boolean;
  outcome: CoverageOutcome;
  /** The records found by a strong match, and by the name alone. */
  strong: number;
  weak: number;
  /** When the copy was last brought up to date (ISO 8601); null when it never was. */
  last_success_at: string | null;
  stale: boolean;
}

/**
 * A database the run still asks on the web (HIBP, the status page, and the SEC until its gate
 * opens). A run stored before the NVD was read through lists the NVD here too.
 */
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
 * The search a run's searches went to: Claude's own web search, the web search of OpenAI (no run
 * uses it yet: its keys search the news today), or the news of the GDELT Project.
 */
export type RunSearchEngine = "anthropic" | "openai" | "gdelt";

/**
 * One research run, as the API sends it: an allowlist. The counters are in it;
 * the evidence pack, the model and the prompt version stay on the server.
 */
export interface VendorResearchRun {
  id: number;
  vendor_id: number;
  status: ResearchRunStatus;
  trigger_type: ResearchTrigger;
  /** Categories the run executed; empty until it finishes. */
  categories: ResearchCategory[];
  /** One entry per category; empty until the run finishes, and for most failed runs. */
  category_summary: CategorySummaryEntry[];
  duplicates_dropped: number;
  /** How many searches the run made. */
  searches_used: number;
  /** How many pages the run read. */
  pages_read: number;
  /** Set when the run failed. One of a closed set of English phrases. */
  error: string | null;
  /** What the run is doing now; null unless it is running. */
  progress: RunProgress | null;
  /**
   * What a run of the vendor risk database checked and what its findings cite. Null for a run
   * without it and for one that has not ended; absent in a run cached before the field existed.
   */
  coverage?: RunCoverage | null;
  /**
   * The search the run used. Null for a run that searched nothing, for one none of whose searches
   * was answered, and for one from before the field; absent in a run cached before the field existed.
   */
  search_engine?: RunSearchEngine | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

/**
 * A source a finding cites. Third-party text: render it as plain text. A finding of a run of the
 * vendor risk database also has what the server's credibility rule found the source to be; a
 * finding of another run has none of those fields.
 */
export interface FindingSource {
  url: string;
  title: string;
  quote: string;
  published_at: string | null;
  category?: SourceCategory;
  /** The key of independence: the registry entry, the database, or "vendor". */
  publisher?: string;
  flags?: Array<"downgraded" | "syndicated" | "user_content">;
  /** For the record of a public database: which, its row, its status, and how surely it matched. */
  record?: {
    source_id: RecordSourceId;
    record_id: number | null;
    status: RecordStatus;
    match_strength: "strong" | "weak" | null;
  };
}

/**
 * How well the cited sources of a finding establish its facts, computed by the server's code and
 * never by a model. It says nothing of how likely or how serious the risk is.
 */
export type CredibilityLabel = "low" | "medium" | "high";

/** The rule that decided a label (see "Rationale and note" in the vendor risk database spec). */
export type CredibilityRule =
  | "official_record"
  | "official_page"
  | "vendor_statement"
  | "trusted_press_two"
  | "capped_unconfirmed"
  | "trusted_press_one"
  | "contradicted"
  | "name_only"
  | "unverified"
  | "self_claim"
  | "inactive";

/** A cited source as the credibility rule saw it. */
export interface CredibilitySource {
  url: string;
  category: SourceCategory;
  /** The key of independence: the registry entry, the database, or "vendor". */
  publisher: string;
  /** The publisher's name, for display: given for trusted press whose registry entry names it. */
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
   * read from (YYYY-MM-DD), and whether that copy was out of date. Once a list changed its status,
   * `as_of` is the day it did; `rejected_by` names the list that rejected its CVE when that list
   * is another.
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
  user_content?: true;
}

/** Why a finding has its credibility label: what the screen words its rationale from. */
export interface CredibilityBasis {
  rule: CredibilityRule;
  /** The version of the source registry that classified the sources. */
  registry_version: string;
  /** True when a cited record matched the vendor by name only: "this may be another company". */
  name_only: boolean;
  /** In the order the finding cites them. */
  sources: CredibilitySource[];
}

/** The rule of a label the backfill gave a pending finding of a run before the rule. */
export type BackfillRule = `backfill_${CredibilityRule}`;

/** The basis the backfill stored for a pending finding: the rule's own, under the backfill's name. */
export interface BackfilledCredibilityBasis extends Omit<CredibilityBasis, "rule"> {
  rule: BackfillRule;
}

/**
 * The basis of a label that is the earlier confidence of a finding, as it was: a finding of a run
 * before the credibility rule has no label of its own, and the server reads its confidence as the
 * label on this basis (the backfill writes the same basis for a finding a person decided). No rule
 * decided the label and it has no sources to word a sentence from.
 */
export interface LegacyCredibilityBasis {
  rule: "legacy_confidence";
}

/** A basis as the server sends it: the rule's, one the backfill wrote, or the earlier confidence's. */
export type StoredCredibilityBasis =
  CredibilityBasis | BackfilledCredibilityBasis | LegacyCredibilityBasis;
export type FindingStatus = "pending" | "accepted" | "dismissed";
export type DismissReason =
  | "not_applicable"
  | "already_covered"
  | "inaccurate"
  | "accepted_risk"
  | "wrong_vendor"
  | "outdated"
  | "other";

/** A risk candidate waiting to be accepted into the register or dismissed. */
export interface VendorRiskFinding {
  id: number;
  organization_id: number;
  vendor_id: number;
  run_id: number;
  category: ResearchCategory;
  risk_description: string;
  impact_description: string;
  action_plan: string;
  likelihood: VendorRisk["likelihood"];
  risk_severity: VendorRisk["risk_severity"];
  /** For example "High Risk". */
  risk_level: string;
  /**
   * The credibility label and why it is what it is. Every finding has them: a finding of a run
   * before the credibility rule has its earlier confidence level as the label, on the basis
   * `legacy_confidence`. The server sends null only for a finding with neither, and a list cached
   * before the fields existed has none. The finding has no confidence of its own to show.
   */
  credibility?: CredibilityLabel | null;
  credibility_basis?: StoredCredibilityBasis | null;
  /**
   * The server's English line for the label, for clients that do not translate it. The screen
   * words the line from `credibility_basis` in the person's language instead.
   */
  credibility_rationale?: string | null;
  /**
   * One sentence from the model on why the likelihood and the severity are what they are. Null
   * for the findings of runs from before the sentence existed. Untrusted plain text.
   */
  rationale: string | null;
  /** A finding cites at least one source. */
  sources: FindingSource[];
  /**
   * True when no page confirmed the quotes of the finding: they come from search results, and the
   * page of the best source did not hold the quote or could not be read. Absent in a list that was
   * cached before the field existed; read as false.
   */
  snippet_only?: boolean;
  status: FindingStatus;
  dismissed_reason: DismissReason | null;
  dismissed_note: string | null;
  accepted_vendor_risk_id: number | null;
  decided_by: number | null;
  decided_at: string | null;
  created_at: string;
  /** On the rows of the findings list only. */
  vendor_name?: string;
}

/**
 * What accepting a finding takes. Every field is optional: one that is absent keeps the finding's
 * own value, so `{}` accepts the finding as it is. `action_owner` absent means the vendor's
 * assignee, `null` nobody, and a number that user. The other fields are what the person changed in
 * the vendor risk form before saving, the risk level as the form worked it out. The vendor is
 * always the finding's own.
 */
export interface AcceptFindingBody {
  action_owner?: number | null;
  risk_description?: string;
  impact_description?: string;
  action_plan?: string;
  likelihood?: string;
  risk_severity?: string;
  risk_level?: string;
  frameworks?: number[];
}

/** What the server has set up. Research can run when the organization has an LLM key. */
export interface VendorResearchConfig {
  hasLlmKey: boolean;
  autoRunEnabled: boolean;
}

/**
 * Which of the organization's LLM keys the research uses, as an Admin chose, and how often the
 * scheduled scan researches the vendors again. `null` leaves a key to the default: the newest key
 * for the research, and the research key for the analysis. For `scanIntervalDays`, `null` is off,
 * and the server takes 7, 14 or 30.
 */
export interface VendorResearchSettings {
  researchKeyId: number | null;
  analysisKeyId: number | null;
  scanIntervalDays: number | null;
}

/**
 * The register entry an accepted finding created: the JSON of the server's
 * `VendorRiskModel`, exactly. It is not a `VendorRisk`, the type of the register
 * list rows (which names the id `risk_id` and carries the vendor's name). The row
 * comes straight from the insert, so every field is there; `impact` is not,
 * because the register table has no such column.
 */
export interface AcceptedVendorRisk {
  id: number;
  vendor_id: number;
  /** Accepting a finding never sets an order number. */
  order_no: number | null;
  risk_description: string;
  impact_description: string;
  likelihood: VendorRisk["likelihood"];
  risk_severity: VendorRisk["risk_severity"];
  action_plan: string;
  /** Null when the finding was accepted without an owner. */
  action_owner: number | null;
  risk_level: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}
