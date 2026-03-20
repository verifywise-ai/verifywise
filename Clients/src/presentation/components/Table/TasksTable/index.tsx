/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TablePagination,
  TableRow,
  TableHead,
  useTheme,
  Stack,
  Typography,
  TableFooter,
  Box,
} from "@mui/material";
import { useCallback, useMemo, useState, useEffect } from "react";
import singleTheme from "../../../themes/v1SingleTheme";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import TablePaginationActions from "../../TablePagination";
import { ChevronsUpDown, ChevronUp, ChevronDown, ListTodo, UserPlus, Tag, Link2 } from "lucide-react";
import { CustomSelect } from "../../CustomSelect";
import IconButtonComponent from "../../IconButton";
import Chip from "../../Chip";
import { DaysChip } from "../../Chip/DaysChip";

import { TaskPriority, TaskStatus } from "../../../../domain/enums/task.enum";
import { ITasksTableProps } from "../../../types/interfaces/i.table";
import { TaskModel } from "../../../../domain/models/Common/task/task.model";
import { CategoryChip } from "../../Chip/CategoryChip/CategoryChip";
import { DISPLAY_TO_PRIORITY_MAP, PRIORITY_DISPLAY_MAP } from "../../../constants/priorityOptions";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import { taskTableStyles } from "./styles";
import { text } from "../../../themes/palette";

const SelectorVertical = (props: any) => (
  <ChevronsUpDown size={16} {...props} />
);

// Status display mapping
const STATUS_DISPLAY_MAP: Record<string, string> = {
  [TaskStatus.OPEN]: "Open",
  [TaskStatus.IN_PROGRESS]: "In progress", // "In Progress" -> "In progress"
  [TaskStatus.COMPLETED]: "Completed",
  [TaskStatus.OVERDUE]: "Overdue",
  [TaskStatus.DELETED]: "Archived", // Show "Archived" instead of "Deleted" for better UX
};

// Reverse mapping for API calls
const DISPLAY_TO_STATUS_MAP: Record<string, string> = {
  Open: "Open",
  "In progress": "In Progress",
  Completed: "Completed",
  Overdue: "Overdue",
  Archived: "Deleted", // Map "Archived" display back to "Deleted" status
};

const titleOfTableColumns = [
  { id: "title", label: "Task", sortable: true },
  { id: "priority", label: "Priority", sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "due_date", label: "Due date", sortable: true },
  { id: "assignees", label: "Assignees", sortable: false },
  { id: "actions", label: "Actions", sortable: false },
];

const TASKS_ROWS_PER_PAGE_KEY = "verifywise_tasks_rows_per_page";
const TASKS_SORTING_KEY = "verifywise_tasks_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

// Sortable Table Header Component
const SortableTableHeader: React.FC<{
  columns: typeof titleOfTableColumns;
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
}> = ({ columns, sortConfig, onSort }) => {
  const theme = useTheme();

  return (
    <TableHead
      sx={{
        backgroundColor:
          singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            sx={{
              ...singleTheme.tableStyles.primary.header.cell,
              ...(column.sortable
                ? {
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }
                : {}),
            }}
            onClick={() => column.sortable && onSort(column.id)}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: theme.spacing(2),
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color:
                    sortConfig.key === column.id ? "primary.main" : "inherit",
                }}
              >
                {column.label}
              </Typography>
              {column.sortable && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color:
                      sortConfig.key === column.id ? "primary.main" : `${text.disabled}`,
                  }}
                >
                  {sortConfig.key === column.id &&
                    sortConfig.direction === "asc" && <ChevronUp size={16} />}
                  {sortConfig.key === column.id &&
                    sortConfig.direction === "desc" && (
                      <ChevronDown size={16} />
                    )}
                  {sortConfig.key !== column.id && <ChevronsUpDown size={16} />}
                </Box>
              )}
            </Box>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
};

