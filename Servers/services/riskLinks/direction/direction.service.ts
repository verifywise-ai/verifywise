import { HierarchyEdge, validateTwoLevel } from "../hierarchy";
import { canonicalPair } from "../types";
import { HierarchyGroup } from "./schema";

/**
 * The unordered key two risks share regardless of which is proposed as parent.
 * Rule 4 is deliberately direction-blind, so the key must be too.
 */
export function hierarchyPairKey(a: number, b: number): string {
  const [low, high] = canonicalPair(a, b);
  return `${low}:${high}`;
}

/**
 * Turns the model's proposed groups into the edges that are safe to store.
 *
 * Five rules, applied in order. The first three are about the answer's internal
 * shape; the last two are about the answer against what is already stored.
 *
 * 1. Every id must belong to this component. A hallucinated id would otherwise
 *    write a link between two risks the model was never shown.
 * 2. A parent may not be among its own children.
 * 3. A risk is claimed as a child at most once, and no risk is both a parent
 *    and a child. This is the two-level rule applied within a single answer.
 *    Note what it does NOT forbid: the same parent appearing in two groups.
 *    That is one legal answer split across two objects, and C1 constrains
 *    children to one parent, not parents to one group.
 * 4. A pair that already carries an `inherits_from` row in ANY status drops —
 *    `dismissed` included, and keyed on the unordered pair.
 * 5. Each survivor runs `validateTwoLevel` against the blocking edges plus what
 *    this call has already accepted.
 *
 * Rule 5 is the guarantee. The accumulator makes the batch self-consistent;
 * `blockingEdges` carrying confirmed edges makes it consistent with every human
 * decision; `blockingEdges` also carrying live suggestions makes it consistent
 * with what earlier scans have already put in front of the user. Nothing this
 * function returns can be unconfirmable at the moment it is written.
 *
 * Note that passing suggested edges to `validateTwoLevel` widens it past what
 * its own doc comment describes. That comment is written for the confirm
 * endpoint, where competing suggestions are legal by design. Here they are not:
 * C1 permits one confirmed parent per child, so a second live candidate is a
 * proposal guaranteed to fail on confirm. Widening at this call site is the
 * intended asymmetry, not a misuse.
 *
 * Pure and exported so it can be tested without a paid network call.
 */
export function filterProposedGroups(
  groups: HierarchyGroup[],
  componentRiskIds: number[],
  blockingEdges: HierarchyEdge[],
  pairsWithExistingHierarchy: Set<string>,
): HierarchyEdge[] {
  const inComponent = new Set(componentRiskIds);
  // Two sets, not one. A child may be claimed once; a parent may repeat as a
  // parent but must never cross over to the other set.
  const claimedAsChild = new Set<number>();
  const usedAsParent = new Set<number>();
  const accepted: HierarchyEdge[] = [];

  for (const group of groups) {
    const ids = [group.parent_risk_id, ...group.child_risk_ids];

    // 1
    if (ids.some((id) => !inComponent.has(id))) continue;
    // 2
    if (group.child_risk_ids.includes(group.parent_risk_id)) continue;
    // 3
    if (claimedAsChild.has(group.parent_risk_id)) continue;
    if (group.child_risk_ids.some((id) => claimedAsChild.has(id) || usedAsParent.has(id))) {
      continue;
    }
    // A duplicate id inside one group would break rule 3 on its second
    // occurrence; catching it here keeps the whole group atomic.
    if (new Set(ids).size !== ids.length) continue;

    const groupEdges: HierarchyEdge[] = [];
    for (const childRiskId of group.child_risk_ids) {
      // 4
      if (pairsWithExistingHierarchy.has(hierarchyPairKey(childRiskId, group.parent_risk_id))) {
        continue;
      }
      const edge = { childRiskId, parentRiskId: group.parent_risk_id };
      // 5
      if (validateTwoLevel(edge, [...blockingEdges, ...accepted, ...groupEdges])) continue;
      groupEdges.push(edge);
    }

    if (groupEdges.length === 0) continue;

    accepted.push(...groupEdges);
    for (const edge of groupEdges) {
      claimedAsChild.add(edge.childRiskId);
    }
    usedAsParent.add(group.parent_risk_id);
  }

  return accepted;
}
