import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEuAiActQuestionnaire } from "../repository/euAiActClassification.repository";
import type { Questionnaire } from "../../domain/types/euAiActClassification";

export const EU_AI_ACT_QUESTIONNAIRE_QUERY_KEY = ["eu-ai-act-questionnaire"] as const;

// The questionnaire only changes with a deploy, but the server checks answers
// against its current version, so a tab left open across a deploy must not keep
// an old copy for long.
const EU_AI_ACT_QUESTIONNAIRE_STALE_TIME_MS = 5 * 60 * 1000;

const euAiActQuestionnaireQuery = {
  queryKey: EU_AI_ACT_QUESTIONNAIRE_QUERY_KEY,
  queryFn: () => getEuAiActQuestionnaire(),
  staleTime: EU_AI_ACT_QUESTIONNAIRE_STALE_TIME_MS,
};

/** The EU AI Act risk questionnaire, shared across the app through the query cache. */
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
