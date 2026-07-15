import { updateTaskStatus } from "../repository/task.repository";
import { taskQueryKeys } from "./useTasks";
import { useOptimisticListMutation } from "./utils/optimisticMutation";
import type { ITask } from "../../domain/interfaces/i.task";
import { TaskStatus } from "../../domain/enums/task.enum";

export interface UpdateTaskStatusVariables {
  id: number;
  status: TaskStatus;
  filters?: { includeArchived?: boolean };
}

export function useUpdateTaskStatus() {
  return useOptimisticListMutation<ITask, unknown, Error, UpdateTaskStatusVariables>({
    mutationFn: ({ id, status }) => updateTaskStatus({ id, status }),
    queryKey: ({ filters }) => taskQueryKeys.list(filters || {}),
    updateItem:
      ({ id, status }) =>
      (task) =>
        task.id === id ? { ...task, status } : task,
  });
}
