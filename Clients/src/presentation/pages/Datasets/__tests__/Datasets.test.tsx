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

vi.mock("../../../../application/repository/dataset.repository", () => ({
  createDataset: vi.fn(),
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

vi.mock("../../ModelInventory/DatasetSummary", () => ({
  default: () => <div data-testid="dataset-summary" />,
}));

vi.mock("../../ModelInventory/DatasetTable", () => ({
  default: () => <div data-testid="dataset-table" />,
}));

vi.mock("../../../components/Modals/NewDataset", () => ({
  default: () => null,
}));

vi.mock("../../../components/PluginSlot", () => ({
  PluginSlot: () => null,
}));

import Datasets from "../index";

describe("Datasets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Datasets />, { route: "/datasets" });
    expect(screen.getAllByText("Datasets").length).toBeGreaterThan(0);
  });

  it("renders page description", () => {
    renderWithProviders(<Datasets />, { route: "/datasets" });
    expect(screen.getByText(/Manage training and evaluation datasets/)).toBeInTheDocument();
  });

  it("renders Add new dataset button", () => {
    renderWithProviders(<Datasets />, { route: "/datasets" });
    expect(screen.getByText("Add new dataset")).toBeInTheDocument();
  });

  it("renders search box", () => {
    renderWithProviders(<Datasets />, { route: "/datasets" });
    expect(screen.getByPlaceholderText("Search datasets...")).toBeInTheDocument();
  });
});
