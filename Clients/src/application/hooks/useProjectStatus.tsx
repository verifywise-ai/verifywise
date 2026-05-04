import { useEffect, useState, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import { getProjectProgressData } from "../repository/project.repository";
import { ProjectStatus, defaultProjectStatus } from "../../domain/types/projectStatus.types";

const useProjectStatus = ({ userId }: { userId: number | null }) => {
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>(defaultProjectStatus);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | boolean>(false);

  // Get auth token from Redux store
  const authToken = useSelector((state: { auth: { authToken: string } }) => state.auth.authToken);

  const fetchProjectStatus = useCallback(
    async (signal: AbortSignal) => {
      try {
        const compliance = await getProjectProgressData({
          routeUrl: `eu-ai-act/all/compliances/progress`,
          signal,
        });
        const assessment = await getProjectProgressData({
          routeUrl: `eu-ai-act/all/assessments/progress`,
          signal,
        });

        setProjectStatus({
          assessments: {
            percentageComplete: (assessment.totalQuestions / assessment.answeredQuestions) * 100,
            allDoneAssessments: assessment.totalQuestions,
            allTotalAssessments: assessment.answeredQuestions,
            // projects: response.assessmentsMetadata,
          },
          controls: {
            percentageComplete: (compliance.allDonesubControls / compliance.allsubControls) * 100,
            allDoneSubControls: compliance.allDonesubControls,
            allTotalSubControls: compliance.allsubControls,
            // projects: compliance.controlsMetadata,
          },
        });
      } catch (error) {
        if (!signal.aborted) {
          setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) {
      setError("No user ID provided");
      setLoading(false);
      return;
    }

    // Only fetch project status if user is logged in (authToken exists)
    if (!authToken) {
      setLoading(false);
      setError("User not authenticated");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(false);

    fetchProjectStatus(controller.signal);

    return () => controller.abort();
  }, [userId, authToken, fetchProjectStatus]);

  // Memoize the returned object to prevent unnecessary re-renders
  const memoizedProjectStatus = useMemo(
    () => ({
      projectStatus: projectStatus ?? defaultProjectStatus,
      loading,
      error,
    }),
    [projectStatus, loading, error],
  );

  return memoizedProjectStatus;
};

export default useProjectStatus;
