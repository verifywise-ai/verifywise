import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";

const mockGetClauses = vi.fn();
const mockGetSubClauses = vi.fn();
const mockGetEntityById = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("../../../../../../application/repository/clause_struct_iso.repository", () => ({
  Iso27001GetClauseStructByFrameworkID: (...args: any[]) => mockGetClauses(...args),
}));

vi.mock("../../../../../../application/repository/subClause_iso.repository", () => ({
  ISO27001GetSubClauseByClauseId: (...args: any[]) => mockGetSubClauses(...args),
}));

vi.mock("../../../../../../application/repository/entity.repository", () => ({
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
}));

vi.mock("../../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, userRoleName: "Admin" }),
}));

vi.mock("../../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

vi.mock("../../../../../components/StatusDropdown", () => ({
  default: ({ currentStatus, onStatusChange }: any) => (
    <button data-testid="status-dropdown" onClick={() => onStatusChange("In progress")}>
      {currentStatus}
    </button>
  ),
}));

vi.mock("../../../../../components/Drawer/ISO27001ClauseDrawerDialog", () => ({
  default: ({ open }: any) => (open ? <div data-testid="clause-drawer">Drawer Open</div> : null),
}));

vi.mock("../../../../../components/FrameworkFilter/TabFilterBar", () => ({
  TabFilterBar: () => <div data-testid="tab-filter-bar" />,
}));

vi.mock("../../../../../components/StatusDropdown/statusUpdateApi", () => ({
  updateISO27001ClauseStatus: (...args: any[]) => mockUpdateStatus(...args),
}));

import ISO27001Clause from "../index";

const mockClauses = [
  {
    id: 1,
    title: "Scope",
    order_no: 1,
    subClauses: [
      { id: 101, subclause_id: "1.1", title: "General", status: "Not started" },
      { id: 102, subclause_id: "1.2", title: "Applicability", status: "In progress" },
    ],
  },
  {
    id: 2,
    title: "Normative references",
    order_no: 2,
    subClauses: [{ id: 201, subclause_id: "2.1", title: "Reference 1", status: "Not started" }],
  },
];

const mockSubClauses = [
  { id: 101, subclause_id: "1.1", title: "General", status: "Not started" },
  { id: 102, subclause_id: "1.2", title: "Applicability", status: "In progress" },
];

const defaultProps = {
  project: { id: 1, name: "Test" } as any,
  projectFrameworkId: 1,
  searchTerm: "",
  onSearchTermChange: vi.fn(),
  onStatusChange: vi.fn(),
  onOwnerChange: vi.fn(),
  onReviewerChange: vi.fn(),
  onDueDateChange: vi.fn(),
};

describe("ISO27001Clause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClauses.mockResolvedValue({ data: mockClauses });
    mockGetSubClauses.mockResolvedValue({ data: mockSubClauses });
    mockGetEntityById.mockResolvedValue({
      data: { totalSubclauses: 3, doneSubclauses: 1 },
    });
    mockUpdateStatus.mockResolvedValue(true);
  });

  it("renders the title and filter bar", async () => {
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    expect(screen.getByText("Management System Clauses")).toBeInTheDocument();
    expect(screen.getByTestId("tab-filter-bar")).toBeInTheDocument();
  });

  it("renders clause accordions with data", async () => {
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Scope/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Normative references/)).toBeInTheDocument();
    expect(mockGetClauses).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when no clauses returned", async () => {
    mockGetClauses.mockResolvedValue({ data: [] });
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText(/Scope/)).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Management System Clauses")).toBeInTheDocument();
  });

  it("handles fetch error gracefully", async () => {
    mockGetClauses.mockRejectedValue(new Error("API error"));
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText(/Scope/)).not.toBeInTheDocument();
    });
  });

  it("expands accordion and loads subclauses", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Scope/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Scope/));
    await waitFor(() => {
      expect(screen.getByText("1.1 General")).toBeInTheDocument();
    });
    expect(screen.getByText("1.2 Applicability")).toBeInTheDocument();
  });

  it("opens drawer when subclause is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Scope/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Scope/));
    await waitFor(() => {
      expect(screen.getByText("1.1 General")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("clause-drawer")).not.toBeInTheDocument();
    await user.click(screen.getByText("1.1 General"));
    expect(screen.getByTestId("clause-drawer")).toBeInTheDocument();
  });

  it("calls updateISO27001ClauseStatus when status dropdown is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Scope/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Scope/));
    await waitFor(() => {
      expect(screen.getByText("1.1 General")).toBeInTheDocument();
    });
    const statusButton = screen.getAllByTestId("status-dropdown")[0];
    await user.click(statusButton);
    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateStatus).toHaveBeenCalledWith({
      id: 101,
      newStatus: "In progress",
      projectFrameworkId: 1,
      userId: 1,
      currentData: expect.objectContaining({ id: 101 }),
    });
  });

  it("shows success alert after status update", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Scope/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Scope/));
    await waitFor(() => {
      expect(screen.getByText("1.1 General")).toBeInTheDocument();
    });
    await user.click(screen.getAllByTestId("status-dropdown")[0]);
    await waitFor(() => {
      expect(screen.getByText("Status updated successfully")).toBeInTheDocument();
    });
  });

  it("does not render clause drawer initially", () => {
    renderWithProviders(<ISO27001Clause {...defaultProps} />);
    expect(screen.queryByTestId("clause-drawer")).not.toBeInTheDocument();
  });

  it("shows 'No matching subclauses' when filter matches nothing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ISO27001Clause {...defaultProps} statusFilter="Implemented" />);
    await waitFor(() => {
      expect(screen.getByText(/Scope/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Scope/));
    await waitFor(() => {
      expect(screen.getAllByText("No matching subclauses").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows filtered count chip when filters are active", async () => {
    renderWithProviders(<ISO27001Clause {...defaultProps} statusFilter="In progress" />);
    await waitFor(() => {
      expect(screen.getByText("1 filtered")).toBeInTheDocument();
    });
  });
});
