import { vi } from "vitest";

vi.mock("../../Modals/StandardModal", () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock("../../Chip", () => ({
  default: ({ label }: any) => <span data-testid="chip">{label}</span>,
}));
vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getVendorRisksByVendorId: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../Modals/NewRisk", () => ({
  default: () => <div data-testid="new-risk" />,
}));
vi.mock("../../../../application/hooks/useVendors", () => ({
  useVendors: () => ({ vendors: [], loading: false }),
}));
vi.mock("../../../themes/v1SingleTheme", () => ({
  default: {
    textStyles: { bodyLarge: {} },
    tableStyles: { primary: { frame: {}, header: {}, cell: {} } },
  },
}));
vi.mock("../../Table/styles", () => ({
  tableWrapper: () => ({}),
  paginationDropdown: {},
  paginationSelect: {},
  paginationStyle: {},
}));
vi.mock("../../EmptyState", () => ({
  EmptyState: () => <div data-testid="empty-state">No risks</div>,
}));
vi.mock("../../TablePagination", () => ({
  default: () => <div data-testid="table-pagination" />,
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import VendorRisksDialog from "../index";

describe("VendorRisksDialog", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    vendorId: 1,
    vendorName: "Test Vendor",
  };

  it("renders when open", () => {
    renderWithProviders(<VendorRisksDialog {...defaultProps} />);
    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderWithProviders(<VendorRisksDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId("standard-modal")).not.toBeInTheDocument();
  });
});
