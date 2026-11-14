/* eslint-disable react-hooks/preserve-manual-memoization */
import React, { useMemo, useState, useEffect } from "react";
import { Box, Typography, Collapse, IconButton } from "@mui/material";
import {
  ChevronDown,
  ChevronRight,
  Calendar,
  CalendarX,
  AlertTriangle,
  CalendarCheck,
  ListChecks,
  Clock,
  Users,
} from "lucide-react";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { TaskModel } from "../../../domain/models/Common/task/task.model";
import { TaskStatus } from "../../../domain/enums/task.enum";
import TasksTable from "../../components/Table/TasksTable";
import { EmptyState } from "../../components/EmptyState";
import { DeadlineViewProps, DeadlineGroup } from "./types";
import { getEndOfWeek, getEndOfMonth } from "./utils";
import { storageService, dynamicKeys } from "../../../infrastructure/storage";
import { background, border, icon, radiusPx, status, text } from "../../themes/palette";

const DeadlineView: React.FC<DeadlineViewProps> = ({
  tasks,
  users,
  onArchive,
  onEdit,
  onStatusChange,
  statusOptions,
  onPriorityChange,
  priorityOptions,
  isUpdateDisabled = false,
  onRowClick,
  onRestore,
  onHardDelete,
  flashRowId,
}) => {
  const STORAGE_KEY = dynamicKeys.deadlineCollapsedSections();
  const ALL_SECTIONS = [
    "overdue",
    "today",
    "this-week",
    "next-week",
    "this-month",
    "later",
    "no-due-date",
  ];

  // Track collapsed sections - load from storage or default all collapsed
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const saved = storageService.getRaw<string[]>(STORAGE_KEY, [], {
      legacyKey: "verifywise_deadline_collapsed_sections",
    });
    return saved.length > 0 ? new Set(saved) : new Set(ALL_SECTIONS);
  });

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // Save to storage
      storageService.setRaw(STORAGE_KEY, Array.from(next));
      return next;
    });
  };

  // Group tasks by deadline period
  const deadlineGroups = useMemo((): DeadlineGroup[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const endOfWeek = getEndOfWeek(today);
    const startOfNextWeek = new Date(endOfWeek);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 1);
    const endOfNextWeek = getEndOfWeek(startOfNextWeek);

    const endOfMonth = getEndOfMonth(today);

    // Filter out completed and archived tasks
    const activeTasks = tasks.filter(
      (task) => task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.DELETED,
    );

    const overdue: TaskModel[] = [];
    const dueToday: TaskModel[] = [];
    const thisWeek: TaskModel[] = [];
    const nextWeek: TaskModel[] = [];
    const thisMonth: TaskModel[] = [];
    const later: TaskModel[] = [];
    const noDueDate: TaskModel[] = [];

    activeTasks.forEach((task) => {
      if (!task.due_date) {
        noDueDate.push(task);
        return;
      }

      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        overdue.push(task);
      } else if (dueDate.getTime() === today.getTime()) {
        dueToday.push(task);
      } else if (dueDate <= endOfWeek) {
        thisWeek.push(task);
      } else if (dueDate <= endOfNextWeek) {
        nextWeek.push(task);
      } else if (dueDate <= endOfMonth) {
        thisMonth.push(task);
      } else {
        later.push(task);
      }
    });

    // Sort each group by due date ascending
    const sortByDueDate = (a: TaskModel, b: TaskModel) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    };

    overdue.sort(sortByDueDate);
    dueToday.sort(sortByDueDate);
    thisWeek.sort(sortByDueDate);
    nextWeek.sort(sortByDueDate);
    thisMonth.sort(sortByDueDate);
    later.sort(sortByDueDate);

    // Only the urgent groups carry colour; the rest stay neutral so urgency reads at a glance.
    const neutral = (Icon: typeof Calendar) => <Icon size={16} color={icon.default} />;
    return [
      {
        key: "overdue",
        label: "Overdue",
        color: status.error.text,
        icon: <AlertTriangle size={16} color={status.error.text} />,
        tasks: overdue,
      },
      {
        key: "today",
        label: "Due today",
        color: status.warning.text,
        icon: <Clock size={16} color={status.warning.text} />,
        tasks: dueToday,
      },
      {
        key: "this-week",
        label: "This week",
        color: text.primary,
        icon: neutral(Calendar),
        tasks: thisWeek,
      },
      {
        key: "next-week",
        label: "Next week",
        color: text.primary,
        icon: neutral(Calendar),
        tasks: nextWeek,
      },
      {
        key: "this-month",
        label: "This month",
        color: text.primary,
        icon: neutral(Calendar),
        tasks: thisMonth,
      },
      {
        key: "later",
        label: "Later",
        color: text.primary,
        icon: neutral(Calendar),
        tasks: later,
      },
      {
        key: "no-due-date",
        label: "No due date",
        color: text.primary,
        icon: neutral(CalendarX),
        tasks: noDueDate,
      },
    ];
  }, [tasks]);

  // Auto-expand section containing the flashed task (e.g., after due date change)
  useEffect(() => {
    if (flashRowId) {
      // Find which group contains the flashed task
      const groupWithTask = deadlineGroups.find((group) =>
        group.tasks.some((task) => task.id === flashRowId),
      );
      if (groupWithTask && collapsedSections.has(groupWithTask.key)) {
        // Expand the section containing the updated task
        setCollapsedSections((prev) => {
          const next = new Set(prev);
          next.delete(groupWithTask.key);
          return next;
        });
      }
    }
  }, [flashRowId, deadlineGroups, collapsedSections]);

  // Check if there are no active tasks at all
  const hasNoTasks = deadlineGroups.every((group) => group.tasks.length === 0);

  if (hasNoTasks) {
    return (
      <EmptyState
        icon={CalendarCheck}
        message="No upcoming deadlines. All tasks are completed or have no due dates."
        showBorder
      >
        <EmptyStateTip
          icon={ListChecks}
          title="How deadlines work"
          description="Tasks with due dates appear here grouped by urgency: overdue, due today, this week, and later. Complete or update tasks to clear them."
        />
        <EmptyStateTip
          icon={Clock}
          title="Set due dates on tasks"
          description="Open any task and set a due date. It will automatically appear in the correct deadline group on this view."
        />
        <EmptyStateTip
          icon={Users}
          title="Assign owners"
          description="Tasks assigned to team members show up in their personal task list. Use the 'My tasks only' toggle on the list view to filter."
        />
      </EmptyState>
    );
  }

  return (
    <Box
      sx={{
        border: `1px solid ${border.light}`,
        borderRadius: radiusPx.sm,
        backgroundColor: background.main,
        overflow: "hidden",
      }}
    >
      {deadlineGroups.map((group, index) => {
        const isCollapsed = collapsedSections.has(group.key);
        const isEmpty = group.tasks.length === 0;
        const isUrgent = !isEmpty && (group.key === "overdue" || group.key === "today");
        const urgentTone = group.key === "overdue" ? status.error : status.warning;

        return (
          <Box
            key={group.key}
            sx={{ borderTop: index === 0 ? "none" : `1px solid ${border.light}` }}
          >
            {/* Section header */}
            <Box
              onClick={() => toggleSection(group.key)}
              sx={{
                "display": "flex",
                "alignItems": "center",
                "gap": "8px",
                "padding": "10px 14px",
                "cursor": "pointer",
                "transition": "background-color 0.15s ease",
                "&:hover": { backgroundColor: background.alt },
              }}
            >
              <IconButton
                size="small"
                sx={{ padding: 0 }}
                aria-label={isCollapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                aria-expanded={!isCollapsed}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection(group.key);
                }}
              >
                {isCollapsed ? (
                  <ChevronRight size={16} color={icon.default} />
                ) : (
                  <ChevronDown size={16} color={icon.default} />
                )}
              </IconButton>
              {group.icon}
              <Typography
                sx={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: isEmpty ? text.tertiary : group.color,
                }}
              >
                {group.label}
              </Typography>
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "20px",
                  height: "18px",
                  padding: "0 6px",
                  borderRadius: radiusPx.sm,
                  fontSize: "11px",
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  backgroundColor: isUrgent ? urgentTone.bg : background.hover,
                  color: isUrgent ? urgentTone.text : text.secondary,
                }}
              >
                {group.tasks.length}
              </Box>
            </Box>

            {/* Section content */}
            <Collapse in={!isCollapsed}>
              <Box
                sx={{
                  "borderTop": `1px solid ${border.light}`,
                  // The list frame already draws the outer border.
                  "& table": {
                    border: "none",
                    borderRadius: 0,
                  },
                }}
              >
                {isEmpty ? (
                  <Typography
                    sx={{
                      padding: "12px 14px 12px 38px",
                      color: text.tertiary,
                      fontSize: "13px",
                    }}
                  >
                    No tasks in this time period
                  </Typography>
                ) : (
                  <TasksTable
                    tasks={group.tasks}
                    users={users}
                    onArchive={onArchive}
                    onEdit={onEdit}
                    onStatusChange={onStatusChange}
                    statusOptions={statusOptions}
                    onPriorityChange={onPriorityChange}
                    priorityOptions={priorityOptions}
                    isUpdateDisabled={isUpdateDisabled}
                    onRowClick={onRowClick}
                    hidePagination={true}
                    onRestore={onRestore}
                    onHardDelete={onHardDelete}
                    flashRowId={flashRowId}
                  />
                )}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
};

export default DeadlineView;
