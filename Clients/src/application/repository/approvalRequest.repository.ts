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

export async function withdrawRequest({ id }: { id: number }): Promise<any> {
  const response = await apiServices.post(`/approval-requests/${id}/withdraw`, {});
  return response;
}
