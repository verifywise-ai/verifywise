/**
 * A status chip filters the model inventory table down to the matching rows.
 * Real useFilterBy and TableFilter (phase 1 chips).
 */
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
vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
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

const baseModel = {
  version: "1.0",
  capabilities: [],
  security_assessment: true,
  status_date: "2026-01-01T00:00:00Z",
  projects: [],
  frameworks: [],
};

const models = [
  {
    ...baseModel,
    id: 1,
    provider: "OpenAI",
    model: "GPT-4",
    status: ModelInventoryStatus.APPROVED,
  },
  {
    ...baseModel,
    id: 2,
    provider: "OpenAI",
    model: "GPT-4o",
    status: ModelInventoryStatus.PENDING,
  },
  {
    ...baseModel,
    id: 3,
    provider: "Anthropic",
    model: "Claude",
    status: ModelInventoryStatus.APPROVED,
  },
];

describe("ModelInventory filter chips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) =>
      Promise.resolve({ data: routeUrl === "/modelInventory" ? models : [] }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only the rows the status chip lets through", async () => {
    renderWithProviders(<ModelInventory />);
    await waitFor(() => expect(screen.getByText("GPT-4o")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("filter-chip-status"));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByTestId(`filter-chip-option-status-${ModelInventoryStatus.APPROVED}`),
    ).toHaveTextContent(/^Approved\s*2$/);
    fireEvent.click(
      within(menu).getByTestId(`filter-chip-option-status-${ModelInventoryStatus.APPROVED}`),
    );

    await waitFor(() => expect(screen.queryByText("GPT-4o")).not.toBeInTheDocument());
    expect(screen.getByTestId("filter-chip-status")).toHaveTextContent("Status: Approved");

    const table = screen.getByTestId("model-inventory-table");
    const rows = within(table)
      .getAllByText(/GPT|Claude/)
      .map((n) => n.textContent);
    expect(rows.sort()).toEqual(["Claude", "GPT-4"]);
  });
});
