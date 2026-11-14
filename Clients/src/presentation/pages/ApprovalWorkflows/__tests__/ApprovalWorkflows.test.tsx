import { fireEvent, screen } from "@testing-library/react";
import { useLocation } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { onApprovalRequestsChanged } from "../../../../application/events/approvalRequestEvents";
import { HOME_QUEUE_QUERY_KEY } from "../../../../application/hooks/useHomeQueue";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock repositories
vi.mock("../../../../application/repository/approvalWorkflow.repository", () => ({
  getAllApprovalWorkflows: vi.fn().mockResolvedValue({ data: [] }),
  getApprovalWorkflowById: vi.fn().mockResolvedValue({ data: null }),
  createApprovalWorkflow: vi.fn().mockResolvedValue({ data: {} }),
  updateApprovalWorkflow: vi.fn().mockResolvedValue({ data: {} }),
  deleteApprovalWorkflow: vi.fn().mockResolvedValue({ data: {} }),
}));

// Mock hooks
vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({
    filterData: (data: any) => data,
    handleFilterChange: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => ({
    visibleColumns: new Set(["workflow_title", "entity_name", "steps", "date_updated", "actions"]),
    allColumns: [],
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
}));

// Mock tools
vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

// Mock child components
vi.mock("../ApprovalWorkflowsTable", () => ({
  default: () => <div data-testid="approval-workflows-table" />,
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: any) => <div data-testid="page-header">{children}</div>,
}));

vi.mock("../../../components/Modals/NewApprovalWorkflow", () => ({
  default: () => <div data-testid="new-approval-workflow-modal" />,
}));

vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ text }: any) => <button>{text}</button>,
}));

vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
}));

vi.mock("../../../components/Search", () => ({
  SearchBox: () => <div data-testid="search-box" />,
}));

vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

// Mock SVG import
vi.mock("../../../assets/icons/plus-circle-white.svg", () => ({
  ReactComponent: () => <svg data-testid="add-icon" />,
}));

// Mock styles
vi.mock("../style", () => ({
  addNewWorkflowButton: {},
  workflowMainStack: {},
  filterSearchContainer: {},
}));

// Mock domain enums
vi.mock("../../../../domain/enums/aiApprovalWorkflow.enum", () => ({
  ApprovalStatus: {
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
  },
}));

// Mock domain models
vi.mock("../../../../domain/models/Common/approvalWorkflow/approvalWorkflow.model", () => ({
  ApprovalWorkflowModel: class {
    constructor(data: any) {
      Object.assign(this, data);
    }
  },
}));

// The approval requests modal, reduced to the props the page passes it.
vi.mock("../../../components/Modals/RequestorApprovalModal", () => ({
  default: ({ isOpen, onClose, onRefresh, initialRequestId }: any) =>
    isOpen ? (
      <div data-testid="requests-modal" data-request-id={String(initialRequestId)}>
        <button onClick={onClose}>Close requests</button>
        <button onClick={onRefresh}>Decide request</button>
      </div>
    ) : null,
}));

const canMock = vi.hoisted(() => ({ useCan: vi.fn(() => true) }));
vi.mock("../../../../application/hooks/useCan", () => canMock);

import ApprovalWorkflows from "../index";

const LocationProbe = () => <div data-testid="location-search">{useLocation().search}</div>;

describe("ApprovalWorkflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.useCan.mockReturnValue(true);
  });

  it("shows Add new workflow with approvalWorkflow.admin", () => {
    renderWithProviders(<ApprovalWorkflows />);
    expect(canMock.useCan).toHaveBeenCalledWith("approvalWorkflow.admin");
    expect(screen.getByRole("button", { name: "Add new workflow" })).toBeInTheDocument();
  });

  it("hides Add new workflow without approvalWorkflow.admin", () => {
    canMock.useCan.mockReturnValue(false);
    renderWithProviders(<ApprovalWorkflows />);
    expect(screen.queryByRole("button", { name: "Add new workflow" })).not.toBeInTheDocument();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ApprovalWorkflows />);
    expect(container).toBeTruthy();
  });

  describe("?request= deep link (Home queue)", () => {
    it("opens the approval requests modal on the linked request", () => {
      renderWithProviders(<ApprovalWorkflows />, { route: "/approval-workflows?request=42" });
      expect(screen.getByTestId("requests-modal")).toHaveAttribute("data-request-id", "42");
    });

    it("drops the parameter when the modal closes", () => {
      renderWithProviders(
        <>
          <ApprovalWorkflows />
          <LocationProbe />
        </>,
        { route: "/approval-workflows?request=42&tab=x" },
      );
      fireEvent.click(screen.getByRole("button", { name: "Close requests" }));
      expect(screen.queryByTestId("requests-modal")).not.toBeInTheDocument();
      expect(screen.getByTestId("location-search")).toHaveTextContent("?tab=x");
    });

    it("refreshes Home and the approvals count after a decision", () => {
      const queryClient = new QueryClient();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const changed = vi.fn();
      const stop = onApprovalRequestsChanged(changed);
      try {
        renderWithProviders(<ApprovalWorkflows />, {
          route: "/approval-workflows?request=42",
          queryClient,
        });

        fireEvent.click(screen.getByRole("button", { name: "Decide request" }));

        expect(invalidate).toHaveBeenCalledWith({ queryKey: HOME_QUEUE_QUERY_KEY });
        expect(changed).toHaveBeenCalledTimes(1);
      } finally {
        stop();
      }
    });

    it("leaves the modal closed without the parameter", () => {
      renderWithProviders(<ApprovalWorkflows />, { route: "/approval-workflows" });
      expect(screen.queryByTestId("requests-modal")).not.toBeInTheDocument();
    });

    it("ignores an id that is not a positive whole number", () => {
      renderWithProviders(<ApprovalWorkflows />, { route: "/approval-workflows?request=abc" });
      expect(screen.queryByTestId("requests-modal")).not.toBeInTheDocument();
    });
  });
});
