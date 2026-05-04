import { TaskPriority, TaskStatus } from "../../../../domain/enums/task.enum";
import { ITask } from "../../../../domain/interfaces/i.task";
import { TaskAssigneeDTO, TaskResponseDTO } from "../../../dtos";

const assignee: TaskAssigneeDTO = {
  user_id: 1,
  user_name: "John Doe",
  user_avatar: "https://example.com/avatar.jpg",
  assigned_at: "2024-06-15T10:00:00Z",
};

export class TaskAssigneeBuilder {
  private readonly dto: TaskAssigneeDTO;

  constructor(id: number = 1) {
    this.dto = { ...assignee };
    this.dto.user_id = id;
  }

  withoutAssignedAt(): this {
    this.dto.assigned_at = undefined;
    return this;
  }

  build(): TaskAssigneeDTO {
    return this.dto;
  }
}

const taskResponse: TaskResponseDTO = {
  id: 1,
  title: "Sample Task",
  description: "This is a sample task description.",
  creator_id: 2,
  organization_id: 1,
  due_date: "2024-06-20T12:00:00Z",
  priority: "medium",
  status: "open",
  categories: ["category1", "category2"],
  created_at: "2024-06-10T09:00:00Z",
  updated_at: "2024-06-12T11:00:00Z",
  creator_name: "Jane Smith",
  assignees: [new TaskAssigneeBuilder(1).build(), new TaskAssigneeBuilder(2).build()],
  isOverdue: false,
};

export class TaskResponseBuilder {
  private readonly dto: TaskResponseDTO;

  constructor(id: number = 1) {
    this.dto = { ...taskResponse };
    this.dto.id = id;
  }

  withoutDueDate(): this {
    this.dto.due_date = undefined;
    return this;
  }

  withoutCategories(): this {
    this.dto.categories = undefined;
    return this;
  }

  withoutCreatedAt(): this {
    this.dto.created_at = undefined;
    return this;
  }

  withoutUpdatedAt(): this {
    this.dto.updated_at = undefined;
    return this;
  }

  build(): TaskResponseDTO {
    return this.dto;
  }
}

const iTask: Partial<ITask> = {
  id: 1,
  title: "Sample Task",
  description: "This is a sample task description.",
  creator_id: 2,
  organization_id: 1,
  due_date: new Date("2024-06-20T12:00:00Z"),
  priority: TaskPriority.LOW,
  status: TaskStatus.OVERDUE,
  categories: ["category1", "category2"],
  created_at: new Date("2024-06-10T09:00:00Z"),
  updated_at: new Date("2024-06-12T11:00:00Z"),
  creator_name: "Jane Smith",
  assignees: [
    {
      user_id: 1,
      user_name: "John Doe",
      user_avatar: "https://example.com/avatar.jpg",
      assigned_at: new Date("2024-06-15T10:00:00Z"),
    },
    {
      user_id: 2,
      user_name: "John Doe",
      user_avatar: "https://example.com/avatar.jpg",
      assigned_at: new Date("2024-06-15T10:00:00Z"),
    },
  ],
  isOverdue: false,
};

export class ITaskBuilder {
  private readonly task: Partial<ITask>;

  constructor(id: number = 1) {
    this.task = { ...iTask };
    this.task.id = id;
  }

  withoutTitle(): this {
    this.task.title = undefined;
    return this;
  }

  withoutCreatorId(): this {
    this.task.creator_id = undefined;
    return this;
  }

  withoutPriority(): this {
    this.task.priority = undefined;
    return this;
  }

  withoutStatus(): this {
    this.task.status = undefined;
    return this;
  }

  build(): ITask {
    return this.task as unknown as ITask;
  }
}
