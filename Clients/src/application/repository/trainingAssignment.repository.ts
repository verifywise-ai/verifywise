import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  ICreateTrainingAssignmentsResult,
  ITrainingAssignment,
  ITrainingAssignmentCreateInput,
  ITrainingAssignmentFilters,
  ITrainingAssignmentStats,
} from "../../domain/interfaces/i.trainingAssignment";

/** Training assignment API (#5260), under /api/v1/training-assignments. */

const BASE = "/v1/training-assignments";
type Envelope<T> = { data: T };

export async function getTrainingAssignments(
  filters: ITrainingAssignmentFilters = {},
): Promise<ITrainingAssignment[]> {
  const params: Record<string, string | number> = {};
  if (filters.training_id !== undefined) params.training_id = filters.training_id;
  if (filters.status !== undefined) params.status = filters.status;
  const response = await apiServices.get<Envelope<ITrainingAssignment[]>>(BASE, params);
  return response.data?.data ?? [];
}

export async function createTrainingAssignments(
  assignments: ITrainingAssignmentCreateInput[],
): Promise<ICreateTrainingAssignmentsResult> {
  const response = await apiServices.post<Envelope<ICreateTrainingAssignmentsResult>>(BASE, {
    assignments,
  });
  return response.data?.data ?? { created: [], errors: [] };
}

export async function completeTrainingAssignment(id: number): Promise<ITrainingAssignment> {
  const response = await apiServices.post<Envelope<ITrainingAssignment>>(`${BASE}/${id}/complete`);
  return response.data?.data;
}

export async function deleteTrainingAssignment(id: number): Promise<void> {
  await apiServices.delete(`${BASE}/${id}`);
}

export async function getTrainingAssignmentStats(
  trainingId?: number,
): Promise<ITrainingAssignmentStats> {
  const params: Record<string, string | number> = {};
  if (trainingId !== undefined) params.training_id = trainingId;
  const response = await apiServices.get<Envelope<ITrainingAssignmentStats>>(
    `${BASE}/stats`,
    params,
  );
  return response.data?.data;
}
