import { apiServices } from "../../infrastructure/api/networkServices";

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

export async function createApprovalWorkflow({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/approval-workflows", body);
  return response;
}

export async function updateApprovalWorkflow({
  id,
  body,
}: {
  id: number;
  body: any;
}): Promise<any> {
  const response = await apiServices.put(`/approval-workflows/${id}`, body);
  return response;
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
