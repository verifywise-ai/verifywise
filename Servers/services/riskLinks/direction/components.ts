import { RelatedPair } from "../types";

/**
 * The largest component one LLM call will accept. Above this the prompt stops
 * fitting a sensible context budget and grouping quality falls off faster than
 * the component's value rises. Oversized components are skipped and counted,
 * never truncated — a partial component would be a grouping decision made by
 * an arbitrary cut rather than by the model.
 */
export const MAX_COMPONENT_SIZE = 25;

/**
 * Partitions the `related_to` edge list into connected components by
 * union-find. A component is the unit of work for a direction pass: see §3 of
 * the C2 design for why the component, and not the risk or the pair, is what
 * one call must own.
 *
 * Ids inside a component and the components themselves both come back sorted
 * ascending. That ordering is load-bearing, not cosmetic — the queue's jobId is
 * derived from a component's smallest id, so an unstable order would let one
 * component enqueue twice under two different ids.
 *
 * A risk with no `related_to` edge never appears in `pairs` and so is absent
 * from the result, correctly: a lone risk has nothing to group.
 */
export function connectedComponents(pairs: RelatedPair[]): number[][] {
  const parent = new Map<number, number>();

  const add = (x: number) => {
    if (!parent.has(x)) parent.set(x, x);
  };

  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression: re-point everything walked at the root.
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  for (const { a, b } of pairs) {
    add(a);
    add(b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const bucket = groups.get(root);
    if (bucket) bucket.push(id);
    else groups.set(root, [id]);
  }

  return [...groups.values()]
    .map((ids) => ids.sort((x, y) => x - y))
    .sort((left, right) => left[0] - right[0]);
}
