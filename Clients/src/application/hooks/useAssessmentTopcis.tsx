import { useCallback, useEffect, useState } from "react";
import { Topic } from "../../domain/types/Topic";
import { getAllAssessmentTopics } from "../repository/assesment.repository";

/**
 * Custom hook to fetch and manage assessment topics.
 *
 * @param {Object} params - Parameters for the hook.
 * @param {string | undefined} params.assessmentId - The ID of the assessment to fetch topics for.
 *
 * @returns {Object} - An object containing the assessment topics and loading state.
 * @returns {Topic[]} return.assessmentTopics - The list of topics for the given assessment.
 * @returns {boolean} return.loading - The loading state indicating if the topics are being fetched.
 *
 * @example
 * const { assessmentTopics, loading } = useAssessmentTopics({ assessmentId: "12345" });
 */

const useAssessmentTopics = () => {
  const [assessmentTopics, setAssessmentTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAssessmentTopics = useCallback(async ({ signal }: { signal: AbortSignal }) => {
    if (signal.aborted) return;

    setLoading(true);
    try {
      const response = await getAllAssessmentTopics({
        signal,
      });
      // if (!response.ok) {
      //   setAssessmentTopics([]);
      //   console.error(`Failed to fetch topics data: ${response.message}`);
      // }
      if (response) {
        setAssessmentTopics(response);
      } else {
        setAssessmentTopics([]);
      }
    } catch (error) {
      console.error("Failed to fetch topics data:", error);
      setAssessmentTopics([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    fetchAssessmentTopics({ signal });
    return () => {
      controller.abort();
    };
  }, [fetchAssessmentTopics]);

  return {
    assessmentTopics,
    loading,
  };
};

export default useAssessmentTopics;
