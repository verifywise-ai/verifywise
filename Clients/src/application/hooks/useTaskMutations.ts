/**
 * @fileoverview Consolidated task mutations with optimistic updates.
 *
 * Each mutation patches every cached `taskQueryKeys` list variant via prefix
 * matching, replaces the optimistic item with the authoritative server entity
 * on success (no list refetch), rolls back on error, and invalidates only the
 * server-computed derived queries (["deadlineWarnings"], ["dashboard"]).
 *
 * @module application/hooks/useTaskMutations
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createTask, updateTask, deleteTask } from "../repository/task.repository";
import { taskQueryKeys } from "./useTasks";
import { showMutationErrorToast } from "./utils/mutationErrorToast";
import type { ITask } from "../../domain/interfaces/i.task";
import { TaskStatus } from "../../domain/enums/task.enum";

// Re-export the per-field optimistic hooks so task mutations are reachable
// from a single module.
export { useUpdateTaskStatus } from "./useUpdateTaskStatus";
export { useUpdateTaskPriority } from "./useUpdateTaskPriority";

// The task repository returns the response body ({ message, data: <entity> }),
// so the authoritative entity lives on `.data`.
function extractTaskEntity(response: any): ITask | undefined {
  const entity = response?.data;
  return entity && typeof entity === "object" ? (entity as ITask) : undefined;
}

type ListSnapshot = [readonly unknown[], ITask[]][];

/**
 * Snapshots every cached ["tasks"] list variant and applies `updater` to each.
 * `updater` receives the list and the filters object embedded in the query key
 * (taskQueryKeys.list(filters)) so behavior can vary per variant.
 */
function patchTaskLists(
  queryClient: QueryClient,
  updater: (list: ITask[], filters: { includeArchived?: boolean }) => ITask[],
): ListSnapshot {
  const matches = queryClient.getQueriesData<ITask[]>({ queryKey: taskQueryKeys.all });
  const snapshots: ListSnapshot = [];
  for (const [queryKey, data] of matches) {
    if (!Array.isArray(data)) continue;
    snapshots.push([queryKey, data]);
    const filters = (queryKey[2] ?? {}) as { includeArchived?: boolean };
    queryClient.setQueryData<ITask[]>(queryKey, updater(data, filters));
  }
  return snapshots;
}

function restoreTaskLists(queryClient: QueryClient, snapshots: ListSnapshot | undefined): void {
  if (!snapshots) return;
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

const DERIVED_TASK_KEYS: readonly (readonly unknown[])[] = [["deadlineWarnings"], ["dashboard"]];

export interface CreateTaskVariables {
  body: Partial<ITask>;
}

export interface UpdateTaskVariables {
  id: number;
  body: Partial<ITask>;
}

export interface ArchiveTaskVariables {
  id: number;
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body }: CreateTaskVariables) => createTask({ body }),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey: taskQueryKeys.all });
      // Placeholder id until the server assigns the real one.
      const tempId = -Date.now();
      const optimisticTask = {
        status: TaskStatus.OPEN,
        ...body,
        id: tempId,
      } as ITask;
      const snapshots = patchTaskLists(queryClient, (list) => [optimisticTask, ...list]);
      return { snapshots, tempId };
    },
    onSuccess: (response, _variables, context) => {
      const entity = extractTaskEntity(response);
      if (entity) {
        patchTaskLists(queryClient, (list) =>
          // Keep client-only fields (e.g. entity_links) from the optimistic item.
          list.map((task) => (task.id === context?.tempId ? { ...task, ...entity } : task)),
        );
      }
      DERIVED_TASK_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    },
    onError: (error, _variables, context) => {
      restoreTaskLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to create the task. Please try again.");
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: UpdateTaskVariables) => updateTask({ id, body }),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: taskQueryKeys.all });
      const snapshots = patchTaskLists(queryClient, (list) =>
        list.map((task) => (task.id === id ? ({ ...task, ...body } as ITask) : task)),
      );
      return { snapshots, id };
    },
    onSuccess: (response, _variables, context) => {
      const entity = extractTaskEntity(response);
      if (entity) {
        patchTaskLists(queryClient, (list) =>
          // Merge over the optimistic item so client-only fields survive.
          list.map((task) => (task.id === context?.id ? { ...task, ...entity } : task)),
        );
      }
      DERIVED_TASK_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    },
    onError: (error, _variables, context) => {
      restoreTaskLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to update the task. Please try again.");
    },
  });
}

export function useArchiveTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: ArchiveTaskVariables) => deleteTask({ id }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: taskQueryKeys.all });
      const snapshots = patchTaskLists(queryClient, (list, filters) =>
        // Archived tasks only belong in variants that include them.
        filters.includeArchived
          ? list.map((task) => (task.id === id ? { ...task, status: TaskStatus.DELETED } : task))
          : list.filter((task) => task.id !== id),
      );
      return { snapshots, id };
    },
    onSuccess: (response, _variables, context) => {
      const entity = extractTaskEntity(response);
      if (entity) {
        patchTaskLists(queryClient, (list) =>
          list.map((task) => (task.id === context?.id ? { ...task, ...entity } : task)),
        );
      }
      DERIVED_TASK_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    },
    onError: (error, _variables, context) => {
      restoreTaskLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to archive the task. Please try again.");
    },
  });
}
