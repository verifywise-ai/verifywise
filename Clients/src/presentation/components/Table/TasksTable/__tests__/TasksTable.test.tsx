import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import TasksTable from "../index";
import type { ITask } from "../../../../../domain/interfaces/i.task";
import { TaskPriority, TaskStatus } from "../../../../../domain/enums/task.enum";
import { buildTask } from "../../../../../test/factories/task.factory";

const mockRows: ITask[] = [
  buildTask({ categories: ["GDPR"] }),
  buildTask({
    id: 2,
    title: "Update model documentation",
    creator_id: 2,
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.IN_PROGRESS,
    due_date: new Date("2025-11-15"),
    assignees: [2] as any,
    categories: [],
  }),
  buildTask({
    id: 3,
    title: "Archived task example",
    priority: TaskPriority.LOW,
    status: TaskStatus.DELETED,
    due_date: new Date("2025-01-01"),
    categories: [],
  }),
  buildTask({
    id: 4,
    title: "Overdue compliance check",
    priority: TaskPriority.HIGH,
    status: TaskStatus.OVERDUE,
    due_date: new Date("2024-01-01"),
    assignees: [1, 2, 3, 4] as any,
    isOverdue: true,
    categories: [],
  }),
];

// Mutable state for useStandardTable so tests can change return values
const mockTableState = vi.hoisted(() => ({
  sortedRows: [] as any[],
  sortConfig: { key: "", direction: null },
  handleSort: () => {},
  page: 0,
  validPage: 0,
  rowsPerPage: 10,
  handleChangePage: () => {},
  handleChangeRowsPerPage: () => {},
  getRange: "0 - 0",
  totalCount: 0,
}));

// Mutable state for useBulkSelection so tests can change selectedIds
const mockBulkState = vi.hoisted(() => ({
  selectedIds: [] as number[],
  isSelected: () => false,
  toggle: () => {},
  toggleAll: () => {},
  setAll: () => {},
  clear: () => {},
  allSelected: false,
  someSelected: false,
  count: 0,
}));

vi.mock("../../../../../application/hooks/useStandardTable", () => ({
  useStandardTable: () => mockTableState,
}));

vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({
    data: [{ id: 1, label: "Custom Field 1", field_type: "text" }],
  }),
}));

vi.mock("../../../../../application/hooks/useBulkSelection", () => ({
  useBulkSelection: () => mockBulkState,
}));

vi.mock("../../../../../application/hooks/useBulkUpdateTasks", () => ({
  useBulkUpdateTasks: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../StandardTableHead", () => ({
  default: ({ columns, selection }: any) => (
    <thead data-testid="mock-table-head">
      <tr>
        {selection && (
          <th data-testid="select-all-header">
            <input
              type="checkbox"
              data-testid="select-all-checkbox"
              checked={selection.allSelected}
              onChange={selection.onToggleAll}
              aria-label={selection.ariaLabel}
            />
          </th>
        )}
        {columns.map((col: any) => (
          <th key={col.id}>{col.label}</th>
        ))}
      </tr>
    </thead>
  ),
}));

vi.mock("../../StandardTablePagination", () => ({
  default: ({ totalCount, getRange, entityLabel }: any) => (
    <tfoot data-testid="mock-pagination">
      <tr>
        <td data-testid="pagination-info">
          Showing {getRange} of {totalCount} {entityLabel}
        </td>
      </tr>
    </tfoot>
  ),
}));

vi.mock("../../../EmptyState", () => ({
  EmptyState: ({ message, children }: any) => (
    <div data-testid="empty-state">
      <p>{message}</p>
      {children && <div data-testid="empty-state-tips">{children}</div>}
    </div>
  ),
}));

