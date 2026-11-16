import { useQuery } from "@tanstack/react-query";
import {
  getRisksLinkedOnlyToProject,
  type RisksLinkedOnlyToProject,
} from "../repository/project.repository";

/**
 * The risks that deleting a use case would leave linked to no use case (and so
 * visible to everyone). Read fresh each time the delete dialog opens: never
 * cached, never retried, so a failure shows at once.
 */
export function useRisksLinkedOnlyToProject(projectId: number, { enabled = true } = {}) {
  return useQuery<RisksLinkedOnlyToProject>({
    queryKey: ["risksLinkedOnlyToProject", projectId],
    queryFn: ({ signal }) => getRisksLinkedOnlyToProject({ id: projectId, signal }),
    enabled: enabled && Number.isInteger(projectId) && projectId > 0,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
