import { HierarchyParent } from "../../../utils/riskLink.utils";

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
