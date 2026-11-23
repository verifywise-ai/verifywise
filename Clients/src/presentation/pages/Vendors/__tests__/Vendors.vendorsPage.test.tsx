import { act, screen } from "@testing-library/react";
import type { FilterColumn, FilterCondition } from "../../../components/Table/FilterBy";
import type { FilterFieldValue } from "../../../../application/utils/filterConditions";
import { BusinessCriticality, DataSensitivity } from "../../../../domain/enums/status.enum";
import { renderWithProviders } from "../../../../test/renderWithProviders";

let mockVendorsLoading = false;
let mockVendorsError: Error | null = null;
let mockVendorsData: Array<Record<string, unknown>> = [];
const mockUseVendors = vi.fn();
const mockUseVendorRisks = vi.fn();

interface CapturedFilter {
  columns: FilterColumn[];
  onFilterChange: (conditions: FilterCondition[], logic: "and" | "or") => void;
  getFieldValue: (item: any, fieldId: string) => FilterFieldValue;
}
let mockTableFilters: CapturedFilter[] = [];
const mockDeleteVendor = vi.fn();
const mockDeleteVendorRisk = vi.fn();
let mockVendorTableOnDelete: ((id: number) => Promise<void>) | undefined;
let mockRiskTableOnDelete: ((id: number) => Promise<void>) | undefined;

// Mock hooks used by Vendors page
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

vi.mock("../../../../application/hooks/useVendors", () => ({
  useVendors: (...args: unknown[]) => {
    mockUseVendors(...args);
    return {
      data: mockVendorsData,
      isLoading: mockVendorsLoading,
      error: mockVendorsError,
      refetch: vi.fn(),
    };
  },
  useDeleteVendor: () => ({ mutateAsync: mockDeleteVendor }),
}));

vi.mock("../../../../application/hooks/useVendorRisks", () => ({
  default: (...args: unknown[]) => (
    mockUseVendorRisks(...args),
    {
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
    }
  ),
}));

vi.mock("../../../components/Table/TableFilter", () => ({
  TableFilter: (props: CapturedFilter) => {
    mockTableFilters.push(props);
    return <div data-testid="table-filter" />;
  },
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));

vi.mock("../../../../application/hooks/useVendorRiskMutations", () => ({
  useDeleteVendorRisk: () => ({ mutateAsync: mockDeleteVendorRisk }),
  useRestoreVendorRisk: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }],
    allVisible: false,
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
  default: (props: { onDelete?: (id: number) => Promise<void> }) => {
    mockVendorTableOnDelete = props.onDelete;
    return <div data-testid="vendor-table" />;
  },
}));

