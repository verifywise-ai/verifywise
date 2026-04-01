/* eslint-disable react-hooks/preserve-manual-memoization */
import React, { useMemo, useState, useEffect } from "react";
import {
  Box,
  Stack,
  Typography,
  Collapse,
  IconButton,
} from "@mui/material";
import { ChevronDown, ChevronRight, Calendar, AlertTriangle, CalendarCheck, ListChecks, Clock, Users } from "lucide-react";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { TaskModel } from "../../../domain/models/Common/task/task.model";
import { TaskStatus } from "../../../domain/enums/task.enum";
import TasksTable from "../../components/Table/TasksTable";
import { EmptyState } from "../../components/EmptyState";
import Chip from "../../components/Chip";
import { DASHBOARD_COLORS, DEADLINE_COLORS } from "../../styles/colors";
import { DeadlineViewProps, DeadlineGroup } from "./types";
import { getEndOfWeek, getEndOfMonth } from "./utils";

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
  const STORAGE_KEY = "verifywise_deadline_collapsed_sections";
  const ALL_SECTIONS = ["overdue", "today", "this-week", "next-week", "this-month", "later", "no-due-date"];

  // Track collapsed sections - load from localStorage or default all collapsed
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch {
        return new Set(ALL_SECTIONS);
      }
    }
    return new Set(ALL_SECTIONS);
  });

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
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
      (task) =>
        task.status !== TaskStatus.COMPLETED &&
        task.status !== TaskStatus.DELETED
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

    return [
      {
        key: "overdue",
        label: "Overdue",
        color: DEADLINE_COLORS.overdue.color,
        bgColor: DEADLINE_COLORS.overdue.bgColor,
        icon: <AlertTriangle size={16} color={DEADLINE_COLORS.overdue.color} />,
        tasks: overdue,
      },
      {
        key: "today",
        label: "Due today",
        color: DEADLINE_COLORS.today.color,
        bgColor: DEADLINE_COLORS.today.bgColor,
        icon: <Calendar size={16} color={DEADLINE_COLORS.today.color} />,
        tasks: dueToday,
      },
      {
        key: "this-week",
        label: "This week",
        color: DEADLINE_COLORS.thisWeek.color,
        bgColor: DEADLINE_COLORS.thisWeek.bgColor,
        icon: <Calendar size={16} color={DEADLINE_COLORS.thisWeek.color} />,
        tasks: thisWeek,
      },
      {
        key: "next-week",
        label: "Next week",
        color: DEADLINE_COLORS.nextWeek.color,
        bgColor: DEADLINE_COLORS.nextWeek.bgColor,
        icon: <Calendar size={16} color={DEADLINE_COLORS.nextWeek.color} />,
        tasks: nextWeek,
      },
      {
        key: "this-month",
        label: "This month",
        color: DEADLINE_COLORS.thisMonth.color,
        bgColor: DEADLINE_COLORS.thisMonth.bgColor,
        icon: <Calendar size={16} color={DEADLINE_COLORS.thisMonth.color} />,
        tasks: thisMonth,
      },
      {
        key: "later",
        label: "Later",
        color: DEADLINE_COLORS.later.color,
        bgColor: DEADLINE_COLORS.later.bgColor,
        icon: <Calendar size={16} color={DEADLINE_COLORS.later.color} />,
        tasks: later,
      },
      {
        key: "no-due-date",
        label: "No due date",
        color: DEADLINE_COLORS.noDueDate.color,
        bgColor: DEADLINE_COLORS.noDueDate.bgColor,
        icon: <Calendar size={16} color={DEADLINE_COLORS.noDueDate.color} />,
        tasks: noDueDate,
      },
    ];
  }, [tasks]);

  // Auto-expand section containing the flashed task (e.g., after due date change)
  useEffect(() => {
    if (flashRowId) {
      // Find which group contains the flashed task
      const groupWithTask = deadlineGroups.find((group) =>
        group.tasks.some((task) => task.id === flashRowId)
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
    <Stack spacing="16px">
      {deadlineGroups.map((group) => {
        const isCollapsed = collapsedSections.has(group.key);

        return (
          <Box
            key={group.key}
            sx={{
              overflow: "hidden",
            }}
          >
            {/* Section Header */}
            <Box
              onClick={() => toggleSection(group.key)}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                backgroundColor: group.bgColor,
                border: `1px solid ${DASHBOARD_COLORS.border}`,
                borderRadius: isCollapsed ? "4px" : "4px 4px 0 0",
                cursor: "pointer",
                "&:hover": {
                  opacity: 0.9,
                },
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <IconButton
                  size="small"
                  sx={{ padding: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection(group.key);
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight size={18} color={DASHBOARD_COLORS.dueLater} />
                  ) : (
                    <ChevronDown size={18} color={DASHBOARD_COLORS.dueLater} />
                  )}
                </IconButton>
                {group.icon}
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    color: group.color,
                    fontSize: "14px",
                  }}
                >
                  {group.label}
                </Typography>
                <Chip
                  label={group.tasks.length.toString()}
                  backgroundColor={group.color}
                  textColor={DASHBOARD_COLORS.white}
                />
              </Stack>
            </Box>

            {/* Section Content */}
            <Collapse in={!isCollapsed}>
              <Box
                sx={{
                  backgroundColor: DASHBOARD_COLORS.backgroundWhite,
                  border: `1px solid ${DASHBOARD_COLORS.border}`,
                  borderTop: "none",
                  borderRadius: "0 0 4px 4px",
                  // Override TasksTable's frame border to prevent double borders
                  "& table": {
                    border: "none",
                    borderRadius: 0,
                  },
                }}
              >
                {group.tasks.length > 0 ? (
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
                ) : (
                  <Typography
                    sx={{
                      padding: "16px",
                      color: DASHBOARD_COLORS.textSecondary,
                      fontSize: "13px",
                      textAlign: "center",
                    }}
                  >
                    No tasks in this time period
                  </Typography>
                )}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );
};

export default DeadlineView;
