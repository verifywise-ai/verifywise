import { useCallback, useEffect, useState } from "react";
import { Framework } from "../../domain/types/Framework";
import { getAssessmentById } from "../repository/assesment.repository";

/**
 * Custom hook to fetch and manage assessment data based on the selected project ID.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.selectedProjectId - The ID of the selected project.
 *
 * @returns {Object} - An object containing the assessment data and loading state.
 * @returns {AssessmentData | null} return.assessmentData - The fetched assessment data or null if not yet fetched.
 * @returns {boolean} return.loading - The loading state indicating whether the data is currently being fetched.
 *
 * @example
 * const { assessmentData, loading } = useAssessmentData({ selectedProjectId: 'project123' });
 */
const useAssessmentData = ({ selectedProjectId }: { selectedProjectId: string }) => {
  const [assessmentData, setAssessmentData] = useState<Framework | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAssessmentData = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      if (!selectedProjectId) return;
      if (signal.aborted) return;

      setLoading(true);
      try {
        const response = await getAssessmentById({ id: selectedProjectId, signal });
        if (!response.ok) {
          console.error(`Failed to fetch progress data: ${response.message}`);
        }
        if (response?.data) {
          setAssessmentData(response.data[0]);
        }
      } catch (error) {
        console.error("Failed to fetch assessment data:", error);
      } finally {
        setLoading(false);
      }
    },
    [selectedProjectId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    fetchAssessmentData({ signal });
    return () => {
      controller.abort();
    };
  }, [selectedProjectId, fetchAssessmentData]);

  return {
    assessmentData,
    loading,
  };
};

export default useAssessmentData;
