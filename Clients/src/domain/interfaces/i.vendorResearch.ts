import { VendorRisk } from "../types/VendorRisk";

/*
 * What the vendor research endpoints send. Names and unions mirror
 * Servers/domain.layer/interfaces/i.vendorResearch.ts, so the fields stay
 * snake_case. Dates cross the wire as ISO strings, not Date objects.
 */

/** The topics the vendor research agent covers. */
export type ResearchCategory =
  "security_incidents" | "certifications" | "legal_regulatory" | "ai_specific";

export type ResearchRunStatus = "queued" | "running" | "completed" | "failed";
export type ResearchTrigger = "auto" | "manual";
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
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

/** A source a finding cites. Third-party text: render it as plain text. */
export interface FindingSource {
  url: string;
  title: string;
  quote: string;
  published_at: string | null;
}

export type FindingConfidence = "low" | "medium" | "high";
export type FindingStatus = "pending" | "accepted" | "dismissed";
export type DismissReason =
  "not_applicable" | "already_covered" | "inaccurate" | "accepted_risk" | "other";

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
  confidence: FindingConfidence;
  /** A finding cites at least one source. */
  sources: FindingSource[];
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

/** What the server has set up. Research can run when the organization has an LLM key. */
export interface VendorResearchConfig {
  hasLlmKey: boolean;
  autoRunEnabled: boolean;
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
