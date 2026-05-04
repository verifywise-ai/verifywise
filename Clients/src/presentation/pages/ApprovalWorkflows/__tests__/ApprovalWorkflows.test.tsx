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

import ApprovalWorkflows from "../index";

describe("ApprovalWorkflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ApprovalWorkflows />);
    expect(container).toBeTruthy();
  });
});
