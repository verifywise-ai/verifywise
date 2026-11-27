import { useCallback, useEffect, useState } from "react";
import { Topic } from "../../domain/types/Topic";
import {
  getAllAssessmentTopics,
  getAssessmentsByProjectFrameworkId,
} from "../repository/assesment.repository";

/**
 * Custom hook to fetch and manage assessment topics.
 *
 * Without a project framework it lists the EU AI Act topics a use case
 * answers. With one it lists the topics of that project framework's own
 * assessment, as the server returns them: EU AI Act (organization) answers
 * only the EU AI Act questions moved to it.
 *
 * @param {Object} params - Parameters for the hook.
 * @param {number | undefined} params.projectFrameworkId - The project framework whose assessment to list topics for.
 *
 * @returns {Object} - An object containing the assessment topics and loading state.
 * @returns {Topic[]} return.assessmentTopics - The list of topics.
 * @returns {boolean} return.loading - The loading state indicating if the topics are being fetched.
 *
 * @example
 * const { assessmentTopics, loading } = useAssessmentTopics();
 */

const useAssessmentTopics = ({ projectFrameworkId }: { projectFrameworkId?: number } = {}) => {
  const [assessmentTopics, setAssessmentTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAssessmentTopics = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      if (signal.aborted) return;

      setLoading(true);
      try {
        const response = projectFrameworkId
          ? ((await getAssessmentsByProjectFrameworkId({ projectFrameworkId, signal }))
              .data as Topic[])
          : await getAllAssessmentTopics({
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
    },
    [projectFrameworkId],
  );
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
