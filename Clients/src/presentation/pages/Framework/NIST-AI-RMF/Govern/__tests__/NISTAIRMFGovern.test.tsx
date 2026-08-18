import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";

const mockGetEntityById = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("../../../../../../application/repository/entity.repository", () => ({
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
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
  updateNISTAIRMFSubcategoryStatus: (...args: any[]) => mockUpdateStatus(...args),
}));

vi.mock("../../../../../components/Drawer/NISTAIRMFDashboardDrawerDialog", () => ({
  default: ({ open, onClose, onSaveSuccess, subcategory }: any) =>
    open ? (
      <div data-testid="nist-drawer">
        <span>{subcategory?.title}</span>
        <button onClick={onClose}>close-drawer</button>
        <button onClick={() => onSaveSuccess(true, "saved", subcategory?.id)}>save-drawer</button>
      </div>
    ) : null,
}));

vi.mock("../../../../../components/FrameworkFilter/TabFilterBar", () => ({
  TabFilterBar: ({ searchTerm }: any) => (
    <div data-testid="tab-filter-bar">filter:{searchTerm}</div>
  ),
}));

import NISTAIRMFGovern from "../index";

const mockCategories = [
  { id: 1, title: "Policies and Procedures", index: "GV-1", description: "Category one" },
  { id: 2, title: "Accountability Structures", index: "GV-2", description: "Category two" },
];

const mockSubcategories = [
  { id: 101, title: "Sub 1", description: "Sub desc 1", status: "Not started" },
  { id: 102, title: "Sub 2", description: "Sub desc 2", status: "In progress" },
];

const defaultProps = {
  project: { id: 1, name: "Test" } as any,
  projectFrameworkId: 1,
  statusFilter: "",
  onStatusFilterChange: vi.fn(),
  statusOptions: [{ value: "all", label: "All" }],
  searchTerm: "",
  onSearchTermChange: vi.fn(),
};

describe("NISTAIRMFGovern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntityById.mockImplementation(({ routeUrl }: any) => {
      if (routeUrl.includes("/categories/")) {
        return Promise.resolve({ data: mockCategories });
      }
      return Promise.resolve({ data: mockSubcategories });
    });
    mockUpdateStatus.mockResolvedValue(true);
  });

  it("renders the title and categories", async () => {
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    expect(screen.getByText("NIST AI RMF - Govern categories")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Accountability Structures/)).toBeInTheDocument();
  });

  it("renders the filter bar when handlers provided", () => {
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    expect(screen.getByTestId("tab-filter-bar")).toBeInTheDocument();
  });

  it("does not render filter bar when handlers missing", () => {
    renderWithProviders(
      <NISTAIRMFGovern
        project={defaultProps.project}
        projectFrameworkId={1}
      />,
    );
    expect(screen.queryByTestId("tab-filter-bar")).not.toBeInTheDocument();
  });

  it("expands accordion and loads subcategories", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures/));
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures GV-1\.1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Policies and Procedures GV-1\.2/)).toBeInTheDocument();
  });

  it("opens the drawer when a subcategory is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures/));
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures GV-1\.1/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("nist-drawer")).not.toBeInTheDocument();
    await user.click(screen.getByText(/Policies and Procedures GV-1\.1/));
    expect(screen.getByTestId("nist-drawer")).toBeInTheDocument();
  });

  it("closes the drawer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures/));
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures GV-1\.1/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures GV-1\.1/));
    await user.click(screen.getByText("close-drawer"));
    expect(screen.queryByTestId("nist-drawer")).not.toBeInTheDocument();
  });

  it("calls updateNISTAIRMFSubcategoryStatus when status dropdown clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures/));
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
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures/));
    await waitFor(() => {
      expect(screen.getAllByTestId("status-dropdown").length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByTestId("status-dropdown")[0]);
    await waitFor(() => {
      expect(screen.getByText("Failed to update status")).toBeInTheDocument();
    });
  });

  it("handles status update error gracefully", async () => {
    mockUpdateStatus.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures/));
    await waitFor(() => {
      expect(screen.getAllByTestId("status-dropdown").length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByTestId("status-dropdown")[0]);
    await waitFor(() => {
      expect(screen.getByText("Error updating status")).toBeInTheDocument();
    });
  });

  it("filters categories by search term", async () => {
    renderWithProviders(
      <NISTAIRMFGovern {...defaultProps} searchTerm="Accountability Structures" />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Accountability Structures/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Policies and Procedures/)).not.toBeInTheDocument();
  });

  it("shows no matching subcategories message when filter matches nothing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} statusFilter="Implemented" />);
    await waitFor(() => {
      expect(screen.getByText(/Policies and Procedures/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Policies and Procedures/));
    await waitFor(() => {
      expect(screen.getAllByText("No matching subcategories").length).toBeGreaterThan(0);
    });
  });

  it("handles category fetch error gracefully", async () => {
    mockGetEntityById.mockRejectedValue(new Error("fail"));
    renderWithProviders(<NISTAIRMFGovern {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText(/Policies and Procedures/)).not.toBeInTheDocument();
    });
    expect(screen.getByText("NIST AI RMF - Govern categories")).toBeInTheDocument();
  });

  it("auto-opens drawer when initial category/subcategory ids provided", async () => {
    renderWithProviders(
      <NISTAIRMFGovern
        {...defaultProps}
        initialCategoryId="1"
        initialSubcategoryId="101"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("nist-drawer")).toBeInTheDocument();
    });
  });
});
