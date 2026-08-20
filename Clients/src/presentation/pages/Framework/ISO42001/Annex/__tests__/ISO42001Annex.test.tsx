import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";

const mockGetEntityById = vi.fn();
const mockGetAnnexes = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("../../../../../../application/repository/entity.repository", () => ({
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
}));

vi.mock("../../../../../../application/repository/annex_struct_iso.repository", () => ({
  GetAnnexesByProjectFrameworkId: (...args: any[]) => mockGetAnnexes(...args),
}));

vi.mock("../../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, userRoleName: "Admin" }),
}));

vi.mock("../../../../../components/StatusDropdown", () => ({
  default: ({ currentStatus, onStatusChange }: any) => (
    <button data-testid="status-dropdown" onClick={() => onStatusChange("In progress")}>
      {currentStatus}
    </button>
  ),
}));

vi.mock("../../../../../components/StatusDropdown/statusUpdateApi", () => ({
  updateISO42001AnnexStatus: (...args: any[]) => mockUpdateStatus(...args),
}));

vi.mock("../../../../../components/Drawer/AnnexDrawerDialog", () => ({
  default: ({ open, title, onClose }: any) =>
    open ? (
      <div data-testid="annex-drawer">
        <span>{title}</span>
        <button onClick={() => onClose(undefined, "escapeKeyDown")}>close-drawer</button>
      </div>
    ) : null,
}));

vi.mock("../../../../../components/FrameworkFilter/TabFilterBar", () => ({
  TabFilterBar: () => <div data-testid="tab-filter-bar" />,
}));

import ISO42001Annex from "../index";

const mockAnnexes = [
  {
    id: 1,
    title: "Organizational policies",
    arrangement: "A.1",
    annex_no: "1",
    annexCategories: [
      { id: 101, title: "Category one", order_no: 1, status: "Not started" },
      { id: 102, title: "Category two", order_no: 2, status: "In progress" },
    ],
  },
  {
    id: 2,
    title: "Internal organization",
    arrangement: "A.2",
    annex_no: "2",
    annexCategories: [],
  },
];

const defaultProps = {
  project: { id: 1, name: "Test" } as any,
  projectFrameworkId: 10,
  searchTerm: "",
  onSearchTermChange: vi.fn(),
  onStatusChange: vi.fn(),
  onApplicabilityChange: vi.fn(),
  onOwnerChange: vi.fn(),
  onReviewerChange: vi.fn(),
  onDueDateChange: vi.fn(),
};

describe("ISO42001Annex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntityById.mockResolvedValue({
      data: { totalAnnexcategories: 2, doneAnnexcategories: 1 },
    });
    mockGetAnnexes.mockResolvedValue({ data: mockAnnexes });
    mockUpdateStatus.mockResolvedValue(true);
  });

  it("renders the title and filter bar", async () => {
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    expect(screen.getByText("Information Security Controls")).toBeInTheDocument();
    expect(screen.getByTestId("tab-filter-bar")).toBeInTheDocument();
  });

  it("renders annex accordions with data", async () => {
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational policies/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Internal organization/)).toBeInTheDocument();
  });

  it("shows control categories when accordion is expanded", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational policies/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational policies/));
    await waitFor(() => {
      expect(screen.getByText(/Category one/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Category two/)).toBeInTheDocument();
  });

  it("opens drawer when a control category is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational policies/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational policies/));
    await waitFor(() => {
      expect(screen.getByText(/Category one/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("annex-drawer")).not.toBeInTheDocument();
    await user.click(screen.getByText(/Category one/));
    expect(screen.getByTestId("annex-drawer")).toBeInTheDocument();
    expect(screen.getByText("Category one")).toBeInTheDocument();
  });

  it("closes the drawer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational policies/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational policies/));
    await waitFor(() => {
      expect(screen.getByText(/Category one/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Category one/));
    await user.click(screen.getByText("close-drawer"));
    expect(screen.queryByTestId("annex-drawer")).not.toBeInTheDocument();
  });

  it("calls updateISO42001AnnexStatus when status dropdown is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational policies/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational policies/));
    await waitFor(() => {
      expect(screen.getAllByTestId("status-dropdown").length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByTestId("status-dropdown")[0]);
    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: 101, newStatus: "In progress" }),
      );
    });
    expect(screen.getByText("Status updated successfully")).toBeInTheDocument();
  });

  it("shows error alert when status update fails", async () => {
    mockUpdateStatus.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational policies/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational policies/));
    await waitFor(() => {
      expect(screen.getAllByTestId("status-dropdown").length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByTestId("status-dropdown")[0]);
    await waitFor(() => {
      expect(screen.getByText("Failed to update status")).toBeInTheDocument();
    });
  });

  it("shows 'No matching categories' for an annex with no categories", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Internal organization/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Internal organization/));
    await waitFor(() => {
      expect(screen.getByText("No matching categories")).toBeInTheDocument();
    });
  });

  it("filters annexes by search term", async () => {
    renderWithProviders(<ISO42001Annex {...defaultProps} searchTerm="Internal" />);
    await waitFor(() => {
      expect(screen.getByText(/Internal organization/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Organizational policies/)).not.toBeInTheDocument();
  });

  it("shows filtered count chip when status filter is active", async () => {
    renderWithProviders(<ISO42001Annex {...defaultProps} statusFilter="In progress" />);
    await waitFor(() => {
      expect(screen.getByText("1 filtered")).toBeInTheDocument();
    });
  });

  it("handles annex fetch error gracefully", async () => {
    mockGetAnnexes.mockRejectedValue(new Error("network error"));
    renderWithProviders(<ISO42001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Information Security Controls")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Organizational policies/)).not.toBeInTheDocument();
  });

  it("auto-opens drawer when initial annex/category ids are provided", async () => {
    renderWithProviders(
      <ISO42001Annex {...defaultProps} initialAnnexId="1" initialAnnexCategoryId="101" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("annex-drawer")).toBeInTheDocument();
    });
  });
});
