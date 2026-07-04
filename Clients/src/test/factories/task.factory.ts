import type { ITask } from "../../domain/interfaces/i.task";
import { TaskPriority, TaskStatus } from "../../domain/enums/task.enum";

export function buildTask(overrides?: Partial<ITask>): ITask {
  return {
    id: overrides?.id ?? 1,
    title: "Review data processing agreement",
    creator_id: 1,
    priority: TaskPriority.HIGH,
    status: TaskStatus.OPEN,
    due_date: new Date("2025-12-31"),
    assignees: [],
    isOverdue: false,
    categories: ["GDPR"],
    ...overrides,
  };
}

export function buildManyTask(count: number, overrides?: Partial<ITask>): ITask[] {
  return Array.from({ length: count }, (_, i) =>
    buildTask({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
