import { TaskPriority, TaskStatus } from "../../../domain/enums/task.enum";

export interface MockTaskAssignee {
  user_id: number;
  user_name: string;
  user_avatar?: string;
  assigned_at: string;
}

export interface MockTask {
  id: number;
  title: string;
  description: string;
  creator_id: number;
  organization_id: number;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  categories: string[];
  created_at: string;
  updated_at: string;
  creator_name: string;
  assignees: MockTaskAssignee[];
  isOverdue: boolean;
}

export function createMockTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: 1,
    title: "Complete EU AI Act gap analysis",
    description: "Perform a full gap analysis against EU AI Act requirements",
    creator_id: 1,
    organization_id: 1,
    due_date: "2026-07-15T00:00:00Z",
    priority: TaskPriority.HIGH,
    status: TaskStatus.IN_PROGRESS,
    categories: ["compliance", "eu-ai-act"],
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    creator_name: "John Doe",
    assignees: [
      {
        user_id: 2,
        user_name: "Jane Smith",
        assigned_at: "2026-05-01T00:00:00Z",
      },
    ],
    isOverdue: false,
    ...overrides,
  };
}

export const mockTasks: MockTask[] = [
  createMockTask(),
  createMockTask({
    id: 2,
    title: "Update model inventory documentation",
    description: "Document all AI models in production for the registry",
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.OPEN,
    categories: ["documentation", "models"],
  }),
  createMockTask({
    id: 3,
    title: "Review vendor risk assessments",
    description: "Quarterly review of high-risk vendor assessments",
    priority: TaskPriority.HIGH,
    status: TaskStatus.COMPLETED,
    categories: ["vendors", "risk"],
    due_date: "2026-06-01T00:00:00Z",
    isOverdue: false,
  }),
];
