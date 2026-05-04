import { apiServices } from "../../infrastructure/api/networkServices";

export async function getControlCategoryById({
  id,
  signal,
  responseType = "json",
}: {
  id: number;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/controlCategory/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

export async function createControlCategory({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/controlCategory", body, {});
  return response;
}

export async function updateControlCategory({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.patch(`/controlCategory/${id}`, body);
  return response;
}

export async function deleteControlCategory({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/controlCategory/${id}`);
  return response;
}

export async function getAllControlCategories(): Promise<any> {
  const response = await apiServices.get("/controlCategory");
  return response.data;
}

export async function getControlCategoriesByProjectId({
  projectId,
  signal,
}: {
  projectId: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/controlCategory/byprojectid/${projectId}`, {
    signal,
  });
  return response.data;
}
