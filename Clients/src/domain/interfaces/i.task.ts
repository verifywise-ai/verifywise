import { TaskPriority, TaskStatus } from "../enums/task.enum";

export type EntityLinkType =
  | "vendor"
  | "model"
  | "policy"
  | "nist_subcategory"
  | "iso42001_subclause"
  | "iso42001_annexcategory"
  | "iso42001_assessment"
  | "iso27001_subclause"
  | "iso27001_annexcontrol"
  | "iso27001_assessment"
  | "eu_control"
  | "eu_subcontrol"
  | "eu_assessment";

export interface IEntityLink {
  entity_id: number;
  entity_type: EntityLinkType;
  entity_name?: string;
}

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
  created_at?: Date;
  updated_at?: Date;
  creator_name?: string;
  assignees?: ITaskAssignee[];
  entity_links?: IEntityLink[];
  isOverdue?: boolean;
}

export interface ITaskAssignee {
  user_id: number;
  user_name: string;
  user_avatar?: string;
  assigned_at?: Date;
}

export interface TaskSummary {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export interface TaskFilters {
  search: string;
  status: "all" | TaskStatus;
  priority: "all" | TaskPriority;
  assignee: "all" | string;
  category: "all" | string;
}

export interface ICreateTaskFormValues {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
  assignees: Array<{
    id: number;
    name: string;
    surname: string;
    email: string;
  }>;
  categories: string[];
  entity_links: IEntityLink[];
}

// Note: ICreateTaskProps and ICreateTaskFormErrors have been moved to: presentation/types/interfaces/i.task.ts
