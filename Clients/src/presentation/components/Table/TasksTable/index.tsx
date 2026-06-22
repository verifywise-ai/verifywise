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
import { useCallback, useMemo, useState } from "react";
import singleTheme from "../../../themes/v1SingleTheme";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { TableEmptyStateLayout } from "../TableEmptyStateLayout";
import { ListTodo, UserPlus, Tag, Link2, CheckCheck } from "lucide-react";
import { CustomSelect } from "../../CustomSelect";
import IconButtonComponent from "../../IconButton";
import Chip from "../../Chip";
import { DaysChip } from "../../Chip/DaysChip";
import Checkbox from "../../Inputs/Checkbox";
import ChipInput from "../../Inputs/ChipInput";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import BulkActionsToolbar, { type BulkAction } from "../BulkActionsToolbar";

import { TaskPriority, TaskStatus } from "../../../../domain/enums/task.enum";
import { ITasksTableProps } from "../../../types/interfaces/i.table";
import { TaskModel } from "../../../../domain/models/Common/task/task.model";
import { CategoryChip } from "../../Chip/CategoryChip/CategoryChip";
import { DISPLAY_TO_PRIORITY_MAP, PRIORITY_DISPLAY_MAP } from "../../../constants/priorityOptions";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import { taskTableStyles } from "./styles";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import { useBulkSelection } from "../../../../application/hooks/useBulkSelection";
import { useBulkUpdateTasks } from "../../../../application/hooks/useBulkUpdateTasks";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import type { StandardColumn } from "../../../../domain/types/standardTable";
import { useCustomFieldDefinitions } from "../../../../application/hooks/useCustomFields";
import { formatCustomFieldValue } from "../../CustomFieldsSection/formatCustomFieldValue";

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
  "Open": "Open",
  "In progress": "In Progress",
  "Completed": "Completed",
  "Overdue": "Overdue",
  "Archived": "Deleted", // Map "Archived" display back to "Deleted" status
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
      return (a.title?.toLowerCase() || "").localeCompare(b.title?.toLowerCase() || "");
    case "priority":
      return (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0);
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
  canRunBulkActions = false,
  onBulkActionSuccess,
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
    [visibleColumns],
  );

  const { data: customFieldDefs = [] } = useCustomFieldDefinitions("task");

  // Filtered column list for the header — built-ins + custom-field columns
  // injected before the actions cell.
  const visibleTableColumns = useMemo(() => {
    const builtIns = titleOfTableColumns.filter(
      (col) => col.id === "title" || col.id === "actions" || isVisible(col.id),
    );
    const customCols: StandardColumn[] = customFieldDefs.map((d) => ({
      id: `cf_${d.id}`,
      label: d.label,
      sortable: false,
    }));
    const actionsIdx = builtIns.findIndex((c) => c.id === "actions");
    if (actionsIdx === -1) return [...builtIns, ...customCols];
    return [...builtIns.slice(0, actionsIdx), ...customCols, ...builtIns.slice(actionsIdx)];
  }, [isVisible, customFieldDefs]);

  // Slice that's actually rendered — used for both the body and bulk-selection scope.
  const pageRows = useMemo(() => {
    if (!sortedRows) return [] as TaskModel[];
    return sortedRows.slice(
      hidePagination ? 0 : validPage * rowsPerPage,
      hidePagination ? Math.min(sortedRows.length, 100) : validPage * rowsPerPage + rowsPerPage,
    );
  }, [sortedRows, hidePagination, validPage, rowsPerPage]);

  // Bulk-action selection scope: only non-archived rows on the current page.
  const selectableRows = useMemo(
    () => pageRows.filter((task) => task.status !== TaskStatus.DELETED),
    [pageRows],
  );

  const getRowId = useCallback((task: TaskModel) => task.id as number, []);
  const {
    selectedIds,
    isSelected,
    toggle: toggleSelection,
    toggleAll,
    setAll: setAllSelected,
    clear: clearSelection,
    allSelected,
    someSelected,
    count: selectionCount,
  } = useBulkSelection<TaskModel>({ rows: selectableRows, getId: getRowId });

  // Full filtered/sorted set across all pages (for the toolbar's "Select all N").
  const allSelectableIds = useMemo(
    () =>
      (sortedRows ?? [])
        .filter((task) => task.status !== TaskStatus.DELETED)
        .map((task) => task.id as number),
    [sortedRows],
  );

  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);

  const bulkMutation = useBulkUpdateTasks({
    onSuccess: (payload) => {
      clearSelection();
      onBulkActionSuccess?.(payload.action, payload.ids.length);
    },
  });

  const handleMarkComplete = useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkMutation.mutate({ ids: selectedIds, action: "mark_complete" });
  }, [bulkMutation, selectedIds]);

  const handleOpenCategoriesDialog = useCallback(() => {
    if (selectedIds.length === 0) return;
    setPendingCategories([]);
    setCategoriesDialogOpen(true);
  }, [selectedIds.length]);

  const handleConfirmCategories = useCallback(() => {
    bulkMutation.mutate(
      {
        ids: selectedIds,
        action: "set_categories",
        categories: pendingCategories,
      },
      {
        onSuccess: () => setCategoriesDialogOpen(false),
      },
    );
  }, [bulkMutation, selectedIds, pendingCategories]);

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        id: "mark_complete",
        label: "Mark complete",
        icon: <CheckCheck size={16} />,
        onClick: handleMarkComplete,
        disabled: bulkMutation.isPending,
      },
      {
        id: "set_categories",
        label: "Set categories",
        icon: <Tag size={16} />,
        onClick: handleOpenCategoriesDialog,
        disabled: bulkMutation.isPending,
      },
    ],
    [handleMarkComplete, handleOpenCategoriesDialog, bulkMutation.isPending],
  );

  const tableBody = useMemo(
    () => (
      <TableBody>
        {pageRows.map((task: TaskModel) => {
          const isArchived = task.status === TaskStatus.DELETED;
          return (
            <TableRow
              key={task.id}
              sx={{
                ...singleTheme.tableStyles.primary.body.row,
                "cursor": isArchived ? "default" : "pointer",
                "backgroundColor": isArchived ? "rgba(0, 0, 0, 0.02)" : "transparent",
                "opacity": isArchived ? 0.7 : 1,
                "&:hover": {
                  backgroundColor: isArchived
                    ? "rgba(0, 0, 0, 0.04)"
                    : singleTheme.tableColors.rowHover,
                },
                ...(flashRowId === task.id && {
                  "backgroundColor": singleTheme.flashColors.background,
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
              {canRunBulkActions && (
                <TableCell
                  padding="checkbox"
                  sx={{
                    width: 40,
                    minWidth: 40,
                    maxWidth: 40,
                    padding: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                    }}
                  >
                    <Checkbox
                      id={`task-row-checkbox-${task.id}`}
                      value={String(task.id)}
                      isChecked={isSelected(task.id as number)}
                      onChange={() => toggleSelection(task.id as number)}
                      isDisabled={isArchived}
                      ariaLabel={`Select task ${task.title}`}
                      size="small"
                      sx={{ p: 0 }}
                    />
                  </Box>
                </TableCell>
              )}
              {/* Task Name */}
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.body.cell,
                  backgroundColor:
                    sortConfig.key === "title"
                      ? singleTheme.tableColors.sortedColumnFirst
                      : undefined,
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
              {isVisible("priority") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor:
                      sortConfig.key === "priority"
                        ? singleTheme.tableColors.sortedColumn
                        : undefined,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {isArchived ? (
                    <Typography sx={taskTableStyles(theme).archivedText}>Archived</Typography>
                  ) : (
                    <CustomSelect
                      currentValue={PRIORITY_DISPLAY_MAP[task.priority] || task.priority}
                      onValueChange={async (displayValue: string) => {
                        const apiValue = DISPLAY_TO_PRIORITY_MAP[displayValue] || displayValue;
                        return await onPriorityChange(task.id!)(apiValue);
                      }}
                      options={priorityOptions}
                      disabled={isUpdateDisabled}
                      size="small"
                    />
                  )}
                </TableCell>
              )}

              {/* Status */}
              {isVisible("status") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor:
                      sortConfig.key === "status"
                        ? singleTheme.tableColors.sortedColumn
                        : undefined,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {isArchived ? (
                    <Typography sx={taskTableStyles(theme).archivedText}>Archived</Typography>
                  ) : (
                    <CustomSelect
                      currentValue={STATUS_DISPLAY_MAP[task.status] || task.status}
                      onValueChange={async (displayValue: string) => {
                        const apiValue = DISPLAY_TO_STATUS_MAP[displayValue] || displayValue;
                        return await onStatusChange(task.id!)(apiValue);
                      }}
                      options={statusOptions}
                      disabled={isUpdateDisabled}
                      size="small"
                    />
                  )}
                </TableCell>
              )}

              {/* Due Date */}
              {isVisible("due_date") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor:
                      sortConfig.key === "due_date"
                        ? singleTheme.tableColors.sortedColumn
                        : undefined,
                  }}
                >
                  {task.due_date ? (
                    <Stack direction="row" spacing="8px" alignItems="center">
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: 13,
                          color:
                            task.isOverdue && task.status !== TaskStatus.COMPLETED
                              ? "error.main"
                              : "text.secondary",
                          fontWeight:
                            task.isOverdue && task.status !== TaskStatus.COMPLETED ? 500 : 400,
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
                    <Typography variant="body2" color="text.disabled" sx={{ fontSize: 13 }}>
                      No due date
                    </Typography>
                  )}
                </TableCell>
              )}

              {/* Assignees */}
              {isVisible("assignees") && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    backgroundColor:
                      sortConfig.key === "assignees"
                        ? singleTheme.tableColors.sortedColumn
                        : undefined,
                  }}
                >
                  {task.assignees && task.assignees.length > 0 ? (
                    <Stack direction="row" spacing={0.5}>
                      {task.assignees.slice(0, 3).map((assigneeId, idx) => {
                        const user = users.find((u) => u.id === Number(assigneeId));
                        const initials = user
                          ? `${user.name.charAt(0)}${user.surname.charAt(0)}`.toUpperCase()
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
                    <Typography variant="body2" color="text.disabled" sx={{ fontSize: 13 }}>
                      Unassigned
                    </Typography>
                  )}
                </TableCell>
              )}

              {customFieldDefs.map((def) => {
                const match = (task as any).custom_fields?.find(
                  (cf: { definition_id: number; value: unknown }) => cf.definition_id === def.id,
                );
                return (
                  <TableCell key={`cf_${def.id}`} sx={singleTheme.tableStyles.primary.body.cell}>
                    {formatCustomFieldValue(def, match?.value, users)}
                  </TableCell>
                );
              })}

              {/* Actions */}
              <TableCell
                sx={singleTheme.tableStyles.primary.body.cell}
                onClick={(e) => e.stopPropagation()}
              >
                <IconButtonComponent
                  id={task.id!}
                  onDelete={() => onArchive(task.id!)}
                  onEdit={() => onEdit(task)}
                  onMouseEvent={() => {}}
                  warningTitle="Archive task?"
                  warningMessage={`This task will be hidden from your active task list. You can restore "${task.title}" anytime from the archived view.`}
                  type="Task"
                  isArchived={task.status === TaskStatus.DELETED}
                  onRestore={onRestore ? () => onRestore(task.id!) : undefined}
                  onHardDelete={onHardDelete ? () => onHardDelete(task.id!) : undefined}
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
      pageRows,
      cellStyle,
      statusOptions,
      isUpdateDisabled,
      onRowClick,
      onStatusChange,
      users,
      onArchive,
      onEdit,
      onRestore,
      onHardDelete,
      sortConfig,
      flashRowId,
      priorityOptions,
      onPriorityChange,
      theme,
      isVisible,
      canRunBulkActions,
      isSelected,
      toggleSelection,
    ],
  );

  return (
    <>
      {!sortedRows || sortedRows.length === 0 ? (
        <TableEmptyStateLayout
          header={
            <StandardTableHead
              columns={visibleTableColumns}
              sortConfig={sortConfig}
              onSort={handleSort}
              selection={
                canRunBulkActions
                  ? {
                      allSelected: false,
                      someSelected: false,
                      onToggleAll: toggleAll,
                      ariaLabel: "Select all tasks on this page",
                    }
                  : undefined
              }
            />
          }
        >
          <EmptyState
            icon={ListTodo}
            message="No tasks yet. Tasks help you track action items across your governance program."
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
        </TableEmptyStateLayout>
      ) : (
        <Stack sx={{ width: "100%" }}>
          {canRunBulkActions && (
            <BulkActionsToolbar
              count={selectionCount}
              onClear={clearSelection}
              actions={bulkActions}
              selectAll={{
                totalCount: allSelectableIds.length,
                onSelectAll: () => setAllSelected(allSelectableIds),
              }}
            />
          )}
          <TableContainer>
            <Table sx={singleTheme.tableStyles.primary.frame}>
              <StandardTableHead
                columns={visibleTableColumns}
                sortConfig={sortConfig}
                onSort={handleSort}
                selection={
                  canRunBulkActions
                    ? {
                        allSelected: allSelected && selectableRows.length > 0,
                        someSelected,
                        onToggleAll: toggleAll,
                        ariaLabel: "Select all tasks on this page",
                      }
                    : undefined
                }
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
                  colSpan={visibleTableColumns.length + (canRunBulkActions ? 1 : 0)}
                />
              )}
            </Table>
          </TableContainer>
        </Stack>
      )}

      {canRunBulkActions && categoriesDialogOpen && (
        <ConfirmationModal
          isOpen
          title={`Set categories for ${selectionCount} task${selectionCount === 1 ? "" : "s"}`}
          body={
            <Stack gap={2}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                These categories will replace the existing categories on every selected task. Leave
                empty to clear them.
              </Typography>
              <ChipInput
                id="bulk-task-categories-input"
                label="Categories"
                value={pendingCategories}
                onChange={setPendingCategories}
                placeholder="Type a category and press Enter"
              />
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Apply"
          proceedButtonVariant="contained"
          onCancel={() => {
            if (bulkMutation.isPending) return;
            setCategoriesDialogOpen(false);
          }}
          onProceed={handleConfirmCategories}
          isLoading={bulkMutation.isPending}
        />
      )}
    </>
  );
};

export default TasksTable;
