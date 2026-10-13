import { IVendorRisk } from "./i.vendorRisk";

/** The topics the vendor research agent covers. */
export const RESEARCH_CATEGORIES = [
  "security_incidents",
  "certifications",
  "legal_regulatory",
  "ai_specific",
] as const;
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number];

export type ResearchRunStatus = "queued" | "running" | "completed" | "failed";
export type ResearchTrigger = "auto" | "manual";
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
  url: string;
  title: string;
  content: string;
  publishedAt: string | null;
}

/** A source a finding cites; stored in the finding's `sources` column. */
export interface FindingSource {
  url: string;
  title: string;
  quote: string;
  published_at: string | null;
}

export type FindingConfidence = "low" | "medium" | "high";
export type FindingStatus = "pending" | "accepted" | "dismissed";

export const DISMISS_REASONS = [
  "not_applicable",
  "already_covered",
  "inaccurate",
  "accepted_risk",
  "other",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

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
  /** The evidence pack the model saw (audit trail), capped at 40 KB; null when the run has none. */
  evidence: EvidenceSource[] | null;
  search_provider: string | null;
  model: string | null;
  prompt_version: string | null;
  searches_used: number;
  duplicates_dropped: number;
  /** Truncated to 500 characters; set when the run failed. */
  error: string | null;
  /** Null for automatic runs and when the requesting user was deleted. */
  requested_by: number | null;
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
  /** A finding cites at least one source. */
  sources: FindingSource[];
  status: FindingStatus;
  dismissed_reason: DismissReason | null;
  dismissed_note: string | null;
  accepted_vendor_risk_id: number | null;
  decided_by: number | null;
  decided_at: Date | null;
  created_at: Date;
}

/** The columns of a finding that the model produces; the rest is set by the system. */
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
  | "sources"
>;
