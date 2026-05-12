import { apiServices } from "../../infrastructure/api/networkServices";

export async function getProjectRiskById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/projectRisks/${id}`, {
    signal,
  });
  return response.data;
}

export async function getAllProjectRisks({
  signal,
  filter = "active",
}: {
  signal?: AbortSignal;
  filter?: "active" | "deleted" | "all";
} = {}): Promise<any> {
  const response = await apiServices.get(`/projectRisks?filter=${filter}`, {
    signal,
  });
  return response.data;
}

export async function getAllProjectRisksByProjectId({
  projectId,
  signal,
  filter = "active",
}: {
  projectId: string;
  signal?: AbortSignal;
  filter?: "active" | "deleted" | "all";
}): Promise<any> {
  const response = await apiServices.get(`/projectRisks/by-projid/${projectId}?filter=${filter}`, {
    signal,
  });
  return response.data;
}

export async function getAllRisksByFrameworkId({
  frameworkId,
  signal,
  filter = "active",
}: {
  frameworkId: number;
  signal?: AbortSignal;
  filter?: "active" | "deleted" | "all";
}): Promise<any> {
  const response = await apiServices.get(
    `/projectRisks/by-frameworkid/${frameworkId}?filter=${filter}`,
    {
      signal,
    },
  );
  return response.data;
}

export async function getNonMitigatedProjectRisks({
  projectId,
  signal,
}: {
  projectId: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/projectRisks/by-projid/non-mitigated/${projectId}`, {
    signal,
  });
  return response.data;
}

export async function createProjectRisk({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/projectRisks", body);
  return response;
}

export async function updateProjectRisk({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.put(`/projectRisks/${id}`, body);
  return response;
}

export async function deleteProjectRisk({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/projectRisks/${id}`);
  return response;
}

export type BulkProjectRiskAction = "set_owner" | "set_category" | "archive";

export interface BulkUpdateProjectRisksPayload {
  ids: number[];
  action: BulkProjectRiskAction;
  ownerId?: number;
  categories?: string[];
}

export async function bulkUpdateProjectRisks(payload: BulkUpdateProjectRisksPayload): Promise<any> {
  try {
    const response = await apiServices.patch("/projectRisks/bulk", payload);
    return response.data;
  } catch (error) {
    console.error("Error performing bulk project-risk update:", error);
    throw error;
  }
}
