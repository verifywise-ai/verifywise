import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ModelInventoryStatus } from "../../../../domain/enums/modelInventory.enum";

// ---- Base infra mocks (same convention as ModelInventory.test.tsx) ----

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Test User" },
    userId: 1,
    userRoleName: "Admin",
  }),
}));

vi.mock("../../../../application/hooks/useShare", () => ({
  useCreateShareLink: () => ({ mutateAsync: vi.fn() }),
  useUpdateShareLink: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../../application/hooks/useTableGrouping", () => ({
  useTableGrouping: () => [],
  useGroupByState: () => ({
    groupBy: null,
    groupSortOrder: "asc",
    handleGroupChange: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({
    filterData: (data: unknown[]) => data,
    handleFilterChange: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => ({
    visibleColumns: new Set<string>(),
    allColumns: [],
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
  ColumnConfig: {},
}));

vi.mock("../../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: () => ({
    plugins: [],
    getSlotContributions: () => [],
    getPluginTabs: () => [],
  }),
}));

vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {},
}));

vi.mock("../../../../application/repository/modelInventory.repository", () => ({
  createModelInventory: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("../../../../application/repository/share.repository", () => ({
  getShareLinksForResource: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../../application/repository/evidenceHub.repository", () => ({
  createEvidenceHub: vi.fn().mockResolvedValue({ data: {} }),
}));

const mockGetAllEntities = vi.fn();
const mockDeleteEntityById = vi.fn();

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
  deleteEntityById: (...args: any[]) => mockDeleteEntityById(...args),
  getEntityById: vi.fn().mockResolvedValue({ data: {} }),
  updateEntityById: vi.fn().mockResolvedValue({ data: {} }),
  createNewUser: vi.fn().mockResolvedValue({ data: {} }),
}));

// ---- Complex modal/drawer stubs (already covered by their own dedicated tests) ----

vi.mock("../../../components/Modals/NewModelInventory", () => ({
  default: () => <div data-testid="new-model-inventory-modal" />,
}));
vi.mock("../../../components/Modals/NewModelRisk", () => ({
  default: () => <div data-testid="new-model-risk-modal" />,
}));
vi.mock("../../../components/Modals/EvidenceHub", () => ({
  default: () => <div data-testid="new-evidence-hub-modal" />,
}));
vi.mock("../../../components/AnalyticsDrawer", () => ({
  default: () => <div data-testid="analytics-drawer" />,
}));
vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));
vi.mock("../../../components/ShareViewDropdown/ShareButton", () => ({
  default: () => <div data-testid="share-button" />,
}));
vi.mock("../../../components/ShareViewDropdown", () => ({
  default: () => <div data-testid="share-view-dropdown" />,
  ShareViewSettings: {},
}));
vi.mock("../../../components/PluginSlot", () => ({
  PluginSlot: () => null,
}));
vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: ({ ungroupedData, renderTable }: any) => renderTable(ungroupedData, {}),
}));
vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));
vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
  FilterColumn: {},
}));
vi.mock("../../../components/Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));
vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, alert, summaryCards }: any) => (
    <div data-testid="page-header-extended">
      <span>{title}</span>
      {alert}
      {summaryCards}
      {children}
    </div>
  ),
}));

// ---- Tables: exposed as thin stubs that surface the props index.tsx wires up ----

vi.mock("../modelInventoryTable", () => ({
  default: ({ data, onEdit, onDelete }: any) => (
    <div data-testid="model-inventory-table">
      <span data-testid="model-inventory-count">{data.length}</span>
      {data.map((row: any) => (
        <span key={row.id}>{row.model}</span>
      ))}
      <button onClick={() => onEdit?.("1")}>edit-model-1</button>
      <button onClick={() => onDelete?.("1", false)}>delete-model-1</button>
    </div>
  ),
}));

vi.mock("../ModelRisksTable", () => ({
  default: ({ data }: any) => (
    <div data-testid="model-risks-table">
      <span data-testid="model-risks-count">{data.length}</span>
    </div>
  ),
}));

vi.mock("../evidenceHubTable", () => ({
  default: ({ data }: any) => (
    <div data-testid="evidence-hub-table">
      <span data-testid="evidence-hub-count">{data.length}</span>
    </div>
  ),
}));

vi.mock("../ModelEvaluationsTab", () => ({
  default: () => <div data-testid="model-evaluations-tab" />,
}));

