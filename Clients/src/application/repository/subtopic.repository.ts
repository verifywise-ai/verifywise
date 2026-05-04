import { apiServices } from "../../infrastructure/api/networkServices";

export async function getSubtopicById({
  id,
  signal,
  responseType = "json",
}: {
  id: number;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/subtopics/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

export async function createSubtopic({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/subtopics", body);
  return response;
}

export async function updateSubtopic({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.patch(`/subtopics/${id}`, body);
  return response;
}

export async function deleteSubtopic({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/subtopics/${id}`);
  return response;
}
