import { apiServices } from "../../infrastructure/api/networkServices";

export async function getAllProjects({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/projects", {
    signal,
  });
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
  const response = await apiServices.post("/projects", body);
  return response;
}

export async function updateProject({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.patch(`/projects/${id}`, body);
  return response;
}

export async function deleteProject({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/projects/${id}`);
  return response;
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
