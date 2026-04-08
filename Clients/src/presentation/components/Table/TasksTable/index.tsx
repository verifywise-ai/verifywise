import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  useTheme,
  Stack,
  Typography,
  Box,
} from "@mui/material";
import { useCallback, useMemo } from "react";
import singleTheme from "../../../themes/v1SingleTheme";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { ListTodo, UserPlus, Tag, Link2 } from "lucide-react";
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
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import type { StandardColumn } from "../../../../domain/types/standardTable";

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

const titleOfTableColumns: StandardColumn[] = [
  { id: "title", label: "Task", sortable: true },
  { id: "priority", label: "Priority", sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "due_date", label: "Due date", sortable: true },
  { id: "assignees", label: "Assignees", sortable: false },
  { id: "actions", label: "Actions", sortable: false },
];

const priorityOrder: Record<string, number> = {
  [TaskPriority.LOW]: 1,
  [TaskPriority.MEDIUM]: 2,
  [TaskPriority.HIGH]: 3,
};

const statusOrder: Record<string, number> = {
  [TaskStatus.OPEN]: 1,
  [TaskStatus.IN_PROGRESS]: 2,
  [TaskStatus.COMPLETED]: 3,
  [TaskStatus.OVERDUE]: 4,
  [TaskStatus.DELETED]: 5,
};

function taskSortComparator(a: TaskModel, b: TaskModel, key: string): number {
  switch (key) {
    case "title":
      return (a.title?.toLowerCase() || "").localeCompare(
        b.title?.toLowerCase() || ""
      );
    case "priority":
      return (
        (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0)
      );
    case "status":
      return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
    case "due_date": {
      const aTime = a.due_date ? new Date(a.due_date).getTime() : 0;
      const bTime = b.due_date ? new Date(b.due_date).getTime() : 0;
      return aTime - bTime;
    }
    default:
      return 0;
  }
}

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

  const {
    sortConfig,
    handleSort,
    sortedRows,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount,
  } = useStandardTable<TaskModel>({
    rows: tasks || [],
    storageKey: "tasks",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator: taskSortComparator,
  });

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

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedRows &&
          sortedRows
            .slice(
              hidePagination ? 0 : validPage * rowsPerPage,
              hidePagination
                ? Math.min(sortedRows.length, 100)
                : validPage * rowsPerPage + rowsPerPage
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
      sortedRows,
      validPage,
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
      {!sortedRows || sortedRows.length === 0 ? (
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
            <StandardTableHead
              columns={visibleTableColumns}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
            {tableBody}
            {!hidePagination && (
              <StandardTablePagination
                totalCount={totalCount}
                page={validPage}
                rowsPerPage={rowsPerPage}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                getRange={getRange}
                entityLabel="task"
                colSpan={visibleTableColumns.length}
              />
            )}
          </Table>
        </TableContainer>
      )}
    </>
  );
};

export default TasksTable;
