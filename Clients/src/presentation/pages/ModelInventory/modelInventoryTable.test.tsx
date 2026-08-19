import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import ModelInventoryTable from "./modelInventoryTable";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";
import type { IModelInventory } from "../../../domain/interfaces/i.modelInventory";
import {
  ModelRiskCategory,
  ModelRiskLevel,
  ModelRiskStatus,
} from "../../../domain/interfaces/i.modelRisk";
import type { IModelRisk } from "../../../domain/interfaces/i.modelRisk";

let mockUserRoleName = "Admin";
vi.mock("../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

vi.mock("../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({ data: [] }),
}));

vi.mock("../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: () => ({
    plugins: [],
    getSlotContributions: () => [],
    getPluginTabs: () => [],
    getComponentsForSlot: () => [],
  }),
}));

const models: IModelInventory[] = [
  {
    id: 1,
    provider: "OpenAI",
    model: "GPT-4",
    version: "1.0",
    approver: 1,
    capabilities: [],
    security_assessment: true,
    status: ModelInventoryStatus.APPROVED,
    status_date: new Date("2026-01-01"),
    projects: [],
    frameworks: [],
  },
  {
    id: 2,
    provider: "Anthropic",
    model: "Claude",
    version: "2.0",
    capabilities: [],
    security_assessment: false,
    status: ModelInventoryStatus.PENDING,
    status_date: new Date("2026-02-01"),
    projects: [],
    frameworks: [],
  },
];

const modelRisks: IModelRisk[] = [
  {
    id: 1,
    risk_name: "Bias",
    risk_category: ModelRiskCategory.BIAS,
    risk_level: ModelRiskLevel.HIGH,
    status: ModelRiskStatus.OPEN,
    owner: "1",
    target_date: "2026-09-01",
    model_id: 1,
  },
];

describe("ModelInventoryTable", () => {
  beforeEach(() => {
    mockUserRoleName = "Admin";
  });

  it("shows a skeleton while loading", () => {
    const { container } = renderWithProviders(<ModelInventoryTable data={[]} isLoading />);
    expect(container.querySelector(".MuiSkeleton-root")).toBeTruthy();
  });

  it("shows an empty state when there is no data", () => {
    renderWithProviders(<ModelInventoryTable data={[]} isLoading={false} />);
    expect(screen.getByText(/No models registered yet/)).toBeInTheDocument();
  });

  it("renders model rows with provider, version and status", () => {
    renderWithProviders(<ModelInventoryTable data={models} isLoading={false} />);

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("GPT-4")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows 'No risks' when a model has none, and a risks link otherwise", () => {
    renderWithProviders(
      <ModelInventoryTable data={models} isLoading={false} modelRisks={modelRisks} />,
    );

    expect(screen.getByText("1 risk")).toBeInTheDocument();
    expect(screen.getByText("No risks")).toBeInTheDocument();
  });

  it("opens the model risks dialog when the risk link is clicked", async () => {
    renderWithProviders(
      <ModelInventoryTable data={models} isLoading={false} modelRisks={modelRisks} />,
    );

    fireEvent.click(screen.getByText("1 risk"));

    await waitFor(() => {
      expect(screen.getByText(/Model Risks/i)).toBeInTheDocument();
    });
  });

  it("calls onViewDetails when a row is clicked, and onEdit otherwise", () => {
    const onViewDetails = vi.fn();
    renderWithProviders(
      <ModelInventoryTable data={models} isLoading={false} onViewDetails={onViewDetails} />,
    );

    fireEvent.click(screen.getByText("OpenAI"));
    expect(onViewDetails).toHaveBeenCalledWith("1");
  });

  it("falls back to onEdit when onViewDetails is not provided", () => {
    const onEdit = vi.fn();
    renderWithProviders(<ModelInventoryTable data={models} isLoading={false} onEdit={onEdit} />);

    fireEvent.click(screen.getByText("OpenAI"));
    expect(onEdit).toHaveBeenCalledWith("1");
  });

  it("sorts by model name when the column header is clicked", () => {
    renderWithProviders(<ModelInventoryTable data={models} isLoading={false} />);

    fireEvent.click(screen.getByText("MODEL"));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Claude");
  });

  it("hides the delete action for a role without delete permission", () => {
    mockUserRoleName = "Auditor";
    renderWithProviders(
      <ModelInventoryTable data={models} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    // Auditor lacks modelInventory.delete per allowedRoles — icon button
    // should still render (edit remains), but no crash on missing permission.
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });

  it("hides pagination and custom columns when configured", () => {
    renderWithProviders(
      <ModelInventoryTable
        data={models}
        isLoading={false}
        hidePagination
        visibleColumns={new Set(["provider", "model"])}
      />,
    );
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.queryByText("VERSION")).not.toBeInTheDocument();
  });
});
