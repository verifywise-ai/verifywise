/**
 * Training assignments (#5260) — DTO shapes exchanged with the
 * /v1/training-assignments endpoints.
 */

export type TrainingAssignmentSubjectType = "user" | "group";
export type TrainingAssignmentStatus = "pending" | "completed" | "overdue";

export interface ITrainingAssignment {
  id: number;
  organization_id: number;
  training_id: number;
  subject_type: TrainingAssignmentSubjectType;
  /** users.id when subject_type is "user", groups.id when "group". */
  subject_id: number;
  due_date: string | null;
  status: TrainingAssignmentStatus;
  completed_at: string | null;
  last_reminded_at: string | null;
  assigned_by: number | null;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export interface ITrainingAssignmentCreateInput {
  training_id: number;
  subject_type: TrainingAssignmentSubjectType;
  subject_id: number;
  due_date?: string | null;
}

export interface ITrainingAssignmentCreateError {
  index: number;
  message: string;
}

/** Bulk-create response: what was created plus one error per failed row. */
export interface ICreateTrainingAssignmentsResult {
  created: ITrainingAssignment[];
  errors: ITrainingAssignmentCreateError[];
}

export interface ITrainingAssignmentStats {
  training_id: number | null;
  pending: number;
  completed: number;
  overdue: number;
  total: number;
}

export interface ITrainingAssignmentFilters {
  training_id?: number;
  status?: TrainingAssignmentStatus;
}
