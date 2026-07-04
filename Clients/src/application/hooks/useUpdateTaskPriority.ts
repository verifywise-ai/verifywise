import { updateTaskPriority } from "../repository/task.repository";
import { taskQueryKeys } from "./useTasks";
import { useOptimisticListMutation } from "./utils/optimisticMutation";
import type { ITask } from "../../domain/interfaces/i.task";
import { TaskPriority } from "../../domain/enums/task.enum";

export interface UpdateTaskPriorityVariables {
  id: number;
  priority: TaskPriority;
  filters?: { includeArchived?: boolean };
}

export function useUpdateTaskPriority() {
  return useOptimisticListMutation<ITask, unknown, Error, UpdateTaskPriorityVariables>({
    mutationFn: ({ id, priority }) => updateTaskPriority({ id, priority }),
    queryKey: ({ filters }) => taskQueryKeys.list(filters || {}),
    updateItem:
      ({ id, priority }) =>
      (task) =>
        task.id === id ? { ...task, priority } : task,
  });
}
