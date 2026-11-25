import { apiServices } from "../../infrastructure/api/networkServices";
import {
  buildApprovalWorkflowBody,
  type ApprovalWorkflowFormData,
} from "../utils/approvalWorkflowBody";

export async function getAllApprovalWorkflows({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/approval-workflows", {
    signal,
  });
  return response.data;
}

export async function getApprovalWorkflowById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/approval-workflows/${id}`, {
    signal,
  });
  return response.data;
}

/** Shown by the caller (inline), so the global error toast is skipped. */
type ErrorToastOption = { suppressGlobalErrorToast?: boolean };

export async function createApprovalWorkflow({
  body,
  suppressGlobalErrorToast,
}: { body: any } & ErrorToastOption): Promise<any> {
  const response = suppressGlobalErrorToast
    ? await apiServices.post("/approval-workflows", body, { suppressGlobalErrorToast })
    : await apiServices.post("/approval-workflows", body);
  return response;
}

export async function updateApprovalWorkflow({
  id,
  body,
  suppressGlobalErrorToast,
}: {
  id: number;
  body: any;
} & ErrorToastOption): Promise<any> {
  const response = suppressGlobalErrorToast
    ? await apiServices.put(`/approval-workflows/${id}`, body, { suppressGlobalErrorToast })
    : await apiServices.put(`/approval-workflows/${id}`, body);
  return response;
}

/** A saved approval workflow, as the API returns it. */
export interface SavedApprovalWorkflow {
  id: number;
  workflow_title: string;
  entity_type: string;
}

/**
 * Create (no `id`) or update an approval workflow from the workflow modal's
 * form data. Shared by the Approval workflows page and the use case screens
 * that create a workflow in place. Returns the saved workflow. Both show a
 * failed save inside the workflow modal, so the global error toast is
 * skipped.
 */
export async function saveApprovalWorkflow({
  id,
  formData,
}: {
  id?: number;
  formData: ApprovalWorkflowFormData;
}): Promise<SavedApprovalWorkflow | undefined> {
  const body = buildApprovalWorkflowBody(formData);
  const response =
    id === undefined
      ? await createApprovalWorkflow({ body, suppressGlobalErrorToast: true })
      : await updateApprovalWorkflow({ id, body, suppressGlobalErrorToast: true });
  return (response?.data as { data?: SavedApprovalWorkflow } | undefined)?.data;
}

export async function deleteApprovalWorkflow({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/approval-workflows/${id}`);
  return response;
}

/**
 * Get approval workflows filtered by entity type
 *
 * @param entityType - Entity type to filter by ('use_case', 'file')
 * @param signal - Optional abort signal for cancellation
 * @returns Promise<any> - List of workflows for the specified entity type
 */
export async function getApprovalWorkflowsByEntityType({
  entityType,
  signal,
}: {
  entityType: "use_case" | "file";
  signal?: AbortSignal;
}): Promise<any[]> {
  const response = (await apiServices.get(`/approval-workflows?entity_type=${entityType}`, {
    signal,
  })) as { data?: { data?: unknown[] } | unknown[] };
  // Filter by entity type if the backend doesn't support query param
  const responseData = response.data as { data?: unknown[] } | unknown[] | undefined;
  const workflows =
    (responseData && typeof responseData === "object" && "data" in responseData
      ? responseData.data
      : responseData) || [];
  return Array.isArray(workflows) ? workflows.filter((w: any) => w.entity_type === entityType) : [];
}
