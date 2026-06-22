import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  triggerAnalysis,
  getAnalysis,
  getQualityScores,
  getEvidenceGaps,
  getSuggestions,
  applySuggestions,
} from "../repository/evidenceAi.repository";

export const evidenceAiQueryKeys = {
  all: ["evidence-ai"] as const,
  analysis: (fileId: number) => [...evidenceAiQueryKeys.all, "analysis", fileId] as const,
  qualityScores: () => [...evidenceAiQueryKeys.all, "quality-scores"] as const,
  gaps: (params?: { framework_type?: string; quality_threshold?: number }) =>
    [...evidenceAiQueryKeys.all, "gaps", params] as const,
  suggestions: (fileId: number) => [...evidenceAiQueryKeys.all, "suggestions", fileId] as const,
};

/** Fetch analysis results for a specific file */
export const useEvidenceAnalysis = (fileId: number, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: evidenceAiQueryKeys.analysis(fileId),
    queryFn: async () => {
      const res = await getAnalysis(fileId);
      return res?.data ?? null;
    },
    enabled: (options?.enabled ?? true) && !!fileId,
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch quality scores for all analyzed files */
export const useQualityScores = () => {
  return useQuery({
    queryKey: evidenceAiQueryKeys.qualityScores(),
    queryFn: async () => {
      const res = await getQualityScores();
      return res?.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch evidence gap analysis */
export const useEvidenceGaps = (params?: {
  framework_type?: string;
  quality_threshold?: number;
}) => {
  return useQuery({
    queryKey: evidenceAiQueryKeys.gaps(params),
    queryFn: async () => {
      const res = await getEvidenceGaps(params);
      return res?.data ?? { gaps: [], total_controls: 0 };
    },
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch suggested control links for a file */
export const useEvidenceSuggestions = (fileId: number, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: evidenceAiQueryKeys.suggestions(fileId),
    queryFn: async () => {
      const res = await getSuggestions(fileId);
      return res?.data ?? null;
    },
    enabled: (options?.enabled ?? true) && !!fileId,
    staleTime: 5 * 60 * 1000,
  });
};

/** Trigger AI analysis for a file */
export const useTriggerAnalysis = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: number | { fileId: number; visibility?: string }) => {
      const fileId = typeof input === "number" ? input : input.fileId;
      const visibility = typeof input === "number" ? undefined : input.visibility;
      const res = await triggerAnalysis(fileId, visibility);
      return res?.data;
    },
    onSuccess: (_data, input) => {
      const fileId = typeof input === "number" ? input : input.fileId;
      queryClient.invalidateQueries({ queryKey: evidenceAiQueryKeys.analysis(fileId) });
      queryClient.invalidateQueries({ queryKey: evidenceAiQueryKeys.qualityScores() });
      queryClient.invalidateQueries({ queryKey: evidenceAiQueryKeys.suggestions(fileId) });
    },
  });
};

/** Apply suggested control links */
export const useApplySuggestions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fileId,
      suggestions,
    }: {
      fileId: number;
      suggestions: Array<{ control_id: number; framework_type: string }>;
    }) => {
      const res = await applySuggestions(fileId, suggestions);
      return res?.data;
    },
    onSuccess: (_data, { fileId }) => {
      queryClient.invalidateQueries({ queryKey: evidenceAiQueryKeys.suggestions(fileId) });
      queryClient.invalidateQueries({ queryKey: evidenceAiQueryKeys.gaps() });
    },
  });
};
