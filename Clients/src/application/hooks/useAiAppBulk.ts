import { useCallback } from "react";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkAssessAiApps,
  cancelAiAppAssessments,
  createAiAppQuestionnaire,
  deleteAiAppQuestionnaire,
  downloadAiAppAssessmentWorksheet,
  downloadAiAppImportTemplate,
  getAiAppAssessmentHistory,
  getAiAppAssessments,
  getAiAppIds,
  getAiAppQuestionnaires,
  importAiApps,
  saveAiAppAssessmentAnswers,
  updateAiAppQuestionnaire,
  uploadAiAppAssessmentAnswers,
} from "../repository/aiAppBulk.repository";
import {
  IAiAppAnswersUploadPayload,
  IAiAppAssessmentFilters,
  IAiAppBulkAssessPayload,
  IAiAppIdsFilters,
  IAiAppImportPayload,
  IAiAppQuestionnairePayload,
} from "../../domain/interfaces/i.aiAppBulk";
import { aiAppQueryKeys } from "./useAiApps";
import { vendorQueryKeys } from "./useVendors";

export const aiAppAssessmentQueryKeys = {
  all: ["aiAppAssessments"] as const,
  lists: () => [...aiAppAssessmentQueryKeys.all, "list"] as const,
  list: (filters: IAiAppAssessmentFilters) =>
    [...aiAppAssessmentQueryKeys.lists(), filters] as const,
  histories: () => [...aiAppAssessmentQueryKeys.all, "history"] as const,
  history: (appId: number) => [...aiAppAssessmentQueryKeys.histories(), appId] as const,
  questionnaires: () => [...aiAppAssessmentQueryKeys.all, "questionnaires"] as const,
};

/** Assessment results set the app's risk score, so the AI app caches follow them. */
function invalidateAssessments(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: aiAppAssessmentQueryKeys.lists() });
  queryClient.invalidateQueries({ queryKey: aiAppAssessmentQueryKeys.histories() });
  queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
  queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.details() });
}

/** Reads the matching ids on demand, for "Select all". */
export const useFetchAiAppIds = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (filters: IAiAppIdsFilters) =>
      queryClient.fetchQuery({
        queryKey: [...aiAppQueryKeys.all, "ids", filters],
        queryFn: ({ signal }) => getAiAppIds(filters, signal),
        staleTime: 0,
      }),
    [queryClient],
  );
};

export const useDownloadAiAppImportTemplate = () =>
  useMutation({ mutationFn: () => downloadAiAppImportTemplate() });

export const useImportAiApps = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IAiAppImportPayload) => importAiApps(payload),
    onSuccess: (_, payload) => {
      if (payload.dry_run) return;
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
      // An import can add vendors.
      queryClient.invalidateQueries({ queryKey: vendorQueryKeys.all });
    },
  });
};

export const useAiAppQuestionnaires = () =>
  useQuery({
    queryKey: aiAppAssessmentQueryKeys.questionnaires(),
    queryFn: ({ signal }) => getAiAppQuestionnaires(signal),
    staleTime: 60 * 1000,
  });

export const useSaveAiAppQuestionnaire = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: IAiAppQuestionnairePayload }) =>
      id ? updateAiAppQuestionnaire(id, payload) : createAiAppQuestionnaire(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiAppAssessmentQueryKeys.questionnaires() });
      // Pending assessments follow the latest version of their questionnaire.
      queryClient.invalidateQueries({ queryKey: aiAppAssessmentQueryKeys.lists() });
    },
  });
};

export const useDeleteAiAppQuestionnaire = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAiAppQuestionnaire(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiAppAssessmentQueryKeys.questionnaires() });
      queryClient.invalidateQueries({ queryKey: aiAppAssessmentQueryKeys.lists() });
    },
  });
};

export const useBulkAssessAiApps = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IAiAppBulkAssessPayload) => bulkAssessAiApps(payload),
    onSuccess: () => invalidateAssessments(queryClient),
  });
};

export const useAiAppAssessments = (filters: IAiAppAssessmentFilters, enabled = true) =>
  useQuery({
    queryKey: aiAppAssessmentQueryKeys.list(filters),
    queryFn: ({ signal }) => getAiAppAssessments(filters, signal),
    enabled,
    staleTime: 30 * 1000,
  });

export const useAiAppAssessmentHistory = (appId: number) =>
  useQuery({
    queryKey: aiAppAssessmentQueryKeys.history(appId),
    queryFn: ({ signal }) => getAiAppAssessmentHistory(appId, signal),
    staleTime: 30 * 1000,
  });

export const useSaveAiAppAssessmentAnswers = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answers }: { id: number; answers: Record<string, number> }) =>
      saveAiAppAssessmentAnswers(id, answers),
    onSuccess: () => invalidateAssessments(queryClient),
  });
};

export const useCancelAiAppAssessments = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => cancelAiAppAssessments(ids),
    onSuccess: () => invalidateAssessments(queryClient),
  });
};

export const useDownloadAiAppAssessmentWorksheet = () =>
  useMutation({
    mutationFn: ({
      questionnaireId,
      assignedToMe,
    }: {
      questionnaireId: number;
      assignedToMe: boolean;
    }) => downloadAiAppAssessmentWorksheet(questionnaireId, assignedToMe),
  });

export const useUploadAiAppAssessmentAnswers = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IAiAppAnswersUploadPayload) => uploadAiAppAssessmentAnswers(payload),
    onSuccess: () => invalidateAssessments(queryClient),
  });
};
