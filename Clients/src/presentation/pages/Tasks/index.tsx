/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useContext, useMemo, useCallback, useRef } from "react";
import { Box, Stack, Typography, Fade } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { useSearchParams } from "react-router-dom";
import { CirclePlus as AddCircleIcon, Flag } from "lucide-react";
import { SearchBox } from "../../components/Search";
import TasksTable from "../../components/Table/TasksTable";
import { CustomizableButton } from "../../components/button/customizable-button";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import { ITask, TaskSummary } from "../../../domain/interfaces/i.task";
import {
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  getTaskById,
  restoreTask,
  hardDeleteTask,
  updateTaskPriority,
} from "../../../application/repository/task.repository";
import {
  addTaskEntityLink,
  removeTaskEntityLink,
  getTaskEntityLinks,
} from "../../../application/repository/taskEntityLink.repository";
import TaskSummaryCards from "./TaskSummaryCards";
import CreateTask from "../../components/Modals/CreateTask";
import useUsers from "../../../application/hooks/useUsers";

import Toggle from "../../components/Inputs/Toggle";
import { TaskPriority, TaskStatus } from "../../../domain/enums/task.enum";
import PageTour from "../../components/PageTour";
import TasksSteps from "./TasksSteps";
import { TaskModel } from "../../../domain/models/Common/task/task.model";
import { onAiActionCompleted } from "../../../application/events/aiActionEvents";
import { GroupBy } from "../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { ExportMenu } from "../../components/Table/ExportMenu";
import { ColumnSelector } from "../../components/Table/ColumnSelector";

import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import { displayFormattedDate } from "../../tools/isoDateToString";
import Alert from "../../components/Alert";
import TabBar from "../../components/TabBar";
import DeadlineView from "./DeadlineView";
import { toggleLabelStyle, toggleContainerStyle } from "./style";
import {
  TASK_PRIORITY_OPTIONS,
  PRIORITY_DISPLAY_MAP,
  PRIORITY_COLOR_MAP,
} from "../../constants/priorityOptions";

// Task status options for CustomSelect
const TASK_STATUS_OPTIONS = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED];

// Status display mapping
const STATUS_DISPLAY_MAP: Record<string, string> = {
  [TaskStatus.OPEN]: "Open",
  [TaskStatus.IN_PROGRESS]: "In progress", // Show lowercase in UI
  [TaskStatus.COMPLETED]: "Completed",
  [TaskStatus.OVERDUE]: "Overdue",
  [TaskStatus.DELETED]: "Archived", // Show "Archived" instead of "Deleted" for better UX
};

type TaskColumnKey = "title" | "priority" | "status" | "due_date" | "assignees" | "actions";

