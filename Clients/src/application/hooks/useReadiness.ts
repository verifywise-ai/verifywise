import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  triggerCalculateAll,
  triggerCalculateFramework,
  getReadinessScores,
  getReadinessScoresByFramework,
  getControlScores,
  getWeakestControls,
  getRecommendations,
  getReadinessHistory,
} from "../repository/readiness.repository";

export const readinessQueryKeys = {
  all: ["readiness"] as const,
  scores: (projectId?: number, visibility?: string) =>
    [...readinessQueryKeys.all, "scores", projectId, visibility] as const,
  scoresByFramework: (fw: string, projectId?: number, visibility?: string) =>
    [...readinessQueryKeys.all, "scores", fw, projectId, visibility] as const,
  controls: (fw: string, projectId?: number, visibility?: string) =>
    [...readinessQueryKeys.all, "controls", fw, projectId, visibility] as const,
  weakest: (limit?: number, projectId?: number, visibility?: string) =>
    [...readinessQueryKeys.all, "weakest", limit, projectId, visibility] as const,
  recommendations: (limit?: number, projectId?: number, visibility?: string) =>
    [...readinessQueryKeys.all, "recommendations", limit, projectId, visibility] as const,
  history: (fw?: string, projectId?: number, visibility?: string) =>
    [...readinessQueryKeys.all, "history", fw, projectId, visibility] as const,
};

/** Fetch all framework readiness scores */
export const useReadinessScores = (projectId?: number, visibility?: string) => {
  return useQuery({
    queryKey: readinessQueryKeys.scores(projectId, visibility),
    queryFn: async () => {
      const res = await getReadinessScores(projectId, visibility);
      return res?.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch readiness scores for a specific framework */
export const useReadinessScoresByFramework = (
  frameworkType: string,
  options?: { enabled?: boolean; projectId?: number; visibility?: string },
) => {
  return useQuery({
    queryKey: readinessQueryKeys.scoresByFramework(
      frameworkType,
      options?.projectId,
      options?.visibility,
    ),
    queryFn: async () => {
      const res = await getReadinessScoresByFramework(
        frameworkType,
        options?.projectId,
        options?.visibility,
      );
      return res?.data ?? null;
    },
    enabled: (options?.enabled ?? true) && !!frameworkType,
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch per-control readiness scores */
export const useControlScores = (
  frameworkType: string,
  options?: { enabled?: boolean; projectId?: number; visibility?: string },
) => {
  return useQuery({
    queryKey: readinessQueryKeys.controls(frameworkType, options?.projectId, options?.visibility),
    queryFn: async () => {
      const res = await getControlScores(frameworkType, options?.projectId, options?.visibility);
      return res?.data ?? [];
    },
    enabled: (options?.enabled ?? true) && !!frameworkType,
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch weakest controls */
export const useWeakestControls = (limit?: number, projectId?: number, visibility?: string) => {
  return useQuery({
    queryKey: readinessQueryKeys.weakest(limit, projectId, visibility),
    queryFn: async () => {
      const res = await getWeakestControls(limit, projectId, visibility);
      return res?.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch top recommendations */
export const useRecommendations = (limit?: number, projectId?: number, visibility?: string) => {
  return useQuery({
    queryKey: readinessQueryKeys.recommendations(limit, projectId, visibility),
    queryFn: async () => {
      const res = await getRecommendations(limit, projectId, visibility);
      return res?.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch readiness history for trend chart */
export const useReadinessHistory = (
  frameworkType?: string,
  projectId?: number,
  visibility?: string,
) => {
  return useQuery({
    queryKey: readinessQueryKeys.history(frameworkType, projectId, visibility),
    queryFn: async () => {
      const res = await getReadinessHistory(frameworkType, projectId, visibility);
      return res?.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
};

/** Trigger readiness calculation for all frameworks */
export const useTriggerCalculateAll = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (opts?: { projectId?: number; visibility?: string }) => {
      const res = await triggerCalculateAll(opts?.projectId, opts?.visibility);
      return res?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: readinessQueryKeys.all });
    },
  });
};

/** Trigger readiness calculation for a specific framework */
export const useTriggerCalculateFramework = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      frameworkType,
      projectId,
      visibility,
    }: {
      frameworkType: string;
      projectId?: number;
      visibility?: string;
    }) => {
      const res = await triggerCalculateFramework(frameworkType, projectId, visibility);
      return res?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: readinessQueryKeys.all });
    },
  });
};
