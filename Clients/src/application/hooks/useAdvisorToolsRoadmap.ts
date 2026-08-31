import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { getToolsRoadmapAPI } from "../repository/advisor.repository";
import { IAdvisorToolsRoadmap } from "../../domain/interfaces/i.advisorRoadmap";

export const advisorRoadmapQueryKeys = {
  all: ["advisorToolsRoadmap"] as const,
};

/**
 * Read-only roadmap of planned vs. implemented advisor tools. The payload
 * is a static manifest diffed against the live registry, so it rarely
 * changes — standard 5-minute staleness applies.
 */
export const useAdvisorToolsRoadmap = (): UseQueryResult<IAdvisorToolsRoadmap, Error> => {
  return useQuery({
    queryKey: advisorRoadmapQueryKeys.all,
    queryFn: async () => {
      return await getToolsRoadmapAPI();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
