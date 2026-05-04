import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
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

// Mock repositories
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
  deleteEntityById: vi.fn().mockResolvedValue({ status: 200 }),
  getEntityById: vi.fn().mockResolvedValue({ data: {} }),
  updateEntityById: vi.fn().mockResolvedValue({ data: {} }),
  createNewUser: vi.fn().mockResolvedValue({ data: {} }),
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

// Mock tools
vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

// Mock infrastructure
vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {},
}));

// Mock child components that are complex
vi.mock("../modelInventoryTable", () => ({
  default: () => <div data-testid="model-inventory-table" />,
}));

vi.mock("../ModelRisksTable", () => ({
  default: () => <div data-testid="model-risks-table" />,
}));

vi.mock("../ModelInventorySummary", () => ({
  default: () => <div data-testid="model-inventory-summary" />,
}));

vi.mock("../ModelRiskSummary", () => ({
  default: () => <div data-testid="model-risk-summary" />,
}));

vi.mock("../evidenceHubTable", () => ({
  default: () => <div data-testid="evidence-hub-table" />,
}));

vi.mock("../ModelEvaluationsTab", () => ({
  default: () => <div data-testid="model-evaluations-tab" />,
}));

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
  GroupedTableView: () => <div data-testid="grouped-table-view" />,
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
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header-extended">
      <span>{title}</span>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/TabBar", () => ({
  default: ({ tabs }: any) => (
    <div data-testid="tab-bar">
      {tabs?.map((t: any, i: number) => (
        <span key={i}>{t.label}</span>
      ))}
    </div>
  ),
}));

import ModelInventory from "../index";

describe("ModelInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ModelInventory />);
    expect(container).toBeTruthy();
  });
});
