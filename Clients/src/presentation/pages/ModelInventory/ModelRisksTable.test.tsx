import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import ModelRisksTable from "./ModelRisksTable";
import {
  ModelRiskCategory,
  ModelRiskLevel,
  ModelRiskStatus,
} from "../../../domain/interfaces/i.modelRisk";
import type { IModelRisk } from "../../../domain/interfaces/i.modelRisk";
import type { IModelInventory } from "../../../domain/interfaces/i.modelInventory";
import type { User } from "../../../domain/types/User";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";

vi.mock("../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({ data: [] }),
}));

const users: User[] = [{ id: 1, name: "Jane", surname: "Doe" } as User];

const models: IModelInventory[] = [
  {
    id: 1,
    provider: "OpenAI",
    model: "GPT-4",
    version: "1.0",
    capabilities: [],
    security_assessment: true,
    status: ModelInventoryStatus.APPROVED,
    status_date: new Date("2026-01-01"),
    projects: [],
    frameworks: [],
  },
];

const risks: IModelRisk[] = [
  {
    id: 1,
    risk_name: "Bias in scoring",
    risk_category: ModelRiskCategory.BIAS,
    risk_level: ModelRiskLevel.HIGH,
    status: ModelRiskStatus.OPEN,
    owner: "1",
    target_date: "2026-09-01",
    model_id: 1,
  },
  {
    id: 2,
    risk_name: "Drift",
    risk_category: ModelRiskCategory.PERFORMANCE,
    risk_level: ModelRiskLevel.LOW,
    status: ModelRiskStatus.RESOLVED,
    owner: "1",
    target_date: "2026-08-01",
    model_id: null,
  },
];

describe("ModelRisksTable", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("shows a skeleton while loading", () => {
    const { container } = renderWithProviders(
      <ModelRisksTable data={[]} isLoading onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(container.querySelector(".MuiSkeleton-root")).toBeTruthy();
  });

  it("shows an empty state when there is no data", () => {
    renderWithProviders(
      <ModelRisksTable data={[]} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(
      screen.getByText("There are currently no model risks in this table."),
    ).toBeInTheDocument();
  });

  it("renders risk rows with resolved names for owner and model", () => {
    renderWithProviders(
      <ModelRisksTable
        data={risks}
        isLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        users={users}
        models={models}
      />,
    );

    expect(screen.getByText("Bias in scoring")).toBeInTheDocument();
    expect(screen.getByText("GPT-4")).toBeInTheDocument();
    expect(screen.getAllByText("Jane Doe").length).toBe(2);
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("shows 'Unknown' for an owner id that doesn't match any user", () => {
    renderWithProviders(
      <ModelRisksTable
        data={[{ ...risks[0], owner: "999" }]}
        isLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        users={users}
        models={models}
      />,
    );
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("calls onEdit when a row is clicked", () => {
    const onEdit = vi.fn();
    renderWithProviders(
      <ModelRisksTable
        data={risks}
        isLoading={false}
        onEdit={onEdit}
        onDelete={vi.fn()}
        users={users}
        models={models}
      />,
    );

    fireEvent.click(screen.getByText("Bias in scoring"));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it("sorts by risk name when the column header is clicked", () => {
    renderWithProviders(
      <ModelRisksTable
        data={risks}
        isLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        users={users}
        models={models}
      />,
    );

    fireEvent.click(screen.getByText("risk name"));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Bias in scoring");
  });

  it("hides pagination and the actions column when configured", () => {
    renderWithProviders(
      <ModelRisksTable
        data={risks}
        isLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        users={users}
        models={models}
        hidePagination
        visibleColumns={new Set(["risk_name", "status"])}
      />,
    );
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.queryByText("owner")).not.toBeInTheDocument();
  });
});
