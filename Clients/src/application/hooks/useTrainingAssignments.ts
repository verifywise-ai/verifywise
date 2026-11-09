import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ICreateTrainingAssignmentsResult,
  ITrainingAssignment,
  ITrainingAssignmentCreateInput,
  ITrainingAssignmentFilters,
  ITrainingAssignmentStats,
} from "../../domain/interfaces/i.trainingAssignment";
import {
  completeTrainingAssignment,
  createTrainingAssignments,
  deleteTrainingAssignment,
  getTrainingAssignmentStats,
  getTrainingAssignments,
} from "../repository/trainingAssignment.repository";

export const trainingAssignmentKeys = {
  all: ["trainingAssignments"] as const,
  list: (filters: ITrainingAssignmentFilters) =>
    [...trainingAssignmentKeys.all, "list", filters] as const,
  stats: (trainingId: number | null) =>
    [...trainingAssignmentKeys.all, "stats", trainingId] as const,
};

export function useTrainingAssignments(filters: ITrainingAssignmentFilters = {}) {
  return useQuery<ITrainingAssignment[]>({
    queryKey: trainingAssignmentKeys.list(filters),
    queryFn: ({ signal }) =>
      getTrainingAssignments(filters).then((rows) => {
        void signal;
        return rows;
      }),
  });
}

export function useTrainingAssignmentStats(trainingId: number | null) {
  return useQuery<ITrainingAssignmentStats>({
    queryKey: trainingAssignmentKeys.stats(trainingId),
    queryFn: () => getTrainingAssignmentStats(trainingId ?? undefined),
    enabled: trainingId !== null,
  });
}

export function useCreateTrainingAssignments() {
  const qc = useQueryClient();
  return useMutation<ICreateTrainingAssignmentsResult, Error, ITrainingAssignmentCreateInput[]>({
    mutationFn: (assignments) => createTrainingAssignments(assignments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trainingAssignmentKeys.all });
    },
  });
}

export function useCompleteTrainingAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => completeTrainingAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trainingAssignmentKeys.all });
    },
  });
}

export function useDeleteTrainingAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTrainingAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trainingAssignmentKeys.all });
    },
  });
}
