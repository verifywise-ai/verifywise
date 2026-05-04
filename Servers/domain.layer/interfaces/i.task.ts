import { TaskPriority } from "../enums/task-priority.enum";
import { TaskStatus } from "../enums/task-status.enum";

export interface ITask {
  id?: number;
  title: string;
  description?: string;
  creator_id: number;
  organization_id?: number;
  due_date?: Date;
  priority: TaskPriority;
  status: TaskStatus;
  categories?: string[];
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface ITaskSafeJSON {
  id?: number;
  title: string;
  description?: string;
  creator_id: number;
  organization_id: number;
  due_date?: string;
  priority: TaskPriority;
  status: TaskStatus;
  categories?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ITaskJSON extends ITaskSafeJSON {
  isOverdue: boolean;
}
