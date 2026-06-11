import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getDeadlineSummary, DeadlineSummary } from "../repository/deadline.repository";
import { DEADLINE_CONFIG } from "../config/deadlineConfig";

const DEADLINE_WARNINGS_QUERY_KEY = ["deadlineWarnings"] as const;

interface UseDeadlineWarningsResult {
  overdue: number;
  dueSoon: number;
  dueSoonDays: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches the current organization's deadline summary (overdue + due-soon task
 * counts) from GET /api/deadlines/summary. Disabled until a user is present.
 */
const useDeadlineWarnings = (): UseDeadlineWarningsResult => {
  const { userId } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: DEADLINE_WARNINGS_QUERY_KEY,
    queryFn: async (): Promise<DeadlineSummary> => {
      const response = await getDeadlineSummary(DEADLINE_CONFIG.dueSoonDays);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // cached for 10 minutes
  });

  return {
    overdue: data?.overdue ?? 0,
    dueSoon: data?.dueSoon ?? 0,
    dueSoonDays: data?.dueSoonDays ?? DEADLINE_CONFIG.dueSoonDays,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  };
};

export default useDeadlineWarnings;
