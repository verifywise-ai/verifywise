import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Test User" },
    userId: 1,
    userRoleName: "Admin",
  }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [],
    loading: false,
  }),
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

vi.mock("../../../../application/hooks/useEntityChangeHistory", () => ({
  useEntityChangeHistory: () => ({
    history: [],
    loading: false,
  }),
}));

// Mock repositories
vi.mock("../../../../application/repository/entity.repository", () => ({
  deleteEntityById: vi.fn().mockResolvedValue({ status: 200 }),
  getEntityById: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: vi.fn().mockResolvedValue({ data: [] }),
}));

// Mock tools
vi.mock("../../../../application/tools/alertUtils", () => ({
  handleAlert: vi.fn(),
}));

// Mock events
vi.mock("../../../../application/events/aiActionEvents", () => ({
  onAiActionCompleted: () => () => {},
}));

// Mock infrastructure
vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {},
}));

// Mock constants
vi.mock("../../../../application/constants/permissions", () => ({
  default: {
    projectRisks: {
      create: ["Admin", "Editor"],
      update: ["Admin", "Editor"],
      delete: ["Admin"],
    },
  },
}));

// Mock child components
vi.mock("../../../components/Table/VWProjectRisksTable", () => ({
  default: () => <div data-testid="project-risks-table" />,
}));

vi.mock("../../../components/Search/SearchBox", () => ({
  default: () => <div data-testid="search-box" />,
}));

vi.mock("../../../components/AddNewRiskForm", () => ({
  default: () => <div data-testid="add-new-risk-form" />,
}));

vi.mock("../../../components/Modals/StandardModal", () => ({
  default: ({ children }: any) => <div data-testid="standard-modal">{children}</div>,
}));

vi.mock("../../../components/Alert", () => ({
  default: () => <div data-testid="alert" />,
}));

vi.mock("../../../components/Toast", () => ({
  default: () => <div data-testid="toast" />,
}));

vi.mock("../../../components/Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock("../../../components/AddNewRiskMITForm", () => ({
  default: () => <div data-testid="add-new-risk-mit" />,
}));

vi.mock("../../../components/AddNewRiskIBMForm", () => ({
  default: () => <div data-testid="add-new-risk-ibm" />,
}));

vi.mock("../../../components/AnalyticsDrawer", () => ({
  default: () => <div data-testid="analytics-drawer" />,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../../../components/PluginSlot", () => ({
  PluginSlot: () => null,
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header-extended">
      <span>{title}</span>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/Cards/StatusTileCards", () => ({
  StatusTileCards: () => <div data-testid="status-tile-cards" />,
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
  FilterCondition: {},
}));

vi.mock("../../../components/Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));

vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: () => <div data-testid="customizable-button" />,
}));

import RiskManagement from "../index";

describe("RiskManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<RiskManagement />);
    expect(container).toBeTruthy();
  });
});
