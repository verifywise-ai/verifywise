/**
 * The vendor filter on the risk inheritance map: the Vendors page links here
 * with ?vendor=ID, and the select narrows the map to that vendor's part.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { RiskGraph } from "../../../../domain/interfaces/i.riskLink";

const mockGetRiskGraph = vi.fn();

vi.mock("../../../../application/repository/riskLink.repository", () => ({
  getRiskGraph: (...args: unknown[]) => mockGetRiskGraph(...args),
}));

vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));

// The report sections below the map have their own tests.
vi.mock("../DismissalAnalytics", () => ({ default: () => null }));
vi.mock("../DuplicateCandidates", () => ({ default: () => null }));
vi.mock("../ControlCoverage", () => ({ default: () => null }));

// jsdom has no layout engine, so the canvas is replaced by a stand-in that
// lists node names and renders the panels. Everything the page itself draws
// (legend, stats, key, banners, sections) is real.
vi.mock("@xyflow/react", async () => {
  const react = await import("react");
  const h = react.createElement;
  const useList = (initial: unknown[]) => {
    const [list, setList] = react.useState(initial);
    return [list, setList, () => undefined];
  };
  return {
    ReactFlow: ({
      nodes,
      children,
    }: {
      nodes: { id: string; data: { name: string } }[];
      children: React.ReactNode;
    }) =>
      h(
        "div",
        null,
        nodes.map((node) => h("span", { key: node.id }, node.data.name)),
        children,
      ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      h(react.Fragment, null, children),
    Panel: ({ children }: { children: React.ReactNode }) => h("div", null, children),
    MiniMap: () => null,
    Controls: () => null,
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    MarkerType: { ArrowClosed: "arrowclosed" },
    Handle: () => null,
    Position: { Top: "top", Bottom: "bottom" },
    useNodesState: useList,
    useEdgesState: useList,
  };
});

import RiskInheritanceGraph from "..";

const graph: RiskGraph = {
  nodes: [
    {
      key: "vendor_risk:1",
      entityType: "vendor_risk",
      id: 1,
      name: "Acme outage",
      riskLevel: null,
      vendor: { id: 10, name: "Acme Cloud" },
    },
    {
      key: "vendor_risk:2",
      entityType: "vendor_risk",
      id: 2,
      name: "Zeta leak",
      riskLevel: null,
      vendor: { id: 11, name: "Zeta Labs" },
    },
    { key: "risk:5", entityType: "risk", id: 5, name: "Loan approvals stop", riskLevel: null },
    { key: "risk:6", entityType: "risk", id: 6, name: "Chat logs exposed", riskLevel: null },
  ],
  edges: [
    {
      id: 1,
      sourceKey: "risk:5",
      targetKey: "vendor_risk:1",
      relationType: "inherits_from",
      status: "confirmed",
      score: 0,
      parentLevelChangedAt: null,
    },
    {
      id: 2,
      sourceKey: "risk:6",
      targetKey: "vendor_risk:2",
      relationType: "inherits_from",
      status: "confirmed",
      score: 0,
      parentLevelChangedAt: null,
    },
  ],
  truncated: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRiskGraph.mockResolvedValue(graph);
});

describe("risk inheritance map, vendor filter", () => {
  it("shows the whole map with every vendor on offer", async () => {
    renderWithProviders(<RiskInheritanceGraph />, { route: "/risk-inheritance" });

    expect(await screen.findByText("Loan approvals stop")).toBeInTheDocument();
    expect(screen.getByText("Chat logs exposed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Vendor" }));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      "All vendors",
      "Acme Cloud",
      "Zeta Labs",
    ]);
  });

  it("opens on the vendor named in the link from the Vendors page", async () => {
    renderWithProviders(<RiskInheritanceGraph />, { route: "/risk-inheritance?vendor=10" });

    expect(await screen.findByText("Loan approvals stop")).toBeInTheDocument();
    expect(screen.getByText("Acme outage")).toBeInTheDocument();
    expect(screen.queryByText("Chat logs exposed")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveTextContent("Acme Cloud");
  });

  it("switches vendor, and back to the whole map", async () => {
    renderWithProviders(<RiskInheritanceGraph />, { route: "/risk-inheritance?vendor=10" });
    await screen.findByText("Loan approvals stop");

    await userEvent.click(screen.getByRole("combobox", { name: "Vendor" }));
    await userEvent.click(screen.getByRole("option", { name: "Zeta Labs" }));
    expect(await screen.findByText("Chat logs exposed")).toBeInTheDocument();
    expect(screen.queryByText("Loan approvals stop")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Vendor" }));
    await userEvent.click(screen.getByRole("option", { name: "All vendors" }));
    expect(await screen.findByText("Loan approvals stop")).toBeInTheDocument();
    expect(screen.getByText("Chat logs exposed")).toBeInTheDocument();
  });

  it("says so for a vendor with nothing on the map, and offers the whole map", async () => {
    renderWithProviders(<RiskInheritanceGraph />, { route: "/risk-inheritance?vendor=99" });

    expect(await screen.findByText("This vendor has no risks on the map yet.")).toBeInTheDocument();
    // The select still names what is filtered rather than going blank.
    expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveTextContent("Vendor 99");

    await userEvent.click(screen.getByRole("button", { name: "Show all vendors" }));
    expect(await screen.findByText("Loan approvals stop")).toBeInTheDocument();
  });

  it("offers no vendor filter when no vendor risk is on the map", async () => {
    mockGetRiskGraph.mockResolvedValue({
      nodes: [graph.nodes[2], graph.nodes[3]],
      edges: [{ ...graph.edges[0], targetKey: "risk:6", relationType: "related_to" }],
      truncated: false,
    });
    renderWithProviders(<RiskInheritanceGraph />, { route: "/risk-inheritance" });

    expect(await screen.findByText("Loan approvals stop")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Vendor" })).not.toBeInTheDocument();
  });
});
