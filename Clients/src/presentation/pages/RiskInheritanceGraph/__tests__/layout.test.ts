import { describe, it, expect } from "vitest";
import { layoutRiskGraph, COL_W, ROW_H } from "../layout";
import type {
  RiskGraph,
  RiskGraphEdge,
  RiskGraphNode,
  RiskGraphNodeKey,
} from "../../../../domain/interfaces/i.riskLink";

let nextId = 1000;

const node = (key: RiskGraphNodeKey, name?: string): RiskGraphNode => {
  const [entityType, id] = key.split(":");
  return {
    key,
    entityType: entityType as RiskGraphNode["entityType"],
    id: Number(id),
    name: name ?? key,
    riskLevel: null,
  };
};

const edge = (
  id: number,
  relationType: RiskGraphEdge["relationType"],
  status: RiskGraphEdge["status"],
  sourceKey: RiskGraphNodeKey,
  targetKey: RiskGraphNodeKey,
  score = 0,
): RiskGraphEdge => ({
  id,
  relationType,
  status,
  sourceKey,
  targetKey,
  score,
  parentLevelChangedAt: null,
});

const inh = (
  id: number,
  status: RiskGraphEdge["status"],
  child: RiskGraphNodeKey,
  parent: RiskGraphNodeKey,
  score = 0,
) => edge(id, "inherits_from", status, child, parent, score);

const rel = (id: number, a: RiskGraphNodeKey, b: RiskGraphNodeKey) =>
  edge(id, "related_to", "suggested", a, b);

const graphOf = (nodes: RiskGraphNode[], edges: RiskGraphEdge[]): RiskGraph => ({
  nodes,
  edges,
  truncated: false,
});

