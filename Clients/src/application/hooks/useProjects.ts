import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getAllProjects } from "../repository/project.repository";
import { Project } from "../../domain/types/Project";

// Query keys for projects
export const projectQueryKeys = {
  all: ["projects"] as const,
  lists: () => [...projectQueryKeys.all, "list"] as const,
  list: () => [...projectQueryKeys.lists()] as const,
  details: () => [...projectQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...projectQueryKeys.details(), id] as const,
};

/**
 * Hook to fetch all projects
 *
 * Returns:
 * - data: All projects (including pending/rejected)
 * - approvedProjects: Only approved projects (excludes pending/rejected approval requests)
 * - isLoading, error, etc. from React Query
 */
export const useProjects = () => {
  const query = useQuery({
    queryKey: projectQueryKeys.list(),
    queryFn: async (): Promise<Project[]> => {
      const response = await getAllProjects();
      return response?.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Filter projects to only include approved ones (no pending/rejected approvals)
  const approvedProjects = useMemo(() => {
    if (!query.data) return [];

    return query.data.filter((project) => {
      const hasPendingApproval = (project as any).has_pending_approval;
      const approvalStatus = (project as any).approval_status;

      // Exclude projects with pending or rejected approval status
      return !hasPendingApproval && approvalStatus !== "pending" && approvalStatus !== "rejected";
    });
  }, [query.data]);

  return {
    ...query,
    approvedProjects,
  };
};
