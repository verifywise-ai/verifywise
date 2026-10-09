import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AgentTable from "../AgentTable";
import { AgentPrimitiveRow } from "../../../../domain/interfaces/i.agentDiscovery";

vi.mock("../../../../application/contexts/Extensions.context", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useExtensions: () => ({ isEnabled: () => false }),
}));

const row = (overrides: Partial<AgentPrimitiveRow>): AgentPrimitiveRow => ({
  id: 1,
  source_system: "manual",
  primitive_type: "agent",
  external_id: "manual_1",
  display_name: "Agent",
  owner_id: null,
  permissions: [],
  permission_categories: [],
  last_activity: null,
  metadata: {},
  review_status: "unreviewed",
  reviewed_by: null,
  reviewed_at: null,
  linked_model_inventory_id: null,
  is_stale: false,
  is_manual: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...overrides,
});

const renderTable = (
  agents: AgentPrimitiveRow[],
  props: Partial<React.ComponentProps<typeof AgentTable>> = {},
) =>
  renderWithProviders(
    <AgentTable
      agents={agents}
      isLoading={false}
      onRowClick={vi.fn()}
      onReview={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  );

const rowFor = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("AgentTable status column", () => {
  it("shows the stored review status with the filter and stat card labels", () => {
    renderTable([
      row({ id: 1, display_name: "Pending bot", review_status: "unreviewed" }),
      row({ id: 2, display_name: "Approved bot", review_status: "confirmed" }),
      row({ id: 3, display_name: "Refused bot", review_status: "rejected" }),
    ]);

    expect(within(rowFor("Pending bot")).getByText("Unreviewed")).toBeInTheDocument();
    expect(within(rowFor("Approved bot")).getByText("Confirmed")).toBeInTheDocument();
    expect(within(rowFor("Refused bot")).getByText("Rejected")).toBeInTheDocument();
  });

  it("keeps staleness out of the status: a stale confirmed agent still reads Confirmed", () => {
    renderTable([row({ display_name: "Quiet bot", review_status: "confirmed", is_stale: true })]);

    const tr = rowFor("Quiet bot");
    expect(within(tr).getByText("Confirmed")).toBeInTheDocument();
    expect(within(tr).queryByText("Stale")).not.toBeInTheDocument();
    expect(within(tr).queryByText("Active")).not.toBeInTheDocument();
  });

  it("shows staleness as a warning icon in the status cell, with no Stale column", () => {
    renderTable([
      row({ id: 1, display_name: "Quiet bot", review_status: "confirmed", is_stale: true }),
      row({ id: 2, display_name: "Busy bot", review_status: "confirmed", is_stale: false }),
    ]);

    expect(screen.queryByRole("columnheader", { name: /stale/i })).not.toBeInTheDocument();
    const quietCells = within(rowFor("Quiet bot")).getAllByRole("cell");
    const statusCell = quietCells.find((c) => within(c).queryByText("Confirmed")) as HTMLElement;
    const indicator = within(statusCell).getByTestId("agent-stale-indicator");
    expect(indicator).toHaveAttribute(
      "aria-label",
      expect.stringContaining("no activity from this agent for 30+ days"),
    );
    expect(
      within(rowFor("Busy bot")).queryByTestId("agent-stale-indicator"),
    ).not.toBeInTheDocument();
  });
});

describe("AgentTable row actions", () => {
  const openMenu = (name: string) => {
    fireEvent.click(within(rowFor(name)).getByRole("button", { name: "Agent actions" }));
    return screen.getByRole("menu");
  };
  const itemNames = (menu: HTMLElement) =>
    within(menu)
      .getAllByRole("menuitem")
      .map((i) => i.textContent);

  it("offers Review, Edit and Delete on a manual agent to an admin", () => {
    const onReview = vi.fn();
    const onEdit = vi.fn();
    const agent = row({ display_name: "Hand bot", is_manual: true });
    renderTable([agent], { onReview, onEdit, canManage: true });

    const menu = openMenu("Hand bot");
    expect(itemNames(menu)).toEqual(["Review", "Edit", "Delete"]);

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(agent);
    expect(onReview).not.toHaveBeenCalled();
  });

  it("offers only Review for a synced agent, which cannot be edited", () => {
    const onReview = vi.fn();
    const agent = row({
      display_name: "Synced bot",
      is_manual: false,
      source_system: "azure-ai-foundry",
    });
    renderTable([agent], { onReview, canManage: true });

    const menu = openMenu("Synced bot");
    expect(itemNames(menu)).toEqual(["Review", "Delete"]);

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Review" }));
    expect(onReview).toHaveBeenCalledWith(agent);
  });

  it("offers only Review to a user who may not change agents", () => {
    renderTable([row({ display_name: "Hand bot", is_manual: true })]);
    expect(itemNames(openMenu("Hand bot"))).toEqual(["Review"]);
  });
});
