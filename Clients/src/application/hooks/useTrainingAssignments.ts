import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeAllTrainingAssignments,
  completeTrainingAssignment,
  createTrainingAssignments,
  deleteTrainingAssignment,
  getMyTrainingAssignments,
  getTrainingAssignments,
  getTrainingAssignmentSummary,
  reopenTrainingAssignment,
  updateTrainingAssignmentDueDate,
} from "../repository/trainingAssignment.repository";

const ROOT_KEY = ["trainingAssignments"] as const;

export const trainingAssignmentKeys = {
  root: ROOT_KEY,
  list: (trainingId: number) => [...ROOT_KEY, "list", trainingId] as const,
  mine: () => [...ROOT_KEY, "mine"] as const,
  summary: () => [...ROOT_KEY, "summary"] as const,
};

/** Everyone assigned to one training. */
export function useTrainingAssignments(trainingId: number) {
  return useQuery({
    queryKey: trainingAssignmentKeys.list(trainingId),
    queryFn: () => getTrainingAssignments(trainingId),
    enabled: trainingId > 0,
  });
}

/** The signed-in person's own assignments. */
export function useMyTrainingAssignments() {
  return useQuery({
    queryKey: trainingAssignmentKeys.mine(),
    queryFn: getMyTrainingAssignments,
  });
}

/** Per-training counts for the registry table. */
export function useTrainingAssignmentSummary() {
  return useQuery({
    queryKey: trainingAssignmentKeys.summary(),
    queryFn: getTrainingAssignmentSummary,
  });
}

/**
 * A write that refreshes every assignment list afterwards. It refreshes on
 * failure too, because a rejected write often means the list on screen is stale.
 */
function useAssignmentMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: trainingAssignmentKeys.root }),
  });
}

export const useCreateTrainingAssignments = () => useAssignmentMutation(createTrainingAssignments);

export const useCompleteAllTrainingAssignments = () =>
  useAssignmentMutation(completeAllTrainingAssignments);

export const useUpdateTrainingAssignmentDueDate = () =>
  useAssignmentMutation(updateTrainingAssignmentDueDate);

export const useCompleteTrainingAssignment = () =>
  useAssignmentMutation(completeTrainingAssignment);

export const useReopenTrainingAssignment = () => useAssignmentMutation(reopenTrainingAssignment);

export const useDeleteTrainingAssignment = () => useAssignmentMutation(deleteTrainingAssignment);
