import { DismissReason } from "./dismissReason";

/** One reason a pair of risks scored together. Structured, never prose. */
export interface LinkSignal {
  /** Stable machine key, e.g. "shared_category". Safe to switch on. */
  signal: string;
  /** Points this signal contributed to the pair's score. */
  weight: number;
  /** The matched value(s), for display. Omitted when the signal is boolean. */
  detail?: string;
}

/** One scored partner for the subject risk, before merging across providers. */
export interface LinkCandidate {
  targetRiskId: number;
  score: number;
  reasons: LinkSignal[];
}

/** The only risk columns a tier-0 provider needs. */
export interface RiskScoringRow {
  id: number;
  risk_category: string[] | null;
  controls_mapping: string | null;
  assessment_mapping: string | null;
  ai_lifecycle_phase: string | null;
  projects: number[];
}

/**
 * One (neighbour, shared element) row from the tier-1 graph query.
 *
 * `element_key` is namespaced by table, e.g. "eu_control:412". `degree` is how
 * many active risks in this org are attached to that element — always >= 2,
 * since the row only exists because two distinct risks share it.
 */
export interface StructuralNeighbourRow {
  target_risk_id: number;
  element_key: string;
  degree: number;
}

export interface RecomputeContext {
  organizationId: number;
  subject: RiskScoringRow;
  /** Every other active risk in the org. Never includes the subject. */
  candidates: RiskScoringRow[];
}

export interface LinkSignalProvider {
  name: string;
  /** 0 = field overlap (A1). 1 = structural graph, 2 = embeddings (both A2). */
  tier: 0 | 1 | 2;
  score(ctx: RecomputeContext): Promise<LinkCandidate[]>;
}

export type RiskLinkStatus = "suggested" | "confirmed" | "dismissed";
export type RiskLinkSource = "derived" | "user" | "agent";
export type RiskLinkRelationType = "related_to" | "inherits_from";

export const RISK_LINK_STATUSES: RiskLinkStatus[] = ["suggested", "confirmed", "dismissed"];

/** A row of risk_links, already type-coerced by riskLink.utils. */
export interface RiskLinkRow {
  id: number;
  organization_id: number;
  source_risk_id: number;
  /** Null when the parent lives in another table — see the two columns below. */
  target_risk_id: number | null;
  target_model_risk_id: number | null;
  target_vendor_risk_id: number | null;
  relation_type: RiskLinkRelationType;
  status: RiskLinkStatus;
  source: RiskLinkSource;
  score: number;
  reasons: LinkSignal[];
  decided_at: string | null;
  last_computed_at: string | null;
  /** Why a SUGGESTED link was thrown away. Null on every other status — see C3 §3.5. */
  dismiss_reason: DismissReason | null;
  dismiss_note: string | null;
}

/**
 * Undirected edges are stored smaller-id-first so a pair has exactly one row.
 * Enforced by the risk_links_canonical CHECK constraint.
 */
export const canonicalPair = (a: number, b: number): [number, number] =>
  a < b ? [a, b] : [b, a];

/**
 * One undirected `related_to` edge. Lives here rather than beside
 * `connectedComponents` because `utils/riskLink.utils.ts` produces it and the
 * service consumes it, and a util importing from a service inverts the
 * dependency direction the rest of that file keeps.
 */
export interface RelatedPair {
  a: number;
  b: number;
}