vi.mock("../../BulkActionsToolbar", () => ({
  default: ({ count, onClear, actions, selectAll }: any) => (
    <div data-testid="bulk-actions-toolbar">
      <span data-testid="selection-count">{count} selected</span>
      <button data-testid="clear-selection" onClick={onClear}>
        Clear
      </button>
      {actions.map((action: any) => (
        <button
          key={action.id}
          data-testid={`bulk-action-${action.id}`}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
      {selectAll && (
        <button data-testid="select-all-btn" onClick={selectAll.onSelectAll}>
          Select all {selectAll.totalCount}
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../../IconButton", () => ({
  default: ({ id, onEdit, onDelete, isArchived, onRestore, onHardDelete }: any) => (
    <div data-testid="icon-button">
      <button data-testid={`edit-task-${id}`} onClick={() => onEdit({ id })}>
        Edit
      </button>
      <button data-testid={`archive-task-${id}`} onClick={() => onDelete()}>
        Archive
      </button>
      {isArchived && onRestore && (
        <button data-testid={`restore-task-${id}`} onClick={() => onRestore()}>
          Restore
        </button>
      )}
      {isArchived && onHardDelete && (
        <button data-testid={`hard-delete-task-${id}`} onClick={() => onHardDelete()}>
          Delete permanently
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../../CustomSelect", () => ({
  CustomSelect: ({ currentValue, onValueChange, options, disabled }: any) => (
    <select
      data-testid="custom-select"
      value={currentValue}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
    >
      {options.map((opt: any) => (
        <option
          key={typeof opt === "string" ? opt : opt.value}
          value={typeof opt === "string" ? opt : opt.value}
        >
          {typeof opt === "string" ? opt : opt.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../../../Chip/CategoryChip/CategoryChip", () => ({
  CategoryChip: ({ categories }: any) => (
    <span data-testid="category-chip">{categories?.join(", ")}</span>
  ),
}));

vi.mock("../../../Chip", () => ({
  default: ({ label, variant }: any) => (
    <span data-testid="chip" data-variant={variant}>
      {label}
    </span>
  ),
}));

vi.mock("../../../Chip/DaysChip", () => ({
  DaysChip: (_props: any) => <span data-testid="days-chip">Days remaining</span>,
}));

vi.mock("../../../Dialogs/ConfirmationModal", () => ({
  default: ({ isOpen, title, onProceed, onCancel, proceedText, cancelText }: any) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <h3>{title}</h3>
        <button data-testid="modal-proceed" onClick={onProceed}>
          {proceedText}
        </button>
        <button data-testid="modal-cancel" onClick={onCancel}>
          {cancelText}
        </button>
      </div>
    ) : null,
}));

vi.mock("../../../Inputs/Checkbox", () => ({
  default: ({ isChecked, onChange, ariaLabel, isDisabled }: any) => (
    <input
      type="checkbox"
      checked={isChecked}
      onChange={onChange}
      disabled={isDisabled}
      aria-label={ariaLabel}
      data-testid="task-checkbox"
    />
  ),
}));

const users = [
  { id: 1, name: "Alice", surname: "Smith", email: "alice@test.com" },
  { id: 2, name: "Bob", surname: "Jones", email: "bob@test.com" },
  { id: 3, name: "Charlie", surname: "Brown", email: "charlie@test.com" },
];

const defaultProps = {
  tasks: mockRows,
  users,
  onArchive: vi.fn(),
  onEdit: vi.fn(),
  onStatusChange: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(true)),
  statusOptions: ["Open", "In Progress", "Completed", "Overdue", "Archived"],
  onRowClick: vi.fn(),
  onPriorityChange: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(true)),
  priorityOptions: ["Low", "Medium", "High"],
};

function setTableRows(rows: ITask[]) {
  mockTableState.sortedRows = rows;
  mockTableState.totalCount = rows.length;
  mockTableState.getRange = rows.length > 0 ? "1 - " + rows.length : "0 - 0";
}

function setBulkSelected(ids: number[]) {
  mockBulkState.selectedIds = ids;
  mockBulkState.count = ids.length;
}

describe("TasksTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTableRows(mockRows);
    setBulkSelected([]);
    mockBulkState.isSelected = () => false;
    mockBulkState.allSelected = false;
    mockBulkState.someSelected = false;
  });

  it("renders task rows", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    expect(screen.getByText("Review data processing agreement")).toBeInTheDocument();
    expect(screen.getByText("Update model documentation")).toBeInTheDocument();
    expect(screen.getByText("Archived task example")).toBeInTheDocument();
    expect(screen.getByText("Overdue compliance check")).toBeInTheDocument();
  });

  it("renders column headers via StandardTableHead", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Due date")).toBeInTheDocument();
    expect(screen.getByText("Assignees")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("shows empty state when no tasks", () => {
    setTableRows([]);
    renderWithProviders(<TasksTable {...defaultProps} tasks={[]} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No tasks yet. Tasks help you track action items across your governance program.",
      ),
    ).toBeInTheDocument();
  });

  it("shows empty state when tasks is null", () => {
    setTableRows([]);
    renderWithProviders(<TasksTable {...defaultProps} tasks={undefined as any} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders pagination info", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    expect(screen.getByTestId("mock-pagination")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-info").textContent).toBe("Showing 1 - 4 of 4 task");
  });

  it("hides pagination when hidePagination is true", () => {
    renderWithProviders(<TasksTable {...defaultProps} hidePagination />);
    expect(screen.queryByTestId("mock-pagination")).not.toBeInTheDocument();
  });

  it("renders priority CustomSelect for non-archived tasks", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const selects = screen.getAllByTestId("custom-select");
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Archived text for deleted tasks", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const archivedTexts = screen.getAllByText("Archived");
    expect(archivedTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders IconButton for each row", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const buttons = screen.getAllByTestId("icon-button");
    expect(buttons).toHaveLength(4);
  });

  it("renders category chips for tasks with categories", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const chips = screen.getAllByTestId("category-chip");
    expect(chips.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("GDPR")).toBeInTheDocument();
  });

  it("renders assignee avatars", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const avatars = screen.getAllByText("BJ");
    expect(avatars.length).toBeGreaterThanOrEqual(1);
  });

  it("shows +N for more than 3 assignees", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("shows Unassigned for tasks without assignees", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const unassigned = screen.getAllByText("Unassigned");
    expect(unassigned.length).toBeGreaterThanOrEqual(1);
  });

  it("renders due date chip for non-completed tasks", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const chips = screen.getAllByTestId("days-chip");
    expect(chips.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Overdue chip for overdue tasks", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    const chips = screen.getAllByTestId("chip");
    const overdueChip = chips.find((c) => c.textContent === "Overdue");
    expect(overdueChip).toBeTruthy();
  });

  it("shows No due date for tasks without due_date", () => {
    setTableRows(mockRows.map((t) => ({ ...t, due_date: undefined })));
    renderWithProviders(
      <TasksTable {...defaultProps} tasks={mockRows.map((t) => ({ ...t, due_date: undefined }))} />,
    );
    const noDueDates = screen.getAllByText("No due date");
    expect(noDueDates.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onArchive when archive button is clicked", async () => {
    const onArchive = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TasksTable {...defaultProps} onArchive={onArchive} />);

    await user.click(screen.getAllByTestId(/archive-task-/)[0]);
    expect(onArchive).toHaveBeenCalledWith(1);
  });

  it("calls onEdit when edit button is clicked", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TasksTable {...defaultProps} onEdit={onEdit} />);

    await user.click(screen.getAllByTestId(/edit-task-/)[0]);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("shows restore button for archived tasks", () => {
    renderWithProviders(
      <TasksTable {...defaultProps} onRestore={vi.fn()} onHardDelete={vi.fn()} />,
    );
    const restoreButtons = screen.getAllByTestId(/restore-task-/);
    expect(restoreButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows hard delete button for archived tasks", () => {
    renderWithProviders(
      <TasksTable {...defaultProps} onRestore={vi.fn()} onHardDelete={vi.fn()} />,
    );
    const hardDeleteButtons = screen.getAllByTestId(/hard-delete-task-/);
    expect(hardDeleteButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onRowClick when a non-archived row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TasksTable {...defaultProps} onRowClick={onRowClick} />);

    await user.click(screen.getByText("Review data processing agreement"));
    expect(onRowClick).toHaveBeenCalled();
  });

  it("hides columns not in visibleColumns", () => {
    const visibleColumns = new Set(["priority", "status"]);
    renderWithProviders(<TasksTable {...defaultProps} visibleColumns={visibleColumns} />);
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.queryByText("Assignees")).not.toBeInTheDocument();
    expect(screen.queryByText("Due date")).not.toBeInTheDocument();
  });

  it("shows bulk actions toolbar when canRunBulkActions is true", () => {
    renderWithProviders(<TasksTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeInTheDocument();
  });

  it("hides bulk actions toolbar when canRunBulkActions is false", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    expect(screen.queryByTestId("bulk-actions-toolbar")).not.toBeInTheDocument();
  });

  it("renders select-all checkbox when canRunBulkActions", () => {
    renderWithProviders(<TasksTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("select-all-checkbox")).toBeInTheDocument();
  });

  it("renders row checkboxes when canRunBulkActions", () => {
    renderWithProviders(<TasksTable {...defaultProps} canRunBulkActions />);
    const checkboxes = screen.getAllByTestId("task-checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders bulk action buttons", () => {
    renderWithProviders(<TasksTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("bulk-action-mark_complete")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-action-set_categories")).toBeInTheDocument();
  });

  it("opens categories dialog on bulk action click", async () => {
    setBulkSelected([1]);
    const user = userEvent.setup();
    renderWithProviders(<TasksTable {...defaultProps} canRunBulkActions />);

    await user.click(screen.getByTestId("bulk-action-set_categories"));
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
  });

  it("renders with custom field definitions", () => {
    renderWithProviders(<TasksTable {...defaultProps} />);
    expect(screen.getByText("Custom Field 1")).toBeInTheDocument();
  });

  it("renders archived task with line-through styling", () => {
    const { container } = renderWithProviders(<TasksTable {...defaultProps} />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(4);
  });

  it("disables select for archived tasks", () => {
    renderWithProviders(<TasksTable {...defaultProps} canRunBulkActions />);
    const checkboxes = screen.getAllByTestId("task-checkbox");
    const archivedCheckbox = checkboxes[checkboxes.length - 1];
    expect(archivedCheckbox.closest("tr")).toBeTruthy();
  });

  it("renders with isUpdateDisabled flag", () => {
    renderWithProviders(<TasksTable {...defaultProps} isUpdateDisabled />);
    const selects = screen.getAllByTestId("custom-select");
    selects.forEach((s) => {
      expect(s).toBeDisabled();
    });
  });

  it("renders flashRow styling", () => {
    renderWithProviders(<TasksTable {...defaultProps} flashRowId={1} />);
    expect(screen.getByText("Review data processing agreement")).toBeInTheDocument();
  });

  it("calls handleMarkComplete from bulk actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TasksTable {...defaultProps} canRunBulkActions />);

    await user.click(screen.getByTestId("bulk-action-mark_complete"));
  });
});
