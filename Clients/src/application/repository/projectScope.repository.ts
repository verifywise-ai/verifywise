import { apiServices } from "../../infrastructure/api/networkServices";

export async function getAllProjectScopes({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/projectScopes", {
    signal,
  });
  return response.data;
}

export async function getProjectScopeById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/projectScopes/${id}`, {
    signal,
  });
  return response.data;
}

export async function createProjectScope({
  body,
}: {
  body: Record<string, unknown>;
}): Promise<any> {
  const response = await apiServices.post("/projectScopes", body);
  return response;
}

export async function updateProjectScope({
  id,
  body,
}: {
  id: number;
  body: Record<string, unknown>;
}): Promise<any> {
  const response = await apiServices.put(`/projectScopes/${id}`, body);
  return response;
}

export async function deleteProjectScope({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/projectScopes/${id}`);
  return response;
}
