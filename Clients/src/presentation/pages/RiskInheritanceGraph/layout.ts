/**
 * Deterministic layout for the risk-inheritance graph. Pure data in, positions
 * out — no React, no ReactFlow — so it is unit-testable on its own.
 *
 * The input can contain anything suggested rows allow: a child with several
 * suggested parents, chains deeper than two levels, even cycles. The election
 * plus the chain guard reduce that to a forest before anything is placed, so
 * placement itself never needs a cycle check.
 */

import type {
  RiskGraph,
  RiskGraphEdge,
  RiskGraphNodeKey,
} from "../../../domain/interfaces/i.riskLink";

export const COL_W = 300;
export const ROW_H = 190;
export const GROUP_GAP = 80;

export interface RiskGraphLayout {
  positions: Map<RiskGraphNodeKey, { x: number; y: number }>;
  /**
   * Edges that are drawn but do NOT determine position: a losing parent
   * election, or an edge that would have made the graph deeper than two levels.
   * The page renders these faintly so a competing suggestion is still visible.
   */
  demotedEdgeIds: Set<number>;
}

/** confirmed before suggested; then higher score; then lower id. */
function electWinner(a: RiskGraphEdge, b: RiskGraphEdge): RiskGraphEdge {
  const rank = (e: RiskGraphEdge) => (e.status === "confirmed" ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) < rank(b) ? a : b;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  return a.id < b.id ? a : b;
}

const byNameThenKey = (
  byKey: Map<RiskGraphNodeKey, { name: string | null }>,
  a: RiskGraphNodeKey,
  b: RiskGraphNodeKey,
): number =>
  (byKey.get(a)?.name ?? "").localeCompare(byKey.get(b)?.name ?? "") ||
  (a < b ? -1 : a > b ? 1 : 0);

export function layoutRiskGraph(graph: RiskGraph): RiskGraphLayout {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const demotedEdgeIds = new Set<number>();

  // inherits_from edges whose both endpoints exist. Anything else is ignored
  // for positioning.
  const inh = graph.edges.filter(
    (e) => e.relationType === "inherits_from" && byKey.has(e.sourceKey) && byKey.has(e.targetKey),
  );

  // Parent election: one winner per child, losers demoted.
  const parentOf = new Map<RiskGraphNodeKey, RiskGraphEdge>();
  for (const edge of inh) {
    const current = parentOf.get(edge.sourceKey);
    if (!current) {
      parentOf.set(edge.sourceKey, edge);
    } else {
      const winner = electWinner(current, edge);
      parentOf.set(edge.sourceKey, winner);
      demotedEdgeIds.add(winner === current ? edge.id : current.id);
    }
  }

  // Chain guard: no key may be both a child and a parent. Tested against the
  // snapshot, not the live map — reading the live map makes the result depend
  // on iteration order, and this is what makes a 2-cycle terminate.
  const wasChild = new Set(parentOf.keys());
  for (const [childKey, edge] of [...parentOf.entries()]) {
    if (wasChild.has(edge.targetKey)) {
      parentOf.delete(childKey);
      demotedEdgeIds.add(edge.id);
    }
  }

  const childrenOf = new Map<RiskGraphNodeKey, RiskGraphNodeKey[]>();
  for (const [childKey, edge] of parentOf) {
    const list = childrenOf.get(edge.targetKey) ?? [];
    list.push(childKey);
    childrenOf.set(edge.targetKey, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => byNameThenKey(byKey, a, b));
  }
  const roots = [...childrenOf.keys()].sort((a, b) => byNameThenKey(byKey, a, b));

  const positions = new Map<RiskGraphNodeKey, { x: number; y: number }>();
  let cursorX = 0;
  for (const root of roots) {
    const children = childrenOf.get(root)!;
    children.forEach((child, i) => {
      positions.set(child, { x: cursorX + i * COL_W, y: ROW_H });
    });
    positions.set(root, { x: cursorX + ((children.length - 1) * COL_W) / 2, y: 0 });
    cursorX += children.length * COL_W + GROUP_GAP;
  }

  // Loose: related_to-only risks and demoted children. Sorted by name so
  // re-renders are stable.
  const loose = graph.nodes
    .filter((n) => !positions.has(n.key))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || (a.key < b.key ? -1 : 1));
  loose.forEach((node, i) => {
    positions.set(node.key, { x: i * COL_W, y: ROW_H * 2 });
  });

  return { positions, demotedEdgeIds };
}