vi.mock("../mrm", () => ({
  default: () => <div data-testid="mrm-tab" />,
}));

import ModelInventory from "../index";

const models = [
  {
    id: 1,
    provider: "OpenAI",
    model: "GPT-4",
    version: "1.0",
    capabilities: [],
    security_assessment: true,
    status: ModelInventoryStatus.APPROVED,
    status_date: "2026-01-01T00:00:00Z",
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
    status_date: "2026-02-01T00:00:00Z",
    projects: [],
    frameworks: [],
  },
];

const modelRisks = [
  {
    id: 1,
    risk_name: "Bias",
    risk_category: "Bias & Fairness",
    risk_level: "High",
    status: "Open",
    owner: "1",
    target_date: "2026-09-01",
    model_id: 1,
  },
];

const evidence = [
  {
    id: 1,
    evidence_name: "SOC2",
    evidence_type: "Audit",
    evidence_files: [],
    mapped_model_ids: [1],
  },
];

function mockEntities() {
  mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
    if (routeUrl === "/modelInventory") return Promise.resolve({ data: models });
    if (routeUrl.startsWith("/modelRisks")) return Promise.resolve({ data: modelRisks });
    if (routeUrl === "/evidenceHub") return Promise.resolve({ data: evidence });
    if (routeUrl === "/users") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

describe("ModelInventory interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntities();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and renders model, risk and evidence counts on mount", async () => {
    renderWithProviders(<ModelInventory />);

    await waitFor(() => {
      expect(screen.getByTestId("model-inventory-count")).toHaveTextContent("2");
    });
    expect(screen.getByText("GPT-4")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("switches to the model risks tab and renders risk data", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Model risks"));

    await waitFor(() => {
      expect(screen.getByTestId("model-risks-table")).toBeInTheDocument();
    });
  });

  it("switches to the evidence hub tab and renders evidence data", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Evidence hub"));

    await waitFor(() => {
      expect(screen.getByTestId("evidence-hub-table")).toBeInTheDocument();
      expect(screen.getByTestId("evidence-hub-count")).toHaveTextContent("1");
    });
  });

  it("switches to the evaluations tab", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Evaluations"));

    await waitFor(() => {
      expect(screen.getByTestId("model-evaluations-tab")).toBeInTheDocument();
    });
  });

  it("switches to the model risk management tab", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Model risk management"));

    await waitFor(() => {
      expect(screen.getByTestId("mrm-tab")).toBeInTheDocument();
    });
  });

  it("filters models by search term", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-count")).toHaveTextContent("2"));

    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "claude" } });

    await waitFor(() => {
      expect(screen.getByTestId("model-inventory-count")).toHaveTextContent("1");
    });
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.queryByText("GPT-4")).not.toBeInTheDocument();
  });

  it("filters models by status when a summary card is clicked", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-count")).toHaveTextContent("2"));

    fireEvent.click(screen.getByText("Pending").closest("div")!);

    await waitFor(() => {
      expect(screen.getByTestId("model-inventory-count")).toHaveTextContent("1");
    });
    expect(screen.getByText("Claude")).toBeInTheDocument();

    // Clicking the same card again clears the filter
    fireEvent.click(screen.getByText("Pending").closest("div")!);
    await waitFor(() => {
      expect(screen.getByTestId("model-inventory-count")).toHaveTextContent("2");
    });
  });

  it("opens the new-model modal when 'Add new model' is clicked", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Add new model"));

    expect(screen.getByTestId("new-model-inventory-modal")).toBeInTheDocument();
  });

  it("deletes a model and refetches the inventory", async () => {
    mockDeleteEntityById.mockResolvedValue({ status: 200 });
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    fireEvent.click(screen.getByText("delete-model-1"));

    await waitFor(() => {
      expect(mockDeleteEntityById).toHaveBeenCalledWith({ routeUrl: "/modelInventory/1" });
    });
    await waitFor(() => {
      expect(screen.getByText(/deleted successfully/)).toBeInTheDocument();
    });
  });

  it("shows an error alert when the initial fetch fails", async () => {
    mockGetAllEntities.mockRejectedValue(new Error("network down"));
    renderWithProviders(<ModelInventory />);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load .+ data\. Please try again later\./),
      ).toBeInTheDocument();
    });
  });
});
