import { screen, waitFor, fireEvent, within } from "@testing-library/react";
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
// What the model table's "has risks?" check answered, per model id.
const riskChecks = vi.hoisted(() => [] as Array<[string, boolean]>);
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
vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: ({ data, filename }: any) => (
    <div data-testid={`export-menu-${filename}`}>{JSON.stringify(data)}</div>
  ),
}));
vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
  FilterColumn: {},
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
  default: ({ data, onEdit, onDelete, onCheckModelHasRisks }: any) => (
    <div data-testid="model-inventory-table">
      <span data-testid="model-inventory-count">{data.length}</span>
      {data.map((row: any) => (
        <span key={row.id}>{row.model}</span>
      ))}
      <button onClick={() => onEdit?.("1")}>edit-model-1</button>
      <button onClick={() => onDelete?.("1", false)}>delete-model-1</button>
      {["1", "2"].map((id) => (
        <button
          key={id}
          onClick={async () => riskChecks.push([id, await onCheckModelHasRisks(id)])}
        >
          check-risks-{id}
        </button>
      ))}
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
    riskChecks.length = 0;
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

  it("refetches the model risks after a delete that keeps them", async () => {
    mockDeleteEntityById.mockResolvedValue({ status: 200 });
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());
    const riskFetches = () =>
      mockGetAllEntities.mock.calls.filter(([arg]) =>
        String((arg as { routeUrl: string }).routeUrl).startsWith("/modelRisks"),
      ).length;
    await waitFor(() => expect(riskFetches()).toBeGreaterThan(0));
    const before = riskFetches();

    fireEvent.click(screen.getByText("delete-model-1"));

    await waitFor(() => {
      expect(mockDeleteEntityById).toHaveBeenCalledWith({ routeUrl: "/modelInventory/1" });
    });
    // The kept risks now have no model; the list must show that, not the
    // deleted model.
    await waitFor(() => expect(riskFetches()).toBeGreaterThan(before));
  });

  it("asks Keep or Delete only for a model with live risks, whatever the status filter", async () => {
    const live = { ...modelRisks[0], id: 1, model_id: 1, is_deleted: false };
    const archived = { ...modelRisks[0], id: 2, model_id: 2, is_deleted: true };
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
      if (routeUrl === "/modelInventory") return Promise.resolve({ data: models });
      if (routeUrl === "/modelRisks?filter=active") return Promise.resolve({ data: [live] });
      if (routeUrl === "/modelRisks?filter=deleted") return Promise.resolve({ data: [archived] });
      if (routeUrl === "/modelRisks?filter=all") return Promise.resolve({ data: [live, archived] });
      return Promise.resolve({ data: [] });
    });
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    // Show only deleted model risks.
    fireEvent.click(screen.getByText("Model risks"));
    const statusFilter = await screen.findByText("Active only");
    fireEvent.mouseDown(statusFilter.closest('[role="combobox"]') ?? statusFilter);
    fireEvent.click(await screen.findByRole("option", { name: "Deleted only" }));
    await waitFor(() =>
      expect(mockGetAllEntities).toHaveBeenCalledWith({ routeUrl: "/modelRisks?filter=deleted" }),
    );

    fireEvent.click(screen.getByText("Models"));
    fireEvent.click(await screen.findByText("check-risks-1"));
    fireEvent.click(screen.getByText("check-risks-2"));
    await waitFor(() => expect(riskChecks).toHaveLength(2));
    expect(Object.fromEntries(riskChecks)).toEqual({ "1": true, "2": false });
  });

  it("under Active only, asks the server, not the loaded (stale) list", async () => {
    const live = { ...modelRisks[0], id: 1, model_id: 1, is_deleted: false };
    // Loaded before the risk was added: the page's list has no risk.
    let serverRisks: unknown[] = [];
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
      if (routeUrl === "/modelInventory") return Promise.resolve({ data: models });
      if (routeUrl === "/modelRisks?filter=active") return Promise.resolve({ data: serverRisks });
      return Promise.resolve({ data: [] });
    });
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());
    await waitFor(() =>
      expect(mockGetAllEntities).toHaveBeenCalledWith({ routeUrl: "/modelRisks?filter=active" }),
    );

    serverRisks = [live];
    fireEvent.click(await screen.findByText("check-risks-1"));
    await waitFor(() => expect(riskChecks).toHaveLength(1));
    expect(riskChecks).toEqual([["1", true]]);
  });

  it("asks Keep or Delete when the live risks cannot be fetched", async () => {
    let failRiskFetch = false;
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
      if (routeUrl === "/modelInventory") return Promise.resolve({ data: models });
      if (routeUrl.startsWith("/modelRisks"))
        return failRiskFetch
          ? Promise.reject(new Error("network down"))
          : Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    failRiskFetch = true;
    fireEvent.click(await screen.findByText("check-risks-1"));
    await waitFor(() => expect(riskChecks).toHaveLength(1));
    expect(riskChecks).toEqual([["1", true]]);
  });

  it("exports a risk whose model is not loaded as Unknown, like the table", async () => {
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
      if (routeUrl === "/modelInventory") return Promise.resolve({ data: models });
      if (routeUrl.startsWith("/modelRisks"))
        return Promise.resolve({ data: [{ ...modelRisks[0], model_id: 999 }] });
      return Promise.resolve({ data: [] });
    });
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Model risks"));

    await waitFor(() =>
      expect(screen.getByTestId("export-menu-model-risks")).toHaveTextContent(
        '"model_name":"Unknown"',
      ),
    );
  });

  it("exports a risk with no model as No model, like the table", async () => {
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
      if (routeUrl === "/modelInventory") return Promise.resolve({ data: models });
      if (routeUrl.startsWith("/modelRisks"))
        return Promise.resolve({ data: [{ ...modelRisks[0], model_id: null }] });
      return Promise.resolve({ data: [] });
    });
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByTestId("model-inventory-table")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Model risks"));

    await waitFor(() =>
      expect(screen.getByTestId("export-menu-model-risks")).toHaveTextContent(
        '"model_name":"No model"',
      ),
    );
  });

  it("shows an error alert when the initial fetch fails", async () => {
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) =>
      routeUrl === "/modelInventory"
        ? Promise.reject(new Error("network down"))
        : Promise.resolve({ data: [] }),
    );
    renderWithProviders(<ModelInventory />);

    const wrapper = await screen.findByTestId("list-state-wrapper");
    expect(within(wrapper).getByRole("alert")).toHaveTextContent(
      "Failed to load model inventory data. Please try again later.",
    );
  });
});
