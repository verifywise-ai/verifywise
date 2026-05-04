import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks used by Vendors page
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

vi.mock("../../../../application/hooks/useVendors", () => ({
  useVendors: () => ({
    data: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useDeleteVendor: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../../application/hooks/useVendorRisks", () => ({
  default: () => ({
    vendorRisksSummary: {
      total: 0,
      veryHighRisks: 0,
      highRisks: 0,
      mediumRisks: 0,
      lowRisks: 0,
      veryLowRisks: 0,
    },
    refetchVendorRisks: vi.fn(),
    vendorRisks: [],
    loadingVendorRisks: false,
  }),
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));

vi.mock("../../../../application/hooks/useVendorRiskMutations", () => ({
  useDeleteVendorRisk: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }],
    allVisible: false,
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
  useColumnVisibility: ({ columns }: { columns: { key: string }[] }) => ({
    visibleColumns: new Set(columns.map((c: { key: string }) => c.key)),
    allColumns: columns,
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
}));

vi.mock("../../../../application/tools/extractToken", () => ({
  extractUserToken: () => ({ roleName: "Admin" }),
}));

vi.mock("../../../../application/repository/vendor.repository", () => ({
  getVendorById: vi.fn(),
}));

vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getVendorRiskById: vi.fn(),
}));

// Mock complex child components
vi.mock("../../../components/Modals/NewVendor", () => ({
  default: () => <div data-testid="add-new-vendor-modal" />,
}));

vi.mock("../../../components/Modals/NewRisk", () => ({
  default: () => <div data-testid="add-new-risk-modal" />,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../../../components/Table/WithPlaceholder/index", () => ({
  default: () => <div data-testid="vendor-table" />,
}));

vi.mock("../../../components/Table/RisksTable", () => ({
  default: () => <div data-testid="risk-table" />,
}));

vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: ({ ungroupedData, renderTable }: any) => (
    <div data-testid="grouped-table-view">{renderTable(ungroupedData, {})}</div>
  ),
}));

vi.mock("../../../components/Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));

vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));

vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
  FilterColumn: {},
  FilterCondition: {},
}));

vi.mock("../VendorsSteps", () => ({
  default: [],
}));

vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
  HelperIcon: () => null,
}));

import Vendors from "../index";

describe("Vendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<Vendors />, {
      route: "/vendors",
    });
    expect(container).toBeTruthy();
  });
});
