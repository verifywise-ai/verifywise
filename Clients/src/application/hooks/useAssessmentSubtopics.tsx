import { useCallback, useEffect, useState } from "react";
import { Subtopic } from "../../domain/types/Subtopic";
import { getAssessmentTopicById } from "../repository/assesment.repository";

/**
 * Custom hook to fetch and manage assessment subtopics based on the active assessment topic ID.
 *
 * @param {Object} params - The parameters object.
 * @param {number | undefined} params.activeAssessmentTopicId - The ID of the active assessment topic.
 *
 * @returns {Object} - The hook returns an object containing:
 *   - `assessmentSubtopics` {Subtopic[]} - The list of fetched subtopics.
 *   - `loading` {boolean} - The loading state indicating whether the data is being fetched.
 *
 * @example
 * const { assessmentSubtopics, loading } = useAssessmentSubtopics({ activeAssessmentTopicId: 1 });
 */

const useAssessmentSubtopics = ({
  activeAssessmentTopicId,
  projectFrameworkId,
  refreshKey,
}: {
  activeAssessmentTopicId: number | undefined;
  projectFrameworkId?: number;
  refreshKey?: boolean;
}) => {
  const [assessmentSubtopics, setAssessmentSubtopics] = useState<Subtopic[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAssessmentTopics = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      if (!activeAssessmentTopicId) return;
      if (signal.aborted) return;

      setLoading(true);
      try {
        const response = await getAssessmentTopicById({
          topicId: activeAssessmentTopicId,
          projectFrameworkId,
          signal,
        });
        // if (!response.ok) {
        //   setAssessmentSubtopics([]);
        //   console.error(`Failed to fetch subtopics data: ${response.message}`);
        // }
        if (response?.data) {
          setAssessmentSubtopics(response.data.subTopics);
        } else {
          setAssessmentSubtopics([]);
        }
      } catch (error: any) {
        // Ignore abort errors (caused by React StrictMode or component unmount)
        if (error?.message === "canceled" || error?.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch subtopics data:", error);
        setAssessmentSubtopics([]);
      } finally {
        setLoading(false);
      }
    },
    [activeAssessmentTopicId, projectFrameworkId, refreshKey],
  );
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    fetchAssessmentTopics({ signal });
    return () => {
      controller.abort();
    };
  }, [activeAssessmentTopicId, fetchAssessmentTopics]);

  return {
    assessmentSubtopics,
    loading,
  };
};

export default useAssessmentSubtopics;
