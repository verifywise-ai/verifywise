import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock HelperIcon to avoid UserGuideSidebarProvider dependency
vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
}));

// Mock SVG import
vi.mock("../../../assets/icons/plus-circle-white.svg", () => ({
  ReactComponent: () => <svg data-testid="add-icon" />,
}));

// Mock repository functions
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
  archiveIncidentById: vi.fn(),
  getEntityById: vi.fn(),
  updateEntityById: vi.fn(),
}));

vi.mock("../../../../application/repository/incident_management.repository", () => ({
  createIncidentManagement: vi.fn(),
}));

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    userToken: { name: "Test User" },
  }),
}));

vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({
    filterData: (data: unknown[]) => data,
    handleFilterChange: vi.fn(),
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

vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => ({
    visibleColumns: new Set([
      "incident_id",
      "ai_project",
      "type",
      "severity",
      "status",
      "occurred_date",
      "approved_by",
      "actions",
    ]),
    allColumns: [],
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
}));

vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

// Mock child components
vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: ({ ungroupedData, renderTable }: any) => (
    <div data-testid="grouped-table-view">{renderTable(ungroupedData || [])}</div>
  ),
}));

vi.mock("../../../components/Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));

vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
}));

vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));

vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../IncidentTable", () => ({
  default: () => <div data-testid="incident-table" />,
}));

vi.mock("../../../components/Modals/NewIncident", () => ({
  default: () => null,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../IncidentManagementSteps", () => ({
  default: [],
}));

vi.mock("../../../components/Cards/StatusTileCards", () => ({
  StatusTileCards: () => <div data-testid="status-tile-cards" />,
}));

import IncidentManagement from "../index";

describe("IncidentManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<IncidentManagement />, { route: "/incidents" });
    expect(screen.getByText("Incident Management")).toBeInTheDocument();
  });

  it("renders page description", () => {
    renderWithProviders(<IncidentManagement />, { route: "/incidents" });
    expect(
      screen.getByText(/End-to-end management of the AI incident lifecycle/),
    ).toBeInTheDocument();
  });

  it("renders Add new incident button", () => {
    renderWithProviders(<IncidentManagement />, { route: "/incidents" });
    expect(screen.getByText("Add new incident")).toBeInTheDocument();
  });

  it("renders search box", () => {
    renderWithProviders(<IncidentManagement />, { route: "/incidents" });
    expect(screen.getByPlaceholderText("Search incidents...")).toBeInTheDocument();
  });
});
