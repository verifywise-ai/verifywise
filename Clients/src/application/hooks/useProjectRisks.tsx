/**
 * Custom hook to fetch and manage project risks data.
 *
 * @param {Object} params - The parameters object.
 * @param {number} [params.projectId] - The project ID to fetch risks for.
 * @param {any} [params.refreshKey] - Optional key to trigger a refetch.
 * @returns {Object} - The hook returns an object containing:
 *   - `projectRisks` {ProjectRisk[]} - The list of project risks.
 *   - `loadingProjectRisks` {boolean} - The loading state of the project risks.
 *   - `error` {string | boolean} - The error state of the project risks request.
 *   - `projectRisksSummary` {Object} - The summary of project risks categorized by risk levels.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convertToCamelCaseRiskKey } from "../tools/stringUtil";
import { getAllProjectRisksByProjectId } from "../repository/projectRisk.repository";

export interface ProjectRisk {
  id: number;
  project_id: number;
  risk_name: any;
  risk_owner: any;
  ai_lifecycle_phase: any;
  risk_description: any;
  risk_category: any;
  impact: any;
  assessment_mapping: any;
  controls_mapping: any;
  likelihood: any;
  severity: any;
  risk_level_autocalculated: any;
  review_notes: any;
  mitigation_status: any;
  current_risk_level: any;
  deadline: any;
  mitigation_plan: any;
  implementation_strategy: any;
  mitigation_evidence_document: any;
  likelihood_mitigation: any;
  risk_severity: any;
  final_risk_level: any;
  risk_approval: any;
  approval_status: any;
  date_of_assessment: any;
  recommendations?: any;
}

export const projectRiskQueryKeys = {
  all: ["projectRisks"] as const,
  lists: () => [...projectRiskQueryKeys.all, "list"] as const,
  list: (projectId: number | string, filter?: string) =>
    [...projectRiskQueryKeys.lists(), { projectId, filter }] as const,
  details: () => [...projectRiskQueryKeys.all, "detail"] as const,
  detail: (id: number | string) => [...projectRiskQueryKeys.details(), id] as const,
};

const useProjectRisks = ({ projectId, refreshKey }: { projectId: number; refreshKey?: any }) => {
  const {
    data: projectRisks = [],
    isLoading: loadingProjectRisks,
    error,
  } = useQuery({
    queryKey: [...projectRiskQueryKeys.list(projectId, "active"), refreshKey],
    queryFn: async ({ signal }) => {
      const response = await getAllProjectRisksByProjectId({
        projectId: String(projectId),
        signal,
      });
      return (response.data as ProjectRisk[]) || [];
    },
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  const projectRisksSummary = useMemo(() => {
    return projectRisks.reduce(
      (acc, risk) => {
        const _risk = convertToCamelCaseRiskKey(risk.risk_level_autocalculated);
        const key = `${_risk.replace(/risks?$/i, "")}Risks`;
        if (key in acc && key !== "total") {
          const riskKey = key as
            | "veryHighRisks"
            | "highRisks"
            | "mediumRisks"
            | "lowRisks"
            | "veryLowRisks";
          acc[riskKey] = acc[riskKey] + 1;
        }
        acc.total = acc.total + 1;
        return acc;
      },
      {
        total: 0,
        veryHighRisks: 0,
        highRisks: 0,
        mediumRisks: 0,
        lowRisks: 0,
        veryLowRisks: 0,
      },
    );
  }, [projectRisks]);

  return {
    projectRisks,
    loadingProjectRisks,
    error: error instanceof Error ? error.message : error ? String(error) : false,
    projectRisksSummary,
  };
};

export default useProjectRisks;
