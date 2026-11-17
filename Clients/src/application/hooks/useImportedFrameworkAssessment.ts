import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachImportedFramework,
  detachImportedFramework,
  getImportedFrameworkDashboard,
  getProjectImportedFrameworks,
} from "../repository/importedFrameworkAssessment.repository";

export const importedAssessmentKeys = {
  all: ["importedFrameworkAssessment"] as const,
  project: (projectId: number) => [...importedAssessmentKeys.all, "project", projectId] as const,
  link: (linkId: number) => [...importedAssessmentKeys.all, "link", linkId] as const,
  dashboard: (linkId: number) => [...importedAssessmentKeys.link(linkId), "dashboard"] as const,
};

/** Imported frameworks attached to a use case. */
export function useProjectImportedFrameworks(projectId: number, { enabled = true } = {}) {
  return useQuery({
    queryKey: importedAssessmentKeys.project(projectId),
    queryFn: () => getProjectImportedFrameworks(projectId),
    enabled: enabled && Number.isSafeInteger(projectId) && projectId > 0,
  });
}

/** Dashboard counts for several attached imported frameworks at once. */
export function useImportedFrameworkDashboards(linkIds: number[]) {
  return useQueries({
    queries: linkIds.map((linkId) => ({
      queryKey: importedAssessmentKeys.dashboard(linkId),
      queryFn: () => getImportedFrameworkDashboard(linkId),
    })),
  });
}

/**
 * Attach / detach. The use case's own payload (`project.imported_frameworks`)
 * is loaded outside React Query, so callers still refresh the project after
 * these succeed; here we drop the cached link list and the link's
 * tree/dashboard data.
 */
export function useAttachImportedFramework(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (importedFrameworkId: number) =>
      attachImportedFramework({ projectId, importedFrameworkId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importedAssessmentKeys.project(projectId) });
    },
  });
}

export function useDetachImportedFramework(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => detachImportedFramework({ projectId, linkId }),
    onSuccess: (_data, linkId) => {
      qc.invalidateQueries({ queryKey: importedAssessmentKeys.project(projectId) });
      qc.removeQueries({ queryKey: importedAssessmentKeys.link(linkId) });
    },
  });
}
