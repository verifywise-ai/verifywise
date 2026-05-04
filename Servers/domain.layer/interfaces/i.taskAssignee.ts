export interface ITaskAssignee {
  task_id: number;
  user_id: number;
  assigned_at?: Date;
}

export interface ITaskAssigneeSafeJSON {
  taskId: number;
  userId: number;
  assignedAt?: string;
}

export interface ITaskAssigneeJSON {
  task_id: number;
  user_id: number;
  assigned_at?: string;
}
