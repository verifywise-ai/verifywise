import { vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { VendorModel } from "../../../../../domain/models/Common/vendor/vendor.model";

const mockExportToCSV = vi.fn();

vi.mock("../../../../../application/utils/tableExport", () => ({
  exportToCSV: (...args: unknown[]) => mockExportToCSV(...args),
}));

const mockUseDoraRegister = vi.fn();
vi.mock("../../../../../application/hooks/useVendors", () => ({
  useDoraRegister: () => mockUseDoraRegister(),
}));

import DoraRegister from "../index";

// Two vendors that both lack an `id`, sharing no distinguishing name either
// once one is undefined — regression fixture for finding 5 (rowKey
// collision risk).
const vendorMissingId = (overrides: Partial<VendorModel> = {}): VendorModel =>
  ({
    vendor_name: overrides.vendor_name ?? "Acme ICT",
    ...overrides,
  }) as VendorModel;

describe("DoraRegister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports blank cells (not the '—' placeholder) for missing register values", () => {
    const vendor: VendorModel = {
      id: 1,
      vendor_name: "Acme ICT",
      // All DORA fields intentionally left unset.
    } as VendorModel;

    mockUseDoraRegister.mockReturnValue({ data: [vendor], isLoading: false });

    renderWithProviders(<DoraRegister />);

    const exportButton = screen.getByText("Export register");
    fireEvent.click(exportButton);

    expect(mockExportToCSV).toHaveBeenCalledTimes(1);
    const [rows] = mockExportToCSV.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      vendor_name: "Acme ICT",
      provider_lei: "",
      ict_service_type: "",
      function_criticality: "",
      substitutability: "",
      has_exit_plan: "",
      country_of_provision: "",
    });
    // No '—' placeholder anywhere in the exported row.
    expect(Object.values(rows[0])).not.toContain("—");
  });

  it("exports has_exit_plan as blank (not '—') when unset, and Yes/No when set", () => {
    const vendors: VendorModel[] = [
      { id: 1, vendor_name: "No exit plan vendor", has_exit_plan: false } as VendorModel,
      { id: 2, vendor_name: "Has exit plan vendor", has_exit_plan: true } as VendorModel,
      { id: 3, vendor_name: "Unset exit plan vendor" } as VendorModel,
    ];
    mockUseDoraRegister.mockReturnValue({ data: vendors, isLoading: false });

    renderWithProviders(<DoraRegister />);
    fireEvent.click(screen.getByText("Export register"));

    const [rows] = mockExportToCSV.mock.calls[0];
    expect(rows[0].has_exit_plan).toBe("No");
    expect(rows[1].has_exit_plan).toBe("Yes");
    expect(rows[2].has_exit_plan).toBe("");
  });

  it("renders distinct rows without key collisions when vendors lack an id", () => {
    // Both vendors omit `id`, and have different names so we can assert on
    // rendered content — the point under test is that the table does not
    // throw / warn a duplicate-key error and both rows render.
    const vendors = [
      vendorMissingId({ vendor_name: "Vendor without id A" }),
      vendorMissingId({ vendor_name: "Vendor without id B" }),
    ];
    mockUseDoraRegister.mockReturnValue({ data: vendors, isLoading: false });

    renderWithProviders(<DoraRegister />);

    expect(screen.getByText("Vendor without id A")).toBeInTheDocument();
    expect(screen.getByText("Vendor without id B")).toBeInTheDocument();
  });

  it("falls back to a stable per-row key when both id and vendor_name are missing", () => {
    // Two vendors with neither id nor vendor_name — vendor.id ?? vendor.vendor_name
    // is undefined for both; the index-based fallback must still produce two
    // distinct, defined keys so React does not collapse/collide the rows.
    const vendors = [
      vendorMissingId({ vendor_name: undefined }),
      vendorMissingId({ vendor_name: undefined }),
    ];
    mockUseDoraRegister.mockReturnValue({ data: vendors, isLoading: false });

    expect(() => renderWithProviders(<DoraRegister />)).not.toThrow();
    // Both rows are present (2 ICT providers reported in the count label).
    expect(screen.getByText("2 ICT providers")).toBeInTheDocument();
  });
});
