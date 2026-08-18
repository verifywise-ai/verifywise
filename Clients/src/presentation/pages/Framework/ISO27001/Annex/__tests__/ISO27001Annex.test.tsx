import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";

const mockGetEntityById = vi.fn();
const mockGetAnnexes = vi.fn();
const mockGetAnnexCategories = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("../../../../../../application/repository/entity.repository", () => ({
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
}));

vi.mock("../../../../../../application/repository/annex_struct_iso.repository", () => ({
  GetAnnexesByProjectFrameworkId: (...args: any[]) => mockGetAnnexes(...args),
}));

vi.mock("../../../../../../application/repository/annexCategory_iso.repository", () => ({
  GetAnnexCategoriesById: (...args: any[]) => mockGetAnnexCategories(...args),
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
  updateISO27001AnnexStatus: (...args: any[]) => mockUpdateStatus(...args),
}));

vi.mock("../../../../../components/Drawer/ISO27001AnnexDrawerDialog", () => ({
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

import ISO27001Annex from "../index";

const mockAnnexes = [
  {
    id: 1,
    title: "Organizational controls",
    arrangement: "A.5",
    order_no: 1,
    annexControls: [
      { id: 101, title: "Control one", order_no: 1, status: "Not started" },
      { id: 102, title: "Control two", order_no: 2, status: "In progress" },
    ],
  },
  {
    id: 2,
    title: "People controls",
    arrangement: "A.6",
    order_no: 2,
    annexControls: [],
  },
];

const defaultProps = {
  project: { id: 1, name: "Test" } as any,
  projectFrameworkId: 20,
  searchTerm: "",
  onSearchTermChange: vi.fn(),
  onStatusChange: vi.fn(),
  onApplicabilityChange: vi.fn(),
  onOwnerChange: vi.fn(),
  onReviewerChange: vi.fn(),
  onDueDateChange: vi.fn(),
};

describe("ISO27001Annex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntityById.mockResolvedValue({ data: { totalAnnexControls: 2, doneAnnexControls: 1 } });
    mockGetAnnexes.mockResolvedValue({ data: mockAnnexes });
    mockGetAnnexCategories.mockResolvedValue({
      data: [
        { id: 101, title: "Control one", order_no: 1, status: "Not started" },
        { id: 102, title: "Control two", order_no: 2, status: "In progress" },
      ],
    });
    mockUpdateStatus.mockResolvedValue(true);
  });

  it("renders the title and filter bar", async () => {
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    expect(
      screen.getByText("Annex A : Reference Controls (Statement of Applicability)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tab-filter-bar")).toBeInTheDocument();
  });

  it("renders annex accordions with data", async () => {
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational controls/)).toBeInTheDocument();
    });
    expect(screen.getByText(/People controls/)).toBeInTheDocument();
  });

  it("expands accordion and loads controls", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational controls/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational controls/));
    await waitFor(() => {
      expect(screen.getByText(/Control one/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Control two/)).toBeInTheDocument();
  });

  it("opens drawer when a control is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational controls/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational controls/));
    await waitFor(() => {
      expect(screen.getByText(/Control one/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("annex-drawer")).not.toBeInTheDocument();
    await user.click(screen.getByText(/Control one/));
    expect(screen.getByTestId("annex-drawer")).toBeInTheDocument();
  });

  it("closes the drawer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational controls/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational controls/));
    await waitFor(() => {
      expect(screen.getByText(/Control one/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Control one/));
    await user.click(screen.getByText("close-drawer"));
    expect(screen.queryByTestId("annex-drawer")).not.toBeInTheDocument();
  });

  it("calls updateISO27001AnnexStatus when status dropdown is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational controls/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational controls/));
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
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Organizational controls/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Organizational controls/));
    await waitFor(() => {
      expect(screen.getAllByTestId("status-dropdown").length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByTestId("status-dropdown")[0]);
    await waitFor(() => {
      expect(screen.getByText("Failed to update status")).toBeInTheDocument();
    });
  });

  it("shows 'No matching controls' for an annex with no controls", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/People controls/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/People controls/));
    await waitFor(() => {
      expect(screen.getByText("No matching controls")).toBeInTheDocument();
    });
  });

  it("filters annexes by search term", async () => {
    renderWithProviders(<ISO27001Annex {...defaultProps} searchTerm="People" />);
    await waitFor(() => {
      expect(screen.getByText(/People controls/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Organizational controls/)).not.toBeInTheDocument();
  });

  it("shows filtered count chip when status filter is active", async () => {
    renderWithProviders(<ISO27001Annex {...defaultProps} statusFilter="In progress" />);
    await waitFor(() => {
      expect(screen.getByText("1 filtered")).toBeInTheDocument();
    });
  });

  it("handles annex fetch error gracefully", async () => {
    mockGetAnnexes.mockRejectedValue(new Error("network error"));
    renderWithProviders(<ISO27001Annex {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByText("Annex A : Reference Controls (Statement of Applicability)"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Organizational controls/)).not.toBeInTheDocument();
  });

  it("auto-opens drawer when initial annex/control ids are provided", async () => {
    renderWithProviders(
      <ISO27001Annex
        {...defaultProps}
        initialAnnexId="1"
        initialAnnexControlId="101"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("annex-drawer")).toBeInTheDocument();
    });
  });
});