const TasksTable: React.FC<ITasksTableProps> = ({
  tasks,
  users,
  onArchive,
  onEdit,
  onStatusChange,
  statusOptions,
  isUpdateDisabled = false,
  onRowClick,
  hidePagination = false,
  onRestore,
  onHardDelete,
  flashRowId,
  onPriorityChange,
  priorityOptions,
  visibleColumns,
}) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);

  // Initialize rowsPerPage from localStorage or default to 10
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(TASKS_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 10;
  });

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(TASKS_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save rowsPerPage to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(TASKS_ROWS_PER_PAGE_KEY, String(rowsPerPage));
  }, [rowsPerPage]);

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(TASKS_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  // Column visibility helper — always show title and actions
  const isVisible = useCallback(
    (key: string) => {
      if (!visibleColumns) return true;
      return visibleColumns.has(key);
    },
    [visibleColumns]
  );

  // Filtered column list for the header
  const visibleTableColumns = useMemo(
    () =>
      titleOfTableColumns.filter(
        (col) => col.id === "title" || col.id === "actions" || isVisible(col.id)
      ),
    [isVisible]
  );

  // Sorting handlers
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        // Toggle direction if same column, or clear if already descending
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      // New column or first sort
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort the tasks based on current sort configuration
  const sortedTasks = useMemo(() => {
    if (!tasks || !sortConfig.key || !sortConfig.direction) {
      return tasks || [];
    }

    // Priority order for sorting
    const priorityOrder = {
      [TaskPriority.LOW]: 1,
      [TaskPriority.MEDIUM]: 2,
      [TaskPriority.HIGH]: 3,
    };

    // Status order for sorting
    const statusOrder = {
      [TaskStatus.OPEN]: 1,
      [TaskStatus.IN_PROGRESS]: 2,
      [TaskStatus.COMPLETED]: 3,
      [TaskStatus.OVERDUE]: 4,
      [TaskStatus.DELETED]: 5,
    };

    const sortableTasks = [...tasks];

    return sortableTasks.sort((a: TaskModel, b: TaskModel) => {
      let aValue: any;
      let bValue: any;

      switch (sortConfig.key) {
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;

        case "priority":
          aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
          bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
          break;

        case "status":
          aValue = statusOrder[a.status as keyof typeof statusOrder] || 0;
          bValue = statusOrder[b.status as keyof typeof statusOrder] || 0;
          break;

        case "due_date":
          aValue = a.due_date ? new Date(a.due_date).getTime() : 0;
          bValue = b.due_date ? new Date(b.due_date).getTime() : 0;
          break;

        default:
          return 0;
      }

      // Handle string comparisons
      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      // Handle number comparisons
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [tasks, sortConfig]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    },
    []
  );

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(
      page * rowsPerPage + rowsPerPage,
      sortedTasks?.length ?? 0
    );
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedTasks?.length]);

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedTasks &&
          sortedTasks
            .slice(
              hidePagination ? 0 : page * rowsPerPage,
              hidePagination
                ? Math.min(sortedTasks.length, 100)
                : page * rowsPerPage + rowsPerPage
            )
            .map((task: TaskModel) => {
              const isArchived = task.status === TaskStatus.DELETED;
              return (
                <TableRow
                  key={task.id}
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                    cursor: isArchived ? "default" : "pointer",
                    backgroundColor: isArchived ? "rgba(0, 0, 0, 0.02)" : "transparent",
                    opacity: isArchived ? 0.7 : 1,
                    "&:hover": {
                      backgroundColor: isArchived ? "rgba(0, 0, 0, 0.04)" : singleTheme.tableColors.rowHover,
                    },
                    ...(flashRowId === task.id && {
                      backgroundColor: singleTheme.flashColors.background,
                      "& td": {
                        backgroundColor: "transparent !important",
                      },
                      "&:hover": {
                        backgroundColor: singleTheme.flashColors.backgroundHover,
                      },
                    }),
                  }}
                  onClick={() => !isArchived && onRowClick?.(task)}
                >
                  {/* Task Name */}
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      backgroundColor: sortConfig.key === "title" ? singleTheme.tableColors.sortedColumnFirst : undefined,
                    }}
                  >
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{
                          textTransform: "capitalize",
                          textDecoration: isArchived ? "line-through" : "none",
                          color: isArchived ? "text.accent" : "inherit",
                        }}
                      >
                        {task.title}
                      </Typography>
                      <CategoryChip categories={task.categories || []} />
                    </Box>
                  </TableCell>

                  {/* Priority */}
                  {isVisible("priority") && <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor: sortConfig.key === "priority" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isArchived ? (
                      <Typography sx={taskTableStyles(theme).archivedText}>
                        Archived
                      </Typography>
                    ) : (
                      <CustomSelect
                        currentValue={
                          PRIORITY_DISPLAY_MAP[task.priority] || task.priority
                        }
                        onValueChange={async (displayValue: string) => {
                          const apiValue =
                            DISPLAY_TO_PRIORITY_MAP[displayValue] || displayValue;
                          return await onPriorityChange(task.id!)(apiValue);
                        }}
                        options={priorityOptions}
                        disabled={isUpdateDisabled}
                        size="small"
                      />
                    )}
                  </TableCell>}

                  {/* Status */}
                  {isVisible("status") && <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor: sortConfig.key === "status" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isArchived ? (
                      <Typography sx={taskTableStyles(theme).archivedText}>
                        Archived
                      </Typography>
                    ) : (
                      <CustomSelect
                        currentValue={
                          STATUS_DISPLAY_MAP[task.status] || task.status
                        }
                        onValueChange={async (displayValue: string) => {
                          const apiValue =
                            DISPLAY_TO_STATUS_MAP[displayValue] || displayValue;
                          return await onStatusChange(task.id!)(apiValue);
                        }}
                        options={statusOptions}
                        disabled={isUpdateDisabled}
                        size="small"
                      />
                    )}
                  </TableCell>}

                  {/* Due Date */}
                  {isVisible("due_date") && <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor: sortConfig.key === "due_date" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    {task.due_date ? (
                      <Stack direction="row" spacing="8px" alignItems="center">
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: 13,
                            color: task.isOverdue && task.status !== TaskStatus.COMPLETED
                              ? "error.main"
                              : "text.secondary",
                            fontWeight: task.isOverdue && task.status !== TaskStatus.COMPLETED ? 500 : 400,
                          }}
                        >
                          {displayFormattedDate(task.due_date)}
                        </Typography>
                        {task.status === TaskStatus.COMPLETED ? null : task.isOverdue ? (
                          <Chip label="Overdue" variant="error" />
                        ) : (
                          <DaysChip dueDate={task.due_date} />
                        )}
                      </Stack>
                    ) : (
                      <Typography
                        variant="body2"
                        color="text.disabled"
                        sx={{ fontSize: 13 }}
                      >
                        No due date
                      </Typography>
                    )}
                  </TableCell>}

                  {/* Assignees */}
                  {isVisible("assignees") && <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor: sortConfig.key === "assignees" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    {task.assignees && task.assignees.length > 0 ? (
                      <Stack direction="row" spacing={0.5}>
                        {task.assignees.slice(0, 3).map((assigneeId, idx) => {
                          const user = users.find(
                            (u) => u.id === Number(assigneeId)
                          );
                          const initials = user
                            ? `${user.name.charAt(0)}${user.surname.charAt(
                              0
                            )}`.toUpperCase()
                            : "?";

                          return (
                            <Box
                              key={idx}
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                backgroundColor: "background.hover",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 500,
                                color: "#374151",
                                border: "2px solid background.main",
                              }}
                            >
                              {initials}
                            </Box>
                          );
                        })}
                        {task.assignees.length > 3 && (
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              backgroundColor: "status.default.border",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 500,
                              color: "status.default.text",
                              border: "2px solid background.main",
                            }}
                          >
                            +{task.assignees.length - 3}
                          </Box>
                        )}
                      </Stack>
                    ) : (
                      <Typography
                        variant="body2"
                        color="text.disabled"
                        sx={{ fontSize: 13 }}
                      >
                        Unassigned
                      </Typography>
                    )}
                  </TableCell>}

                  {/* Actions */}
                  <TableCell
                    sx={singleTheme.tableStyles.primary.body.cell}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButtonComponent
                      id={task.id!}
                      onDelete={() => onArchive(task.id!)}
                      onEdit={() => onEdit(task)}
                      onMouseEvent={() => { }}
                      warningTitle="Archive task?"
                      warningMessage={`This task will be hidden from your active task list. You can restore "${task.title}" anytime from the archived view.`}
                      type="Task"
                      isArchived={task.status === TaskStatus.DELETED}
                      onRestore={
                        onRestore ? () => onRestore(task.id!) : undefined
                      }
                      onHardDelete={
                        onHardDelete ? () => onHardDelete(task.id!) : undefined
                      }
                      hardDeleteWarningTitle="Permanently delete this task?"
                      hardDeleteWarningMessage="This action cannot be undone. The task will be permanently removed from the system."
                    />
                  </TableCell>
                </TableRow>
              );
            })}
      </TableBody>
    ),
    [
      sortedTasks,
      page,
      rowsPerPage,
      cellStyle,
      statusOptions,
      isUpdateDisabled,
      onRowClick,
      onStatusChange,
      users,
      onArchive,
      onEdit,
      hidePagination,
      onRestore,
      onHardDelete,
      sortConfig,
      flashRowId,
      priorityOptions,
      onPriorityChange,
      theme,
      isVisible,
    ]
  );

  return (
    <>
      {!sortedTasks || sortedTasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          message="No tasks yet. Tasks help you track action items across your governance program."
          showBorder
        >
          <EmptyStateTip
            icon={UserPlus}
            title="Assign tasks to team members"
            description="Each task can be assigned to a workspace member with a priority and due date. They'll be notified when assigned."
          />
          <EmptyStateTip
            icon={Tag}
            title="Use priorities to stay organized"
            description="Set priorities (low, medium, high, urgent) and group tasks by status, assignee, or due date to track progress."
          />
          <EmptyStateTip
            icon={Link2}
            title="Link tasks to controls or risks"
            description="Associate tasks with specific controls, risks, or other resources to maintain traceability for auditors."
          />
        </EmptyState>
      ) : (
        <TableContainer>
          <Table sx={singleTheme.tableStyles.primary.frame}>
            <SortableTableHeader
              columns={visibleTableColumns}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
            {tableBody}
            {!hidePagination && (
              <TableFooter>
                <TableRow
                  sx={{
                    "& .MuiTableCell-root.MuiTableCell-footer": {
                      paddingX: theme.spacing(8),
                      paddingY: theme.spacing(4),
                    },
                  }}
                >
                  <TableCell
                    sx={{
                      paddingX: theme.spacing(2),
                      fontSize: 13,
                      opacity: 0.7,
                    }}
                  >
                    Showing {getRange} of {sortedTasks?.length} task(s)
                  </TableCell>
                  <TablePagination
                    count={sortedTasks?.length}
                    page={page}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[5, 10, 15, 25]}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    ActionsComponent={(props) => (
                      <TablePaginationActions {...props} />
                    )}
                    labelRowsPerPage="Rows per page"
                    labelDisplayedRows={({ page, count }) =>
                      `Page ${page + 1} of ${Math.max(
                        0,
                        Math.ceil(count / rowsPerPage)
                      )}`
                    }
                    slotProps={{
                      select: {
                        MenuProps: {
                          keepMounted: true,
                          PaperProps: {
                            className: "pagination-dropdown",
                            sx: {
                              mt: 0,
                              mb: theme.spacing(2),
                            },
                          },
                          transformOrigin: {
                            vertical: "bottom",
                            horizontal: "left",
                          },
                          anchorOrigin: {
                            vertical: "top",
                            horizontal: "left",
                          },
                          sx: { mt: theme.spacing(-2) },
                        },
                        inputProps: { id: "pagination-dropdown" },
                        IconComponent: SelectorVertical,
                        sx: {
                          ml: theme.spacing(4),
                          mr: theme.spacing(12),
                          minWidth: theme.spacing(20),
                          textAlign: "left",
                          "&.Mui-focused > div": {
                            backgroundColor: theme.palette.background.main,
                          },
                        },
                      },
                    }}
                    sx={{
                      mt: theme.spacing(6),
                      color: theme.palette.text.secondary,
                      "& .MuiSelect-icon": {
                        width: "24px",
                        height: "fit-content",
                      },
                      "& .MuiSelect-select": {
                        width: theme.spacing(10),
                        borderRadius: theme.shape.borderRadius,
                        border: `1px solid ${theme.palette.border.light}`,
                        padding: theme.spacing(4),
                      },
                    }}
                  />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      )}
    </>
  );
};

export default TasksTable;
