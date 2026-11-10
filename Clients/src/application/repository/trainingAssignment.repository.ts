import { apiServices } from "../../infrastructure/api/networkServices";

export type TrainingAssignmentStatus = "pending" | "overdue" | "completed";

export interface TrainingAssignment {
  id: number;
  training_id: number;
  user_id: number;
  user_name: string;
  user_surname: string;
  /** Calendar date as "YYYY-MM-DD". */
  due_date: string;
  status: TrainingAssignmentStatus;
  completed_at: string | null;
  completed_by: number | null;
  assigned_by: number | null;
  created_at: string;
}

export interface MyTrainingAssignment extends TrainingAssignment {
  training_name: string;
  training_duration: string;
  training_provider: string;
  training_description: string;
}

export interface TrainingAssignmentSummary {
  training_id: number;
  total: number;
  completed: number;
  overdue: number;
}

export interface CreateTrainingAssignmentsInput {
  training_id: number;
  user_ids: number[];
  due_date: string;
}

export interface CreateTrainingAssignmentsResult {
  created: TrainingAssignment[];
  skipped_user_ids: number[];
}

const ROUTE = "/v1/training/assignments";

// Every write shows its failure next to the control that made it.
const OWN_ERROR_UI = { suppressGlobalErrorToast: true };

export async function getTrainingAssignments(trainingId: number): Promise<TrainingAssignment[]> {
  const response = await apiServices.get(ROUTE, { training_id: trainingId, ...OWN_ERROR_UI });
  return (response.data as { data: TrainingAssignment[] }).data;
}

export async function getMyTrainingAssignments(): Promise<MyTrainingAssignment[]> {
  const response = await apiServices.get(`${ROUTE}/mine`, OWN_ERROR_UI);
  return (response.data as { data: MyTrainingAssignment[] }).data;
}

export async function getTrainingAssignmentSummary(): Promise<TrainingAssignmentSummary[]> {
  const response = await apiServices.get(`${ROUTE}/summary`, OWN_ERROR_UI);
  return (response.data as { data: TrainingAssignmentSummary[] }).data;
}

export async function createTrainingAssignments(
  input: CreateTrainingAssignmentsInput,
): Promise<CreateTrainingAssignmentsResult> {
  const response = await apiServices.post(ROUTE, input, OWN_ERROR_UI);
  return (response.data as { data: CreateTrainingAssignmentsResult }).data;
}

export async function completeAllTrainingAssignments(
  trainingId: number,
): Promise<{ completed: number }> {
  const response = await apiServices.post(
    `${ROUTE}/complete-all`,
    { training_id: trainingId },
    OWN_ERROR_UI,
  );
  return (response.data as { data: { completed: number } }).data;
}

export async function updateTrainingAssignmentDueDate({
  id,
  dueDate,
}: {
  id: number;
  dueDate: string;
}): Promise<TrainingAssignment> {
  const response = await apiServices.patch(`${ROUTE}/${id}`, { due_date: dueDate }, OWN_ERROR_UI);
  return (response.data as { data: TrainingAssignment }).data;
}

export async function completeTrainingAssignment(id: number): Promise<TrainingAssignment> {
  const response = await apiServices.post(`${ROUTE}/${id}/complete`, {}, OWN_ERROR_UI);
  return (response.data as { data: TrainingAssignment }).data;
}

export async function reopenTrainingAssignment(id: number): Promise<TrainingAssignment> {
  const response = await apiServices.post(`${ROUTE}/${id}/reopen`, {}, OWN_ERROR_UI);
  return (response.data as { data: TrainingAssignment }).data;
}

export async function deleteTrainingAssignment(id: number): Promise<void> {
  await apiServices.delete(`${ROUTE}/${id}`, OWN_ERROR_UI);
}