const TASKS_TABLE_COLUMNS: ColumnConfig<TaskColumnKey>[] = [
  { key: "title", label: "Task", defaultVisible: true, alwaysVisible: true },
  { key: "priority", label: "Priority", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "due_date", label: "Due date", defaultVisible: true },
  { key: "assignees", label: "Assignees", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const Tasks: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<TaskModel[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ITask | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "warning" | "info";
    title: string;
    body?: string;
  } | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  // Flash indicator state for updated rows
  const [flashRowId, setFlashRowId] = useState<number | null>(null);

  // Admin toggle for "My Tasks" vs "Team Tasks"
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);

  // Card filter state for status filtering
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  // Tab state - persisted to localStorage
  const [activeTab, setActiveTab] = useState<string>(() => {
    const saved = localStorage.getItem("verifywise_tasks_view_tab");
    return saved || "list";
  });

  // Save tab preference to localStorage
  useEffect(() => {
    localStorage.setItem("verifywise_tasks_view_tab", activeTab);
  }, [activeTab]);

  const { userRoleName, userId } = useContext(VerifyWiseContext);
  const { users } = useUsers();

  // Track if we've already processed the URL param to avoid duplicate fetches
  const hasProcessedUrlParam = useRef(false);

  // Group by state management
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();
  const isCreatingDisabled = !userRoleName || !["Admin", "Editor"].includes(userRoleName);

  // Column visibility for the tasks table
  const {
    visibleColumns,
    allColumns: allTaskColumns,
    toggleColumn: toggleTaskColumn,
    resetToDefaults: resetTaskColumns,
  } = useColumnVisibility({
    tableId: "tasks-table",
    columns: TASKS_TABLE_COLUMNS,
  });

  // Calculate summary from tasks data
  const summary: TaskSummary = useMemo(
    () => ({
      total: tasks.length,
      open: tasks.filter((task) => task.status === "Open").length,
      inProgress: tasks.filter(
        (task) =>
          (task.status as string) === "In Progress" || // API response
          (task.status as string) === "In progress", // UI display
      ).length,
      completed: tasks.filter((task) => task.status === "Completed").length,
      overdue: tasks.filter((task) => task.isOverdue === true).length,
    }),
    [tasks],
  );

  // Fetch all tasks (no server-side filtering - we use client-side FilterBy)
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await getAllTasks({
          include_archived: includeArchived || undefined,
          sort_by: "created_at",
          sort_order: "DESC",
        });

        const fetchedTasks = response?.data?.tasks || [];
        setTasks(fetchedTasks);
      } catch (err: any) {
        console.error("Error fetching tasks:", err);
        setError("Failed to load tasks. Please try again later.");
        setTasks([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTasks();
  }, [includeArchived, refreshKey]);

  // Listen for AI action approvals (e.g. agent_create_task). When an
  // approval is granted in the RequestorApprovalModal, the executor runs
  // inside the approve transaction so the new task row already exists by
  // the time the event fires — bumping refreshKey is enough to pull it in.
  useEffect(() => {
    return onAiActionCompleted((detail) => {
      if (detail?.status === "approved" && detail?.toolName === "agent_create_task") {
        setRefreshKey((k) => k + 1);
      }
    });
  }, []);

  // Handle taskId URL param to open edit modal from Wise Search
  useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (taskId && !hasProcessedUrlParam.current && !isLoading) {
      hasProcessedUrlParam.current = true;

      // First check if task is already in the loaded list
      const existingTask = tasks.find((t) => t.id === parseInt(taskId, 10));
      if (existingTask) {
        setEditingTask(existingTask);
        // Clear the URL param after opening modal
        setSearchParams({}, { replace: true });
      } else {
        // Fetch the task if not in list (might be archived)
        getTaskById({ id: taskId })
          .then((response) => {
            if (response?.data) {
              setEditingTask(response.data);
              setSearchParams({}, { replace: true });
            }
          })
          .catch((err) => {
            console.error("Error fetching task from URL param:", err);
            setSearchParams({}, { replace: true });
          });
      }
    }
  }, [searchParams, tasks, isLoading, setSearchParams]);

  // FilterBy - Dynamic options generators
  const getUniqueAssignees = useCallback(() => {
    const assigneeIds = new Set<number>();
    tasks.forEach((task) => {
      if (task.assignees && task.assignees.length > 0) {
        task.assignees.forEach((id) => assigneeIds.add(Number(id)));
      }
    });
    return Array.from(assigneeIds)
      .map((id) => {
        const user = users.find((u) => u.id === id);
        return {
          value: String(id),
          label: user ? `${user.name} ${user.surname}`.trim() : `User ${id}`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, users]);

  // FilterBy - Filter columns configuration
  const taskFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "title",
        label: "Title",
        type: "text" as const,
      },
      {
        id: "status",
        label: "Status",
        type: "select" as const,
        options: Object.values(TaskStatus).map((status) => ({
          value: status,
          label: STATUS_DISPLAY_MAP[status] || status,
        })),
      },
      {
        id: "priority",
        label: "Priority",
        type: "select" as const,
        options: Object.values(TaskPriority).map((priority) => ({
          value: priority,
          label: priority,
        })),
      },
      {
        id: "assignee",
        label: "Assignee",
        type: "select" as const,
        options: getUniqueAssignees(),
      },
      {
        id: "due_date",
        label: "Due date",
        type: "date" as const,
      },
    ],
    [getUniqueAssignees],
  );

  // FilterBy - Field value getter
  const getTaskFieldValue = useCallback(
    (item: TaskModel, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "title":
          return item.title;
        case "status":
          return item.status;
        case "priority":
          return item.priority;
        case "assignee":
          // Return comma-separated assignee IDs for matching
          return item.assignees?.map((id) => String(id)).join(",");
        case "due_date":
          return item.due_date;
        default:
          return null;
      }
    },
    [],
  );

  // FilterBy - Initialize hook
  const { filterData: filterTaskData, handleFilterChange: handleTaskFilterChange } =
    useFilterBy<TaskModel>(getTaskFieldValue);

  // Apply FilterBy and search filtering
  const filteredTasks = useMemo(() => {
    // Stage 1: Apply FilterBy conditions
    let result = filterTaskData(tasks);

    // Stage 2: Apply card filter for status
    if (selectedStatus) {
      result = result.filter((task) => {
        switch (selectedStatus) {
          case "open":
            return task.status === "Open";
          case "inProgress":
            return task.status === TaskStatus.IN_PROGRESS;
          case "completed":
            return task.status === "Completed";
          case "overdue":
            return task.isOverdue === true;
          default:
            return true;
        }
      });
    }

    // Stage 3: Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((task) => task.title?.toLowerCase().includes(query));
    }

    // Stage 4: Apply "My Tasks" filter for Admin users
    if (userRoleName === "Admin" && showMyTasksOnly && userId) {
      result = result.filter(
        (task) =>
          task.creator_id === userId ||
          (task.assignees && task.assignees.some((a) => a.user_id === userId)),
      );
    }

    return result;
  }, [filterTaskData, tasks, selectedStatus, searchQuery, userRoleName, showMyTasksOnly, userId]);

  const handleCreateTask = () => {
    if (isCreatingDisabled) {
      return;
    }
    setIsCreateTaskModalOpen(true);
  };

  const handleTaskCreated = async (formData: any) => {
    try {
      // Extract entity_links - we'll pass them to the API for notification purposes
      // but also sync them separately after creation
      const { entity_links, ...taskData } = formData;

      const response = await createTask({
        body: {
          ...taskData,
          // Include entity_links for notification email (backend uses these immediately)
          entity_links: entity_links || [],
        },
      });
      if (response && response.data) {
        const newTaskId = response.data.id;

        // Save entity links if any
        if (entity_links && entity_links.length > 0 && newTaskId) {
          try {
            for (const link of entity_links) {
              await addTaskEntityLink(
                newTaskId,
                link.entity_id,
                link.entity_type,
                link.entity_name,
              );
            }
          } catch (linkError) {
            console.error("Error saving entity links:", linkError);
            // Don't fail the whole operation, just log the error
          }
        }

        // Add the new task to the list
        setTasks((prev) => [response.data, ...prev]);
        setAlert({
          variant: "success",
          title: "Task created successfully",
          body: "Your new task has been added.",
        });
        setTimeout(() => setAlert(null), 4000);
      }
    } catch (error) {
      console.error("Error creating task:", error);
      setAlert({
        variant: "error",
        title: "Error creating task",
        body: "Failed to create the task. Please try again.",
      });
      setTimeout(() => setAlert(null), 4000);
    }
  };

  const handleEditTask = (task: ITask) => {
    setEditingTask(task);
  };

  // Archive handler - called from IconButton's modal confirmation
  const handleArchiveTask = async (taskId: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      await deleteTask({ id: taskId });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setAlert({
        variant: "success",
        title: "Task archived successfully",
        body: `"${task.title}" has been archived.`,
      });
      setTimeout(() => setAlert(null), 4000);
    } catch (error) {
      console.error("Error archiving task:", error);
      setAlert({
        variant: "error",
        title: "Error archiving task",
        body: "Failed to archive the task. Please try again.",
      });
      setTimeout(() => setAlert(null), 4000);
    }
  };

  const handleUpdateTask = async (formData: any) => {
    if (!editingTask) return;

    try {
      // Extract entity_links - we'll pass them to the API for notification purposes
      // but also sync them separately after the update
      const { entity_links: newEntityLinks, ...taskData } = formData;

      const response = await updateTask({
        id: editingTask.id!,
        body: {
          ...taskData,
          // Include entity_links for notification email (backend uses these immediately)
          entity_links: newEntityLinks || [],
        },
      });
      if (response && response.data) {
        // Sync entity links: get existing, compare, remove old, add new
        if (newEntityLinks) {
          try {
            const existingLinks = await getTaskEntityLinks(editingTask.id!);

            // Find links to remove (in existing but not in new)
            const linksToRemove = existingLinks.filter(
              (existing) =>
                !newEntityLinks.some(
                  (newLink: any) =>
                    newLink.entity_id === existing.entity_id &&
                    newLink.entity_type === existing.entity_type,
                ),
            );

            // Find links to add (in new but not in existing)
            const linksToAdd = newEntityLinks.filter(
              (newLink: any) =>
                !existingLinks.some(
                  (existing) =>
                    existing.entity_id === newLink.entity_id &&
                    existing.entity_type === newLink.entity_type,
                ),
            );

            // Remove old links
            for (const link of linksToRemove) {
              await removeTaskEntityLink(editingTask.id!, link.id);
            }

            // Add new links
            for (const link of linksToAdd) {
              await addTaskEntityLink(
                editingTask.id!,
                link.entity_id,
                link.entity_type,
                link.entity_name,
              );
            }
          } catch (linkError) {
            console.error("Error syncing entity links:", linkError);
            // Don't fail the whole operation, just log the error
          }
        }

        // Update task in state with new entity links
        const updatedTaskWithLinks = {
          ...response.data,
          entity_links: newEntityLinks || [],
        };

        setTasks((prev) =>
          prev.map((task) => (task.id === editingTask.id ? updatedTaskWithLinks : task)),
        );

        // Flash the updated row
        setFlashRowId(editingTask.id!);
        setTimeout(() => {
          setFlashRowId(null);
        }, 3000);

        setEditingTask(null);
        setAlert({
          variant: "success",
          title: "Task updated successfully",
          body: "Your changes have been saved.",
        });
        setTimeout(() => setAlert(null), 4000);
      }
    } catch (error) {
      console.error("Error updating task:", error);
      setAlert({
        variant: "error",
        title: "Error updating task",
        body: "Failed to update the task. Please try again.",
      });
      setTimeout(() => setAlert(null), 4000);
    }
  };

  const handleTaskStatusChange =
    (taskId: number) =>
    async (newStatus: string): Promise<boolean> => {
      try {
        const response = await updateTaskStatus({
          id: taskId,
          status: newStatus as TaskStatus,
        });
        if (response && response.data) {
          setTasks((prev) =>
            prev.map((task) =>
              task.id === taskId ? { ...task, status: newStatus as TaskStatus } : task,
            ),
          );

          // Flash the updated row
          setFlashRowId(taskId);
          setTimeout(() => {
            setFlashRowId(null);
          }, 3000);

          return true;
        }
        return false;
      } catch (error) {
        console.error("Error updating task status:", error);
        return false;
      }
    };

  const handleTaskPriorityChange =
    (taskId: number) =>
    async (newPriority: string): Promise<boolean> => {
      try {
        const response = await updateTaskPriority({
          id: taskId,
          priority: newPriority as TaskPriority,
        });
        if (response && response.data) {
          setTasks((prev) =>
            prev.map((task) =>
              task.id === taskId ? { ...task, priority: newPriority as TaskPriority } : task,
            ),
          );

          // Flash the updated row
          setFlashRowId(taskId);
          setTimeout(() => {
            setFlashRowId(null);
          }, 3000);

          return true;
        }
        return false;
      } catch (error) {
        console.error("Error updating task priority:", error);
        return false;
      }
    };

  const handleRestoreTask = async (taskId: number) => {
    try {
      const response = await restoreTask({ id: taskId });
      // Repository returns response.data directly, so check for response.data (the actual task)
      if (response?.data) {
        const restoredTask = response.data;
        // Update the task in the list with restored status
        setTasks((prev) =>
          prev.map((task) => (task.id === taskId ? { ...task, status: TaskStatus.OPEN } : task)),
        );
        setAlert({
          variant: "success",
          title: "Task restored successfully",
          body: `"${restoredTask.title}" has been restored.`,
        });
        setTimeout(() => setAlert(null), 4000);
      }
    } catch (error) {
      console.error("Error restoring task:", error);
      setAlert({
        variant: "error",
        title: "Error restoring task",
        body: "Failed to restore the task. Please try again.",
      });
      setTimeout(() => setAlert(null), 4000);
    }
  };

  const handleHardDeleteTask = async (taskId: number) => {
    const taskToHardDelete = tasks.find((t) => t.id === taskId);
    try {
      await hardDeleteTask({ id: taskId });
      // Remove the task from the list completely
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
      setAlert({
        variant: "success",
        title: "Task deleted permanently",
        body: `"${taskToHardDelete?.title}" has been permanently deleted.`,
      });
      setTimeout(() => setAlert(null), 4000);
    } catch (error) {
      console.error("Error permanently deleting task:", error);
      setAlert({
        variant: "error",
        title: "Error deleting task",
        body: "Failed to delete the task. Please try again.",
      });
      setTimeout(() => setAlert(null), 4000);
    }
  };

  // Handle status card click for filtering
  const handleStatusCardClick = useCallback(
    (statusKey: string) => {
      if (statusKey === "total" || selectedStatus === statusKey) {
        setSelectedStatus(null);
        setAlert(null);
        setShowAlert(false);
      } else {
        setSelectedStatus(statusKey);
        const labelMap: Record<string, string> = {
          open: "Open",
          inProgress: "In Progress",
          completed: "Completed",
          overdue: "Overdue",
        };
        setAlert({
          variant: "info",
          title: `Filtering by ${labelMap[statusKey]} tasks`,
          body: "Click the card again or click Total to see all tasks.",
        });
      }
    },
    [selectedStatus],
  );

  // Auto-dismiss info alert after 3 seconds with fade animation
  useEffect(() => {
    if (alert && alert.variant === "info") {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Define how to get the group key for each task
  const getTaskGroupKey = (task: TaskModel, field: string): string | string[] => {
    switch (field) {
      case "status":
        return STATUS_DISPLAY_MAP[task.status as TaskStatus] || task.status || "Unknown";
      case "priority":
        return task.priority || "No Priority";
      case "assignees":
        if (task.assignees && task.assignees.length > 0) {
          // Return array of assignee names - task will appear in multiple groups
          return task.assignees.map((assigneeId) => {
            const user = users.find((u) => u.id === Number(assigneeId));
            return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
          });
        }
        return "Unassigned";
      case "due_date":
        return task.due_date ? displayFormattedDate(task.due_date) : "No Due Date";
      default:
        return "Other";
    }
  };

  // Use the reusable grouping hook
  const groupedTasks = useTableGrouping({
    data: filteredTasks,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getTaskGroupKey,
  });

  // Export columns and data
  const exportColumns = useMemo(() => {
    return [
      { id: "title", label: "Title" },
      { id: "status", label: "Status" },
      { id: "priority", label: "Priority" },
      { id: "assignees", label: "Assignees" },
      { id: "due_date", label: "Due date" },
      { id: "creator", label: "Creator" },
      { id: "categories", label: "Categories" },
    ];
  }, []);

  const exportData = useMemo(() => {
    return filteredTasks.map((task: TaskModel) => {
      // Look up assignee names from user IDs
      const assigneeNames =
        task.assignees && task.assignees.length > 0
          ? task.assignees
              .map((assigneeId) => {
                const user = users.find((u) => u.id === Number(assigneeId));
                return user ? `${user.name} ${user.surname}`.trim() : null;
              })
              .filter(Boolean)
              .join(", ") || "Unassigned"
          : "Unassigned";

      // Look up creator name from creator_id
      const creatorUser = users.find((u) => u.id === task.creator_id);
      const creatorName = creatorUser ? `${creatorUser.name} ${creatorUser.surname}`.trim() : "-";

      return {
        title: task.title || "-",
        status: STATUS_DISPLAY_MAP[task.status as TaskStatus] || task.status || "-",
        priority: task.priority || "-",
        assignees: assigneeNames,
        due_date: task.due_date ? displayFormattedDate(task.due_date) : "-",
        creator: creatorName,
        categories: task.categories?.join(", ") || "-",
      };
    });
  }, [filteredTasks, users]);

  return (
    <PageHeaderExtended
      title="Task management"
      description={
        userRoleName === "Admin"
          ? showMyTasksOnly
            ? "Showing tasks you created or are assigned to. You can create and manage your tasks here."
            : "Showing all tasks in your organization. You can create and manage tasks here."
          : "Showing tasks you created or are assigned to. You can create and manage your tasks here."
      }
      helpArticlePath="ai-governance/task-management"
      tipBoxEntity="tasks"
      summaryCards={
        <TaskSummaryCards
          summary={summary}
          onCardClick={handleStatusCardClick}
          selectedStatus={selectedStatus}
        />
      }
      summaryCardsJoyrideId="task-summary-cards"
      alert={
        alert ? (
          <Fade in={showAlert} timeout={300}>
            <Box sx={{ position: "fixed" }}>
              <Alert
                variant={alert.variant}
                title={alert.title}
                body={alert.body || ""}
                isToast={true}
                onClick={() => {
                  setShowAlert(false);
                  setTimeout(() => setAlert(null), 300);
                }}
              />
            </Box>
          </Fade>
        ) : undefined
      }
    >
      {/* Tab Navigation */}
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
            {
              label: "List view",
              value: "list",
              icon: "List",
              tooltip: "Tasks in a filterable table",
            },
            {
              label: "Deadline view",
              value: "deadline",
              icon: "Calendar",
              tooltip: "Tasks organized by due date",
            },
          ]}
          activeTab={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          dataJoyrideId="task-view-tabs"
        />
      </TabContext>

      {/* Filter Controls - Only show for List view */}
      {activeTab === "list" && (
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ flexWrap: "wrap", rowGap: "8px" }}
        >
          <Stack
            direction="row"
            gap="8px"
            alignItems="center"
            sx={{ flexWrap: "wrap", rowGap: "8px" }}
          >
            {/* FilterBy */}
            <Box data-joyride-id="task-filters">
              <FilterBy columns={taskFilterColumns} onFilterChange={handleTaskFilterChange} />
            </Box>

            {/* GroupBy */}
            <GroupBy
              options={[
                { id: "status", label: "Status" },
                { id: "priority", label: "Priority" },
                { id: "assignees", label: "Assignees" },
                { id: "due_date", label: "Due date" },
              ]}
              onGroupChange={handleGroupChange}
            />

            <ColumnSelector
              columns={allTaskColumns}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleTaskColumn}
              onResetToDefaults={resetTaskColumns}
            />

            {/* SearchBox */}
            <Box data-joyride-id="task-search">
              <SearchBox
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={setSearchQuery}
                inputProps={{ "aria-label": "Search tasks" }}
                fullWidth={false}
              />
            </Box>

            {/* Toggles group with 16px spacing */}
            <Stack direction="row" gap="16px" alignItems="center" sx={{ ml: "8px" }}>
              {/* My Tasks toggle - Admin only */}
              {userRoleName === "Admin" && (
                <Stack sx={toggleContainerStyle} data-joyride-id="my-tasks-toggle">
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                    sx={toggleLabelStyle}
                  >
                    My tasks only
                  </Typography>
                  <Toggle
                    checked={showMyTasksOnly}
                    onChange={(_, checked) => setShowMyTasksOnly(checked)}
                  />
                </Stack>
              )}

              {/* Include archived toggle */}
              <Stack sx={toggleContainerStyle} data-joyride-id="include-archived-toggle">
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                  sx={toggleLabelStyle}
                >
                  Include archived
                </Typography>
                <Toggle
                  checked={includeArchived}
                  onChange={(_, checked) => setIncludeArchived(checked)}
                />
              </Stack>
            </Stack>
          </Stack>

          {/* Right side: Export and Add button */}
          <Stack
            direction="row"
            gap="8px"
            alignItems="center"
            data-joyride-id="add-task-button"
            sx={{ flexShrink: 0 }}
          >
            <ExportMenu
              data={exportData}
              columns={exportColumns}
              filename="tasks"
              title="Task Management"
            />
            <CustomizableButton
              variant="contained"
              text="Add new task"
              sx={{
                backgroundColor: "brand.primary",
                border: "1px solid brand.primary",
                gap: 2,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              icon={<AddCircleIcon size={16} />}
              onClick={handleCreateTask}
              isDisabled={isCreatingDisabled}
            />
          </Stack>
        </Stack>
      )}

      {/* Content Area */}
      <Box>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <Typography>Loading tasks...</Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {!isLoading && !error && activeTab === "list" && (
          <GroupedTableView
            groupedData={groupedTasks}
            ungroupedData={filteredTasks}
            renderTable={(data, options) => (
              <TasksTable
                tasks={data}
                users={users}
                onArchive={handleArchiveTask}
                onEdit={handleEditTask}
                onStatusChange={handleTaskStatusChange}
                statusOptions={TASK_STATUS_OPTIONS.map((status) => {
                  const displayStatus = STATUS_DISPLAY_MAP[status as TaskStatus] || status;
                  return displayStatus;
                })}
                onPriorityChange={handleTaskPriorityChange}
                priorityOptions={TASK_PRIORITY_OPTIONS.map((priority) => {
                  const displayPriority =
                    PRIORITY_DISPLAY_MAP[priority as TaskPriority] || priority;
                  return {
                    value: priority,
                    label: displayPriority,
                    icon: Flag,
                    color: PRIORITY_COLOR_MAP[priority as TaskPriority],
                  };
                })}
                isUpdateDisabled={isCreatingDisabled}
                onRowClick={handleEditTask}
                hidePagination={options?.hidePagination}
                onRestore={handleRestoreTask}
                onHardDelete={handleHardDeleteTask}
                flashRowId={flashRowId}
                visibleColumns={visibleColumns}
                canRunBulkActions={!isCreatingDisabled}
                onBulkActionSuccess={(action, count) => {
                  setRefreshKey((k) => k + 1);
                  setAlert({
                    variant: "success",
                    title:
                      action === "mark_complete"
                        ? `${count} task${count === 1 ? "" : "s"} marked complete`
                        : `Categories updated on ${count} task${count === 1 ? "" : "s"}`,
                  });
                  setTimeout(() => setAlert(null), 4000);
                }}
              />
            )}
          />
        )}

        {!isLoading && !error && activeTab === "deadline" && (
          <DeadlineView
            tasks={filteredTasks}
            users={users}
            onArchive={handleArchiveTask}
            onEdit={handleEditTask}
            onStatusChange={handleTaskStatusChange}
            statusOptions={TASK_STATUS_OPTIONS.map((status) => {
              const displayStatus = STATUS_DISPLAY_MAP[status as TaskStatus] || status;
              return displayStatus;
            })}
            onPriorityChange={handleTaskPriorityChange}
            priorityOptions={TASK_PRIORITY_OPTIONS.map((priority) => {
              const displayPriority = PRIORITY_DISPLAY_MAP[priority as TaskPriority] || priority;
              return {
                value: priority,
                label: displayPriority,
                icon: Flag,
                color: PRIORITY_COLOR_MAP[priority as TaskPriority],
              };
            })}
            isUpdateDisabled={isCreatingDisabled}
            onRowClick={handleEditTask}
            onRestore={handleRestoreTask}
            onHardDelete={handleHardDeleteTask}
            flashRowId={flashRowId}
          />
        )}
      </Box>

      {/* Create Task Modal */}
      <CreateTask
        isOpen={isCreateTaskModalOpen}
        setIsOpen={setIsCreateTaskModalOpen}
        onSuccess={handleTaskCreated}
      />

      {/* Edit Task Modal */}
      {editingTask && (
        <CreateTask
          isOpen={!!editingTask}
          setIsOpen={(open) => !open && setEditingTask(null)}
          onSuccess={handleUpdateTask}
          initialData={editingTask}
          mode="edit"
        />
      )}

      {/* Hard Delete Confirmation Dialog */}
      {/* Archive is handled by IconButton component to avoid double modals */}
      {/* Hard delete needs a second confirmation in Tasks page */}

      {/* Page Tour */}
      <PageTour steps={TasksSteps} run={activeTab === "list"} tourKey="tasks-tour" />
    </PageHeaderExtended>
  );
};

export default Tasks;
