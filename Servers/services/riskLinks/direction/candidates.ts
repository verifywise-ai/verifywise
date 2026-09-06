import {
  getSharedProjectCandidatesQuery,
  HierarchyParent,
} from "../../../utils/riskLink.utils";

/** One vendor or model risk offered to the model as a possible parent. */
export interface CrossEntityCandidate {
  parent: HierarchyParent;
  /** What the panel would show for it. Without it the model sees only an id. */
  name: string;
  /** The component risks that reach it through a shared project. C6 §4.2. */
  childRiskIds: Set<number>;
  /** Shared project titles, for the prompt's justification line. */
  projects: string[];
}

/** How a candidate is addressed in the map and in `usedAsParent`. */
export const candidateKey = (parent: HierarchyParent): string =>
  `${parent.entityType}:${parent.id}`;

/**
 * Every vendor / model risk reachable from any risk in the component, each
 * carrying the risks that reached it.
 *
 * One query per member rather than a component-wide one: `getSharedProjectCandidatesQuery`
 * is per-risk by design, and which risk reached a candidate is the rule (C6
 * §4.2), not a detail. These are plain SQL against an indexed join and the
 * component is capped at 25, so the loop is not the cost here — the model call
 * that follows is.
 */
export async function gatherCrossEntityCandidates(
  organizationId: number,
  riskIds: number[],
): Promise<Map<string, CrossEntityCandidate>> {
  const merged = new Map<string, CrossEntityCandidate>();

  for (const riskId of riskIds) {
    for (const row of await getSharedProjectCandidatesQuery(organizationId, riskId)) {
      const parent: HierarchyParent = { id: row.id, entityType: row.entityType };
      const key = candidateKey(parent);
      const existing = merged.get(key);
      if (existing) {
        existing.childRiskIds.add(riskId);
        for (const project of row.projects) {
          if (!existing.projects.includes(project)) existing.projects.push(project);
        }
      } else {
        merged.set(key, {
          parent,
          name: row.name,
          childRiskIds: new Set([riskId]),
          projects: [...row.projects],
        });
      }
    }
  }

  return merged;
}
