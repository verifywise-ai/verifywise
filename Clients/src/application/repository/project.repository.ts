import { apiServices } from "../../infrastructure/api/networkServices";
import { getDeduped } from "../../infrastructure/api/inflightGet";

export async function getAllProjects({
  signal,
  forceFresh = false,
}: {
  signal?: AbortSignal;
  /**
   * Bypass in-flight dedup and always issue a fresh request. Required after a
   * mutation (project create/edit) so the refresh cannot resolve to an older
   * /projects request that is still in flight and predates the change.
   */
  forceFresh?: boolean;
} = {}): Promise<any> {
  // Deduped by default: the dashboard shell and the metrics hook both request
  // /projects on first login, and sharing the in-flight promise collapses them
  // into one call. Freshness-critical callers opt out with forceFresh.
  const response =
    forceFresh || signal
      ? await apiServices.get("/projects", { signal })
      : await getDeduped("/projects");
  return response.data;
}

export async function getProjectById({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/projects/${id}`, {
    signal,
  });
  return response.data;
}

export async function createProject({ body }: { body: any }): Promise<any> {
  // v1: the legacy create and update contracts have no external owner fields.
  const response = await apiServices.post("/v1/projects", body);
  return response;
}

/**
 * Pass `suppressGlobalErrorToast` when the caller shows the error itself, so
 * it is not shown twice.
 */
export async function updateProject({
  id,
  body,
  suppressGlobalErrorToast,
}: {
  id: number;
  body: any;
  suppressGlobalErrorToast?: boolean;
}): Promise<any> {
  const endpoint = `/v1/projects/${id}`;
  const response = suppressGlobalErrorToast
    ? await apiServices.patch(endpoint, body, { suppressGlobalErrorToast })
    : await apiServices.patch(endpoint, body);
  return response;
}

/** A use case's approval workflow (GET /api/v1/projects/:id/approval-workflow). */
export interface UseCaseApprovalWorkflow {
  approval_workflow_id: number | null;
  workflow_title: string | null;
  /** False once the workflow is archived; null when none is attached. */
  workflow_is_active: boolean | null;
  approval_status: "pending" | "rejected" | null;
}

/**
 * The workflow attached to a use case and its approval status. The legacy
 * project responses never carry approval_workflow_id, so read it here.
 */
export async function getUseCaseApprovalWorkflow({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<UseCaseApprovalWorkflow> {
  const response = await apiServices.get<{ data: UseCaseApprovalWorkflow }>(
    `/v1/projects/${id}/approval-workflow`,
    { signal },
  );
  return response.data.data;
}

/**
 * POST /api/v1/projects/:id/resubmit-approval's answer. A resubmission is
 * never auto-approved, so `status` is "pending" and `auto_approved` false.
 */
export interface UseCaseResubmitResult {
  approval_request_id: number;
  status: "pending";
  auto_approved: false;
}

/**
 * Send a rejected use case for approval again under its attached workflow.
 * The caller shows the error inline, so the global error toast is skipped.
 */
export async function resubmitUseCaseApproval({
  id,
}: {
  id: number;
}): Promise<UseCaseResubmitResult> {
  const response = await apiServices.post<{ data: UseCaseResubmitResult }>(
    `/v1/projects/${id}/resubmit-approval`,
    {},
    { suppressGlobalErrorToast: true },
  );
  return response.data.data;
}

export interface DeleteUseCaseResult {
  deleted: boolean;
  /** The risks the delete archived (none unless archiving was asked for). */
  archived_risk_ids: number[];
}

/**
 * Delete a use case through the v1 route, in one request. With
 * archiveRisksLinkedOnlyHere the server archives the active risks linked only
 * to this use case in the same transaction, so they stay private; anything
 * that fails rolls both back. The caller shows its own error, so the global
 * error toast is skipped.
 */
export async function deleteUseCase({
  id,
  archiveRisksLinkedOnlyHere,
}: {
  id: number;
  archiveRisksLinkedOnlyHere: boolean;
}): Promise<DeleteUseCaseResult> {
  const response = await apiServices.delete<DeleteUseCaseResult>(`/v1/projects/${id}`, {
    params: { archive_risks_linked_only_here: String(archiveRisksLinkedOnlyHere) },
    suppressGlobalErrorToast: true,
  });
  return response.data;
}

export interface RisksLinkedOnlyToProject {
  count: number;
  risks: { id: number; risk_name: string }[];
}

/**
 * The active risks linked to this use case and no other. Deleting the use
 * case would leave them linked to none, which shows them to everyone in the
 * organization. Same access as deleting the use case.
 */
export async function getRisksLinkedOnlyToProject({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<RisksLinkedOnlyToProject> {
  const response = await apiServices.get<{ data: RisksLinkedOnlyToProject }>(
    `/v1/projects/${id}/risks-linked-only-here`,
    { signal },
  );
  return response.data.data;
}

export async function getProjectProgressData({
  routeUrl,
  signal,
}: {
  routeUrl: string;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(routeUrl, {
    signal,
  });
  return response.data;
}
