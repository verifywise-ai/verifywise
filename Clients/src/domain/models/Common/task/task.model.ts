import { TaskPriority, TaskStatus } from "../../../enums/task.enum";
import { ITask, ITaskAssignee } from "../../../interfaces/i.task";

export class TaskModel implements ITask {
  id?: number;
  title: string;
  description?: string;
  creator_id: number;
  organization_id?: number;
  due_date?: Date;
  priority: TaskPriority;
  status: TaskStatus;
  categories?: string[];
  created_at?: Date;
  updated_at?: Date;
  creator_name?: string;
  assignees?: ITaskAssignee[];
  isOverdue?: boolean;

  constructor(data?: Partial<ITask>) {
    this.id = data?.id;
    this.title = data?.title ?? "";
    this.description = data?.description ?? "";
    this.creator_id = data?.creator_id ?? 0;
    this.organization_id = data?.organization_id;
    this.due_date = data?.due_date;
    this.priority = data?.priority ?? TaskPriority.MEDIUM;
    this.status = data?.status ?? TaskStatus.OPEN;
    this.categories = data?.categories ?? [];
    this.created_at = data?.created_at ?? new Date();
    this.updated_at = data?.updated_at ?? new Date();
    this.creator_name = data?.creator_name ?? "";
    this.assignees = data?.assignees ?? [];
    this.isOverdue = data?.isOverdue ?? false;
  }
  static createTask(data: TaskModel): TaskModel {
    return new TaskModel(data);
  }
}

export class TaskAssigneeModel implements ITaskAssignee {
  user_id: number;
  user_name: string;
  user_avatar?: string;
  assigned_at?: Date;

  constructor(data?: Partial<ITaskAssignee>) {
    this.user_id = data?.user_id ?? 0;
    this.user_name = data?.user_name ?? "";
    this.user_avatar = data?.user_avatar;
    this.assigned_at = data?.assigned_at ?? new Date();
  }
  static createAssignee(data: Partial<ITaskAssignee>): TaskAssigneeModel {
    return new TaskAssigneeModel(data);
  }
}
