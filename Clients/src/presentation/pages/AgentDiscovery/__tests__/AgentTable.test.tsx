import { screen, within } from "@testing-library/react";
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

const renderTable = (agents: AgentPrimitiveRow[]) =>
  renderWithProviders(
    <AgentTable
      agents={agents}
      isLoading={false}
      onRowClick={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
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
});
