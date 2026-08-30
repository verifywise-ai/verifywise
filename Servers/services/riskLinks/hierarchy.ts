/**
 * The two-level grouping rule (C1):
 *
 *   A risk is either a parent, or a child, or unattached — never both.
 *   A child has exactly one parent.
 *
 * Rules 2 and 3 below are what make it two levels: no risk appears in both
 * columns, so every edge runs leaf -> root and no path of length two exists.
 * Cycles of every length become impossible as a consequence, which is why this
 * REPLACES the old reciprocal-pair check rather than joining it.
 *
 * Pure by design — no database, no request, no ORM. Same reason
 * `Clients/src/application/tools/relatedRisks.ts` is a standalone module: the
 * rule is the part worth testing, and it should be testable in isolation.
 *
 * Single-parent (rule 1) is ALSO enforced by `risk_links_single_parent_idx`.
 * That is not redundancy: the index is atomic and this function is not, so the
 * index closes the race and this function produces the readable message.
 */

/** Which table a parent id points at. C4: vendor and model risks are parents only. */
export type ParentEntityType = "risk" | "model_risk" | "vendor_risk";

/** In storage, `source_risk_id` is the child and the target column is the parent. */
export interface HierarchyEdge {
  childRiskId: number;
  parentRiskId: number;
  /**
   * Which table `parentRiskId` points at. Absent means `risks`, so every C1–C3
   * caller keeps working untouched. Without it, `model_risks.id = 7` and
   * `risks.id = 7` compare equal and the validator reports a violation about a
   * row the user never mentioned.
   */
  parentEntityType?: ParentEntityType;
}

export type HierarchyViolation =
  | "child_already_has_parent"
  | "parent_is_a_child"
  | "child_has_children";

const parentKey = (e: HierarchyEdge): string =>
  `${e.parentEntityType ?? "risk"}:${e.parentRiskId}`;

/**
 * @param proposed the edge about to become confirmed
 * @param confirmed every CONFIRMED `inherits_from` edge touching either
 *   endpoint. A superset is fine — the checks filter. Suggested and dismissed
 *   rows must NOT be included: competing suggestions are legal by design.
 * @returns null when the proposed edge keeps the grouping two levels deep
 */
export function validateTwoLevel(
  proposed: HierarchyEdge,
  confirmed: HierarchyEdge[],
): HierarchyViolation | null {
  const { childRiskId } = proposed;
  const proposedParent = parentKey(proposed);

  // An edge identical to the proposed one is not a violation. On POST it is a
  // duplicate, and createUserRiskLinkQuery's ON CONFLICT answers that with a
  // truer message ("These risks are already linked"); reporting
  // child_already_has_parent would name the very parent the user just added.
  const others = confirmed.filter(
    (e) => !(e.childRiskId === childRiskId && parentKey(e) === proposedParent),
  );

  // Order is load-bearing: first match wins, so the message is deterministic
  // when more than one rule applies.
  if (others.some((e) => e.childRiskId === childRiskId)) return "child_already_has_parent";

  // A cross-entity parent can never itself be a child (C4 §3.3), and childRiskId
  // only ever holds a risks(id) — so this check is meaningful only for a plain
  // risk parent. Guarding it is what stops the id collision.
  if ((proposed.parentEntityType ?? "risk") === "risk") {
    if (others.some((e) => e.childRiskId === proposed.parentRiskId)) return "parent_is_a_child";
  }

  if (others.some((e) => parentKey(e) === `risk:${childRiskId}`)) return "child_has_children";
  return null;
}
