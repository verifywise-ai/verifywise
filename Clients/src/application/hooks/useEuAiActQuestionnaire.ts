import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEuAiActQuestionnaire } from "../repository/euAiActClassification.repository";
import type { Questionnaire } from "../../domain/types/euAiActClassification";

export const EU_AI_ACT_QUESTIONNAIRE_QUERY_KEY = ["eu-ai-act-questionnaire"] as const;

// The questionnaire only changes with a deploy, so a loaded copy never goes stale.
const euAiActQuestionnaireQuery = {
  queryKey: EU_AI_ACT_QUESTIONNAIRE_QUERY_KEY,
  queryFn: () => getEuAiActQuestionnaire(),
  staleTime: Infinity,
};

/** The EU AI Act risk questionnaire, cached for the session. */
export const useEuAiActQuestionnaire = () => useQuery(euAiActQuestionnaireQuery);

/**
 * Returns a function that resolves the questionnaire from the shared cache,
 * fetching it once if it is not there yet. For callers that load it together
 * with other data in an effect.
 */
export const useFetchEuAiActQuestionnaire = (): (() => Promise<Questionnaire>) => {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.fetchQuery(euAiActQuestionnaireQuery), [queryClient]);
};
