import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Imported-framework assessment API (#5254), served at
 * /api/v1/imported-framework-assessments. An imported framework attached to a
 * use case is a "link"; its tree, dashboard and impl rows are addressed by the
 * link id, the way bundled frameworks are addressed by projects_frameworks id.
 */
const BASE = "/v1/imported-framework-assessments";
type Envelope<T> = { data: T };

/** One imported framework attached to a use case. */
export interface ImportedFrameworkLink {
  id: number;
  imported_framework_id: number;
  name: string;
  description: string | null;
  created_at: string;
}

/** Same shape as the bundled GET /frameworks/:id/dashboard/:projectFrameworkId. */
export interface ImportedFrameworkDashboard {
  entity_type: string;
  progress: { total: number; done: number };
  assignments: { total: number; assigned: number };
  statusBreakdown: {
    notStarted: number;
    draft: number;
    inProgress: number;
    awaitingReview: number;
    awaitingApproval: number;
    implemented: number;
    needsRework: number;
  };
}

/** URL builders shared by the generic framework page and drawer. */
export const importedAssessmentPaths = {
  tree: (linkId: number) => `${BASE}/links/${linkId}/tree`,
  /** Prefix up to /impl; callers append `/${level}/${implId}`. */
  impl: (linkId: number) => `${BASE}/links/${linkId}/impl`,
  dashboard: (linkId: number) => `${BASE}/links/${linkId}/dashboard`,
};

export async function getProjectImportedFrameworks(
  projectId: number,
): Promise<ImportedFrameworkLink[]> {
  const response = await apiServices.get<Envelope<ImportedFrameworkLink[]>>(
    `${BASE}/projects/${projectId}`,
  );
  return response.data?.data ?? [];
}

export async function attachImportedFramework({
  projectId,
  importedFrameworkId,
}: {
  projectId: number;
  importedFrameworkId: number;
}): Promise<ImportedFrameworkLink> {
  const response = await apiServices.post<Envelope<ImportedFrameworkLink>>(
    `${BASE}/projects/${projectId}`,
    { imported_framework_id: importedFrameworkId },
  );
  return response.data?.data;
}

export async function detachImportedFramework({
  projectId,
  linkId,
}: {
  projectId: number;
  linkId: number;
}): Promise<void> {
  await apiServices.delete(`${BASE}/projects/${projectId}/${linkId}`);
}

export async function getImportedFrameworkDashboard(
  linkId: number,
): Promise<ImportedFrameworkDashboard | null> {
  const response = await apiServices.get<Envelope<ImportedFrameworkDashboard>>(
    importedAssessmentPaths.dashboard(linkId),
  );
  return response.data?.data ?? null;
}