vi.mock("../../../components/Table/RisksTable", () => ({
  default: (props: { onDelete?: (id: number) => Promise<void> }) => {
    mockRiskTableOnDelete = props.onDelete;
    return <div data-testid="risk-table" />;
  },
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
    mockVendorsLoading = false;
    mockVendorsError = null;
    mockVendorsData = [];
    mockTableFilters = [];
  });

  const lastFilter = () => mockTableFilters[mockTableFilters.length - 1];
  const optionValues = (filter: CapturedFilter, id: string) =>
    filter.columns.find((column) => column.id === id)?.options?.map((o) => o.value);

  it("offers vendor filter options that equal the stored scorecard values", () => {
    renderWithProviders(<Vendors />, { route: "/vendors" });
    const filter = lastFilter();

    expect(optionValues(filter, "data_sensitivity")).toEqual(Object.values(DataSensitivity));
    expect(optionValues(filter, "business_criticality")).toEqual(
      Object.values(BusinessCriticality),
    );
    const stored = { data_sensitivity: DataSensitivity.PII };
    expect(optionValues(filter, "data_sensitivity")).toContain(
      filter.getFieldValue(stored, "data_sensitivity"),
    );
  });

  it("offers risk filter options that match stored severity and level", () => {
    renderWithProviders(<Vendors />, { route: "/vendors/risks" });
    const filter = lastFilter();

    expect(optionValues(filter, "risk_severity")).toEqual([
      "Negligible",
      "Minor",
      "Moderate",
      "Major",
      "Catastrophic",
    ]);
    expect(optionValues(filter, "risk_level")).toEqual([
      "Very high",
      "High",
      "Medium",
      "Low",
      "No risk",
    ]);
    const stored = { risk_severity: "Catastrophic", risk_level: "No risk" };
    expect(optionValues(filter, "risk_severity")).toContain(
      filter.getFieldValue(stored, "risk_severity"),
    );
    expect(optionValues(filter, "risk_level")).toContain(
      filter.getFieldValue(stored, "risk_level"),
    );
    // A risk belongs to every use case of its vendor.
    expect(filter.getFieldValue({ project_ids: [4, 7] }, "project_id")).toEqual(["4", "7"]);
  });

  it("keeps the Vendors tab's use case filter off the Risks tab", () => {
    renderWithProviders(<Vendors />, { route: "/vendors" });

    act(() => {
      lastFilter().onFilterChange(
        [{ id: "c1", columnId: "project_id", operator: "is", value: "5" }],
        "and",
      );
    });

    expect(mockUseVendors).toHaveBeenCalledWith({ projectId: "5" }, expect.anything());
    // The risks list stays unfiltered by use case.
    expect(mockUseVendorRisks).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "all", vendorId: "all" }),
    );
    expect(mockUseVendorRisks).not.toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "5" }),
    );
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<Vendors />, {
      route: "/vendors",
    });
    expect(container).toBeTruthy();
  });

  it("shows the standardized loading state", () => {
    mockVendorsLoading = true;
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(screen.getByRole("status", { name: "Loading vendors" })).toBeInTheDocument();
  });

  it("shows the standardized error alert when vendors fail to load", () => {
    mockVendorsError = new Error("network error");
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to load vendors. Please try again later.",
    );
    expect(screen.queryByTestId("vendor-table")).not.toBeInTheDocument();
  });

  it("asks for the vendor list without the global toast (the page shows the error inline)", () => {
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(mockUseVendors).toHaveBeenCalledWith(expect.anything(), {
      suppressGlobalErrorToast: true,
    });
  });

  it("keeps cached vendors on screen when a background refetch fails", () => {
    mockVendorsError = new Error("network error");
    mockVendorsData = [
      {
        id: 1,
        vendor_name: "Acme AI",
        vendor_provides: "Models",
        vendor_contact_person: "Jane Doe",
      },
    ];
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(screen.queryByText("Failed to load vendors. Please try again later.")).toBeNull();
    expect(screen.getByTestId("vendor-table")).toBeInTheDocument();
  });

  // VC-L1: a failed delete throws, so the 404 message used to be unreachable.
  it("says the vendor is gone when its delete answers 404", async () => {
    mockVendorsData = [{ id: 3, vendor_name: "Acme" }];
    mockDeleteVendor.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
    renderWithProviders(<Vendors />, { route: "/vendors" });

    await act(async () => {
      await mockVendorTableOnDelete?.(3);
    });

    expect(await screen.findByText("Vendor not found.")).toBeInTheDocument();
  });

  it("shows one failure message when a risk delete fails for another reason", async () => {
    mockDeleteVendorRisk.mockRejectedValue(Object.assign(new Error("Boom"), { status: 500 }));
    renderWithProviders(<Vendors />, { route: "/vendors/risks" });

    await act(async () => {
      await mockRiskTableOnDelete?.(8);
    });

    expect(
      await screen.findAllByText(
        "Failed to delete risk. It may have already been deleted or there was a network error.",
      ),
    ).toHaveLength(1);
    expect(screen.queryByText("Risk not found.")).toBeNull();
  });

  it("says the risk is gone when its delete answers 404", async () => {
    mockDeleteVendorRisk.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
    renderWithProviders(<Vendors />, { route: "/vendors/risks" });

    await act(async () => {
      await mockRiskTableOnDelete?.(8);
    });

    expect(await screen.findByText("Risk not found.")).toBeInTheDocument();
  });
});
