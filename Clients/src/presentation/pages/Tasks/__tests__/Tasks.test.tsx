import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock HelperIcon to avoid UserGuideSidebarProvider dependency
vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
}));

// Mock repository functions
vi.mock("../../../../application/repository/task.repository", () => ({
  getAllTasks: vi.fn().mockResolvedValue({ data: { tasks: [] } }),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  getTaskById: vi.fn(),
  restoreTask: vi.fn(),
  hardDeleteTask: vi.fn(),
  updateTaskPriority: vi.fn(),
}));

vi.mock("../../../../application/repository/taskEntityLink.repository", () => ({
  addTaskEntityLink: vi.fn(),
  removeTaskEntityLink: vi.fn(),
  getTaskEntityLinks: vi.fn().mockResolvedValue([]),
}));

// Mock hooks
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({
    filterData: (data: unknown[]) => data,
    handleFilterChange: vi.fn(),
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

vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => ({
    visibleColumns: new Set(["title", "priority", "status", "due_date", "assignees", "actions"]),
    allColumns: [],
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
}));

// Mock context
vi.mock("../../../../application/contexts/VerifyWise.context", () => ({
  VerifyWiseContext: {
    _currentValue: { userRoleName: "Admin", userId: 1 },
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children({ userRoleName: "Admin", userId: 1 }),
  },
}));

// Mock events
vi.mock("../../../../application/events/aiActionEvents", () => ({
  onAiActionCompleted: () => () => {},
}));

// Mock child components
vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../TasksSteps", () => ({
  default: [],
}));

vi.mock("../../../components/Modals/CreateTask", () => ({
  default: () => null,
}));

vi.mock("../TaskSummaryCards", () => ({
  default: () => <div data-testid="task-summary-cards" />,
}));

vi.mock("../../../components/Table/TasksTable", () => ({
  default: () => <div data-testid="tasks-table" />,
}));

vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: ({ ungroupedData, renderTable }: any) => (
    <div data-testid="grouped-table-view">{renderTable(ungroupedData || [])}</div>
  ),
}));

vi.mock("../../../components/Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));

vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
}));

vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));

vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../DeadlineView", () => ({
  default: () => <div data-testid="deadline-view" />,
}));

vi.mock("../../../components/TabBar", () => ({
  default: ({ tabs }: any) => (
    <div data-testid="tab-bar">
      {tabs.map((t: any) => (
        <span key={t.value}>{t.label}</span>
      ))}
    </div>
  ),
}));

import Tasks from "../index";

describe("Tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Tasks />, { route: "/tasks" });
    expect(screen.getByText("Task management")).toBeInTheDocument();
  });

  it("renders tab bar with List view and Deadline view", () => {
    renderWithProviders(<Tasks />, { route: "/tasks" });
    expect(screen.getByText("List view")).toBeInTheDocument();
    expect(screen.getByText("Deadline view")).toBeInTheDocument();
  });

  it("renders Add new task button", () => {
    renderWithProviders(<Tasks />, { route: "/tasks" });
    expect(screen.getByText("Add new task")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    renderWithProviders(<Tasks />, { route: "/tasks" });
    expect(document.querySelectorAll(".MuiSkeleton-root").length).toBeGreaterThan(0);
  });
});
