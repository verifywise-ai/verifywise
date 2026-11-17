import { apiServices } from "../../infrastructure/api/networkServices";

export async function createApprovalRequest({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/approval-requests", body);
  return response;
}

export async function getMyApprovalRequests({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/approval-requests/my-requests", {
    signal,
  });
  return response.data;
}

export async function getPendingApprovals({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/approval-requests/pending-approvals", {
    signal,
  });
  return response.data;
}

export async function getAllApprovalRequests({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/approval-requests/all", {
    signal,
  });
  return response.data;
}

export async function getApprovalRequestById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/approval-requests/${id}`, {
    signal,
  });
  return response.data;
}

// Note: the cross-page refresh event for AI write actions is the
// `aiAction:completed` CustomEvent dispatched by RequestorApprovalModal
// (where it has access to the entity_type and tool name). See
// `application/events/aiActionEvents.ts`.

export async function approveRequest({
  id,
  body,
}: {
  id: number;
  body: { comments?: string };
}): Promise<any> {
  const response = await apiServices.post(`/approval-requests/${id}/approve`, body);
  return response;
}

export async function rejectRequest({
  id,
  body,
}: {
  id: number;
  body: { comments?: string };
}): Promise<any> {
  const response = await apiServices.post(`/approval-requests/${id}/reject`, body);
  return response;
}

export async function withdrawRequest({
  id,
  suppressGlobalErrorToast,
}: {
  id: number;
  /** Skip the global error toast; the caller shows its own message. */
  suppressGlobalErrorToast?: boolean;
}): Promise<any> {
  const url = `/approval-requests/${id}/withdraw`;
  const response = suppressGlobalErrorToast
    ? await apiServices.post(url, {}, { suppressGlobalErrorToast })
    : await apiServices.post(url, {});
  return response;
}
