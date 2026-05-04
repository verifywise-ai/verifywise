import { useQuery } from "@tanstack/react-query";
import { AssessmentProgress } from "../../domain/interfaces/i.assessment";
import { getAssessmentProgress } from "../repository/assesment.repository";

/**
 * Custom hook to fetch and manage assessment progress data for a selected project.
 *
 * @param {Object} params - The parameters object.
 * @param {number} params.projectFrameworkId - The ID of the selected project framework.
 * @param {boolean} params.refreshKey - Key to trigger a refetch.
 * @returns {Object} - An object containing the assessment progress data and loading state.
 *
 * @example
 * const { assessmentProgress, loading } = useAssessmentProgress({ projectFrameworkId: 123, refreshKey: false });
 */

const defaultAssessmentProgress: AssessmentProgress = {
  totalQuestions: 0,
  answeredQuestions: 0,
};

const ASSESSMENT_PROGRESS_QUERY_KEY = ["assessmentProgress"] as const;

const useAssessmentProgress = ({
  projectFrameworkId,
  refreshKey,
}: {
  projectFrameworkId: number;
  refreshKey: boolean;
}) => {
  const { data: assessmentProgress = defaultAssessmentProgress, isLoading: loading } = useQuery({
    queryKey: [...ASSESSMENT_PROGRESS_QUERY_KEY, projectFrameworkId, refreshKey],
    queryFn: async ({ signal }) => {
      const response = await getAssessmentProgress({
        projectFrameworkId,
        signal,
      });
      return (response?.data as AssessmentProgress) || defaultAssessmentProgress;
    },
    enabled: !!projectFrameworkId,
    // staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
    // gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  return {
    assessmentProgress,
    loading,
  };
};

export default useAssessmentProgress;