describe("layoutRiskGraph", () => {
  it("centers a parent over its two children", () => {
    const { positions, demotedEdgeIds } = layoutRiskGraph(
      graphOf(
        [node("risk:1", "Parent"), node("risk:2", "A"), node("risk:3", "B")],
        [inh(1, "confirmed", "risk:2", "risk:1"), inh(2, "confirmed", "risk:3", "risk:1")],
      ),
    );

    expect(positions.get("risk:1")).toEqual({ x: COL_W / 2, y: 0 });
    expect(positions.get("risk:2")).toEqual({ x: 0, y: ROW_H });
    expect(positions.get("risk:3")).toEqual({ x: COL_W, y: ROW_H });
    expect(demotedEdgeIds.size).toBe(0);
  });

  it("does not overlap two separate parent groups", () => {
    const { positions } = layoutRiskGraph(
      graphOf(
        [node("risk:1", "P1"), node("risk:2", "C1"), node("risk:3", "P2"), node("risk:4", "C2")],
        [inh(1, "confirmed", "risk:2", "risk:1"), inh(2, "confirmed", "risk:4", "risk:3")],
      ),
    );

    const xs = ["risk:1", "risk:2", "risk:3", "risk:4"].map((k) => positions.get(k)!.x);
    const groupA = [xs[0], xs[1]];
    const groupB = [xs[2], xs[3]];
    expect(Math.max(...groupA)).toBeLessThan(Math.min(...groupB));
  });

  it("puts a related_to-only node on the loose row", () => {
    const { positions } = layoutRiskGraph(
      graphOf([node("risk:1", "Solo")], [rel(1, "risk:1", "risk:9")]),
    );

    // risk:9 is not a node, so the edge is ignored for positioning entirely.
    expect(positions.get("risk:1")).toEqual({ x: 0, y: ROW_H * 2 });
  });

  it("demotes all but one competing parent without mutating the input", () => {
    const input = graphOf(
      [node("risk:1", "P1"), node("risk:2", "P2"), node("risk:3", "C")],
      [inh(1, "suggested", "risk:3", "risk:1"), inh(2, "suggested", "risk:3", "risk:2")],
    );
    const before = JSON.stringify(input);

    const { positions, demotedEdgeIds } = layoutRiskGraph(input);

    expect(demotedEdgeIds.size).toBe(1);
    expect(positions.get("risk:3")).toEqual({ x: 0, y: ROW_H });
    expect(JSON.stringify(input)).toBe(before);
  });

  it("elects confirmed over suggested even at a lower score", () => {
    const { positions, demotedEdgeIds } = layoutRiskGraph(
      graphOf(
        [node("risk:1", "P1"), node("risk:2", "P2"), node("risk:3", "C")],
        [
          inh(1, "suggested", "risk:3", "risk:1", 9),
          inh(2, "confirmed", "risk:3", "risk:2", 0),
        ],
      ),
    );

    expect(demotedEdgeIds).toEqual(new Set([1]));
    expect(positions.get("risk:2")).toEqual({ x: 0, y: 0 });
    expect(positions.get("risk:3")).toEqual({ x: 0, y: ROW_H });
  });

  it("breaks equal-status equal-score ties by lower edge id", () => {
    const { demotedEdgeIds } = layoutRiskGraph(
      graphOf(
        [node("risk:1", "P1"), node("risk:2", "P2"), node("risk:3", "C")],
        [inh(7, "suggested", "risk:3", "risk:1"), inh(5, "suggested", "risk:3", "risk:2")],
      ),
    );

    expect(demotedEdgeIds).toEqual(new Set([7]));
  });

  it("demotes the upper link of a three-level chain", () => {
    const { positions, demotedEdgeIds } = layoutRiskGraph(
      graphOf(
        [node("risk:1", "A"), node("risk:2", "B"), node("risk:3", "C")],
        [inh(1, "suggested", "risk:2", "risk:1"), inh(2, "suggested", "risk:3", "risk:2")],
      ),
    );

    expect(positions.get("risk:1")).toEqual({ x: 0, y: 0 });
    expect(positions.get("risk:2")).toEqual({ x: 0, y: ROW_H });
    expect(positions.get("risk:3")).toEqual({ x: 0, y: ROW_H * 2 });
    expect(demotedEdgeIds).toEqual(new Set([2]));
  });

  it("terminates a two-cycle with both nodes loose and both edges demoted", () => {
    const { positions, demotedEdgeIds } = layoutRiskGraph(
      graphOf(
        [node("risk:1", "A"), node("risk:2", "B")],
        [inh(1, "suggested", "risk:1", "risk:2"), inh(2, "suggested", "risk:2", "risk:1")],
      ),
    );

    expect(positions.get("risk:1")!.y).toBe(ROW_H * 2);
    expect(positions.get("risk:2")!.y).toBe(ROW_H * 2);
    expect(demotedEdgeIds).toEqual(new Set([1, 2]));
  });

  it("is deterministic across runs", () => {
    const input = graphOf(
      [node("risk:1", "P"), node("risk:2", "C2"), node("risk:3", "C1")],
      [inh(1, "suggested", "risk:2", "risk:1"), inh(2, "suggested", "risk:3", "risk:1")],
    );

    const first = layoutRiskGraph(input);
    const second = layoutRiskGraph(input);

    expect([...second.positions.entries()]).toEqual([...first.positions.entries()]);
    expect([...second.demotedEdgeIds]).toEqual([...first.demotedEdgeIds]);
  });

  it("lays out the real dev-DB shape: one root, two children, one loose node", () => {
    const { positions, demotedEdgeIds } = layoutRiskGraph(
      graphOf(
        [node("risk:1"), node("risk:2"), node("risk:3"), node("risk:4")],
        [
          inh(41, "suggested", "risk:3", "risk:2"),
          inh(42, "suggested", "risk:4", "risk:2"),
          rel(4, "risk:1", "risk:2"),
          rel(5, "risk:2", "risk:4"),
          rel(6, "risk:1", "risk:4"),
        ],
      ),
    );

    expect(positions.get("risk:2")!.y).toBe(0);
    expect(positions.get("risk:3")!.y).toBe(ROW_H);
    expect(positions.get("risk:4")!.y).toBe(ROW_H);
    expect(positions.get("risk:1")!.y).toBe(ROW_H * 2);
    expect(demotedEdgeIds.size).toBe(0);
  });

  it("terminates a three-cycle with everything loose", () => {
    const { positions, demotedEdgeIds } = layoutRiskGraph(
      graphOf(
        [node("risk:1", "A"), node("risk:2", "B"), node("risk:3", "C")],
        [
          inh(nextId++, "suggested", "risk:1", "risk:2"),
          inh(nextId++, "suggested", "risk:2", "risk:3"),
          inh(nextId++, "suggested", "risk:3", "risk:1"),
        ],
      ),
    );

    for (const key of ["risk:1", "risk:2", "risk:3"] as const) {
      expect(positions.get(key)!.y).toBe(ROW_H * 2);
    }
    expect(demotedEdgeIds.size).toBe(3);
  });
});
