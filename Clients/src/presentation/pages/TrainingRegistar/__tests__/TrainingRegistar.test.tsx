import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock HelperIcon to avoid UserGuideSidebarProvider dependency
vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
}));

// Mock repository functions
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
  deleteEntityById: vi.fn(),
  getEntityById: vi.fn(),
  updateEntityById: vi.fn(),
}));

vi.mock("../../../../application/repository/trainingregistar.repository", () => ({
  createTraining: vi.fn(),
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
      "training_name",
      "duration",
      "provider",
      "department",
      "status",
      "numberOfPeople",
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

vi.mock("../trainingTable", () => ({
  default: () => <div data-testid="training-table" />,
}));

vi.mock("../../../components/Modals/NewTraining", () => ({
  default: () => null,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../TrainingSteps", () => ({
  default: [],
}));

import Training from "../index";

describe("TrainingRegistar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Training />, { route: "/training" });
    expect(screen.getByText("AI Training Registry")).toBeInTheDocument();
  });

  it("renders page description", () => {
    renderWithProviders(<Training />, { route: "/training" });
    expect(
      screen.getByText(/This registry lists all AI-related training programs/),
    ).toBeInTheDocument();
  });

  it("renders New training button", () => {
    renderWithProviders(<Training />, { route: "/training" });
    expect(screen.getByText("New training")).toBeInTheDocument();
  });

  it("renders search box", () => {
    renderWithProviders(<Training />, { route: "/training" });
    expect(screen.getByPlaceholderText("Search trainings...")).toBeInTheDocument();
  });
});
