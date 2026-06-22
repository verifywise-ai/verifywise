import { apiServices } from "../../infrastructure/api/networkServices";
import { SubtopicModel } from "../../domain/models/EU-AI-Act/subtopic/subtopic.model";

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

export async function createSubtopic({ body }: { body: Partial<SubtopicModel> }): Promise<any> {
  const response = await apiServices.post("/subtopics", body);
  return response;
}

export async function updateSubtopic({
  id,
  body,
}: {
  id: number;
  body: Partial<SubtopicModel>;
}): Promise<any> {
  const response = await apiServices.patch(`/subtopics/${id}`, body);
  return response;
}

export async function deleteSubtopic({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/subtopics/${id}`);
  return response;
}
