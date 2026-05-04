import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { Framework } from "../../domain/types/Framework";
import { getAllFrameworks } from "../repository/entity.repository";

interface UseFrameworksResult {
  allFrameworks: Framework[];
  filteredFrameworks: Framework[];
  projectFrameworksMap: Map<number, number>;
  loading: boolean;
  error: string | null;
  refreshAllFrameworks: () => Promise<void>;
  refreshFilteredFrameworks: () => Promise<void>;
}

const useFrameworks = ({ listOfFrameworks }: { listOfFrameworks: any[] }): UseFrameworksResult => {
  const queryClient = useQueryClient();

  // Fetch all frameworks using TanStack Query
  const {
    data: allFrameworks = [],
    isLoading: loading,
    error: queryError,
    refetch: refetchAllFrameworks,
  } = useQuery({
    queryKey: ["frameworks", "all"],
    queryFn: async () => {
      const response = await getAllFrameworks();
      if (response?.data) {
        return response.data;
      } else {
        throw new Error("Invalid response format");
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Memoized computation of filtered frameworks and project frameworks map
  const { filteredFrameworks, projectFrameworksMap } = useMemo(() => {
    const _projectFrameworksMap = new Map<number, number>();
    let _filteredFrameworks: Framework[] = [];

    if (allFrameworks.length > 0 && listOfFrameworks.length > 0) {
      const frameworkIds = listOfFrameworks.map((f: any) => {
        _projectFrameworksMap.set(Number(f.framework_id), Number(f.project_framework_id));
        return Number(f.framework_id);
      });

      _filteredFrameworks = allFrameworks.filter((fw: Framework) =>
        frameworkIds.includes(Number(fw.id)),
      );
    }

    return {
      filteredFrameworks: _filteredFrameworks,
      projectFrameworksMap: _projectFrameworksMap,
    };
  }, [allFrameworks, listOfFrameworks]);

  // Refresh all frameworks
  const refreshAllFrameworks = useCallback(async () => {
    await refetchAllFrameworks();
  }, [refetchAllFrameworks]);

  // Refresh filtered frameworks (invalidate and refetch)
  const refreshFilteredFrameworks = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ["frameworks", "all"] });
  }, [queryClient]);

  // Convert error to string
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to fetch frameworks"
    : null;

  return {
    allFrameworks,
    filteredFrameworks,
    projectFrameworksMap,
    loading,
    error,
    refreshAllFrameworks,
    refreshFilteredFrameworks,
  };
};

export default useFrameworks;
