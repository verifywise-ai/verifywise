import { describe, it, expect } from "vitest";
import { vendorSubgraph, vendorsOnMap } from "../vendorFilter";
import type {
  RiskGraph,
  RiskGraphEdge,
  RiskGraphNode,
} from "../../../../domain/interfaces/i.riskLink";

const risk = (id: number): RiskGraphNode => ({
  key: `risk:${id}`,
  entityType: "risk",
  id,
  name: `Risk ${id}`,
  riskLevel: null,
});

const vendorRisk = (
  id: number,
  vendor: { id: number; name: string | null } | null,
): RiskGraphNode => ({
  key: `vendor_risk:${id}`,
  entityType: "vendor_risk",
  id,
  name: `Vendor risk ${id}`,
  riskLevel: null,
  vendor,
});

let nextEdge = 1;
const edge = (
  sourceKey: string,
  targetKey: string,
  relationType: RiskGraphEdge["relationType"] = "inherits_from",
): RiskGraphEdge => ({
  id: nextEdge++,
  sourceKey,
  targetKey,
  relationType,
  status: "confirmed",
  score: 0,
  parentLevelChangedAt: null,
});

const acme = { id: 1, name: "Acme" };
const zeta = { id: 2, name: "Zeta" };

// Two vendors, a child of each, a related_to between the children and one
// project risk that sits outside both vendors' reach.
const graph: RiskGraph = {
  nodes: [
    vendorRisk(10, acme),
    vendorRisk(11, acme),
    vendorRisk(20, zeta),
    risk(100),
    risk(101),
    risk(200),
    risk(300),
  ],
  edges: [
    edge("risk:100", "vendor_risk:10"),
    edge("risk:101", "vendor_risk:11"),
    edge("risk:200", "vendor_risk:20"),
    edge("risk:100", "risk:101", "related_to"),
    edge("risk:100", "risk:200", "related_to"),
    edge("risk:300", "risk:100", "related_to"),
  ],
  truncated: false,
};

describe("vendorsOnMap", () => {
  it("lists each vendor with a risk on the map once, by name", () => {
    expect(vendorsOnMap({ ...graph, nodes: [...graph.nodes].reverse() })).toEqual([acme, zeta]);
  });

  it("skips vendor risks that carry no vendor", () => {
    expect(
      vendorsOnMap({ nodes: [vendorRisk(1, null), risk(2)], edges: [], truncated: false }),
    ).toEqual([]);
  });
});

describe("vendorSubgraph", () => {
  it("keeps the vendor's risks, their children and the links among those", () => {
    const shown = vendorSubgraph(graph, acme.id);

    expect(shown.nodes.map((n) => n.key).sort()).toEqual(
      ["risk:100", "risk:101", "vendor_risk:10", "vendor_risk:11"].sort(),
    );
    // The children's related_to to each other stays; links that leave the
    // vendor's part of the map do not.
    expect(shown.edges.map((e) => `${e.sourceKey}>${e.targetKey}`).sort()).toEqual(
      ["risk:100>risk:101", "risk:100>vendor_risk:10", "risk:101>vendor_risk:11"].sort(),
    );
  });

  it("does not pull in a project risk that only relates to a child", () => {
    const shown = vendorSubgraph(graph, zeta.id);

    expect(shown.nodes.map((n) => n.key).sort()).toEqual(["risk:200", "vendor_risk:20"]);
    expect(shown.edges).toHaveLength(1);
  });

  it("pulls in a vendor risk related to one of the vendor's, but not its children", () => {
    const related: RiskGraph = {
      ...graph,
      edges: [...graph.edges, edge("vendor_risk:11", "vendor_risk:20", "related_to")],
    };

    const shown = vendorSubgraph(related, acme.id);

    expect(shown.nodes.map((n) => n.key)).toContain("vendor_risk:20");
    expect(shown.nodes.map((n) => n.key)).not.toContain("risk:200");
    expect(shown.edges.map((e) => `${e.sourceKey}>${e.targetKey}`)).toContain(
      "vendor_risk:11>vendor_risk:20",
    );
    // The same pair, seen from the other vendor.
    expect(
      vendorSubgraph(related, zeta.id)
        .nodes.map((n) => n.key)
        .sort(),
    ).toEqual(["risk:200", "vendor_risk:11", "vendor_risk:20"].sort());
  });

  it("is empty for a vendor with nothing on the map, and keeps the truncated flag", () => {
    const shown = vendorSubgraph({ ...graph, truncated: true }, 99);

    expect(shown.nodes).toEqual([]);
    expect(shown.edges).toEqual([]);
    expect(shown.truncated).toBe(true);
  });
});
