export type RiskLinkStatus = "suggested" | "confirmed" | "dismissed";
export type RiskLinkSource = "derived" | "user" | "agent";
export type RiskLinkRelationType = "related_to" | "inherits_from";
export type RiskLinkDirection = "outgoing" | "incoming" | "undirected";

/** Mirrors `ParentEntityType` in Servers/services/riskLinks/hierarchy.ts. */
export type RiskLinkEntityType = "risk" | "model_risk" | "vendor_risk";

/** Empty for "risk": a project risk in a panel of project risks needs no label. */
export const ENTITY_TYPE_LABELS: Record<RiskLinkEntityType, string> = {
  risk: "",
  model_risk: "Model risk",
  vendor_risk: "Vendor risk",
};

/** Mirrors `DismissReason` in Servers/services/riskLinks/dismissReason.ts. */
export type DismissReason =
  | "not_related"
  | "too_weak"
  | "duplicate"
  | "wrong_direction"
  | "wrong_parent"
  | "not_hierarchical"
  | "other";

export interface RiskLinkReason {
  signal: string;
  weight: number;
  detail?: string;
}

/** Mirrors `toResponse` in Servers/controllers/riskLinks.ctrl.ts. */
export interface RiskLink {
  id: number;
  status: RiskLinkStatus;
  source: RiskLinkSource;
  relationType: RiskLinkRelationType;
  score: number;
  reasons: RiskLinkReason[];
  direction: RiskLinkDirection;
  decidedAt: string | null;
  lastComputedAt: string | null;
  /** Set only on a link dismissed from `suggested`, and only if the user said why. */
  dismissReason: DismissReason | null;
  dismissNote: string | null;
  relatedRisk: {
    id: number;
    entityType: RiskLinkEntityType;
    name: string | null;
    riskLevel: string | null;
    ownerId: number | null;
  };
}

/**
 * For `inherits_from`, `sourceRiskId` is the risk that inherits. The client never
 * canonicalises — the server does, and only for `related_to`.
 */
export type CreateRiskLinkInput = {
  sourceRiskId: number;
  relationType: RiskLinkRelationType;
} & (
  | { targetRiskId: number }
  | { targetModelRiskId: number }
  | { targetVendorRiskId: number }
);

/**
 * A cross-entity parent candidate that shares at least one project with the
 * risk being linked. Ranking only — the picker still lists non-sharers.
 */
export interface SharedProjectCandidate {
  entityType: Exclude<RiskLinkEntityType, "risk">;
  id: number;
  projects: string[];
}
