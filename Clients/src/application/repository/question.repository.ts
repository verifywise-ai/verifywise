import { apiServices } from "../../infrastructure/api/networkServices";

export async function getQuestionById({
  id,
  signal,
  responseType = "json",
}: {
  id: number;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/questions/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

export async function createQuestion({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/questions", body);
  return response;
}

export async function updateQuestion({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.patch(`/questions/${id}`, body);
  return response;
}

export async function deleteQuestion({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/questions/${id}`);
  return response;
}

export async function updateEUAIActAnswerById({
  answerId,
  body,
}: {
  answerId: number;
  body: any;
}): Promise<any> {
  // Match the pattern used by ISO27001/ISO42001 drawers
  // When sending FormData, set Content-Type to multipart/form-data
  // Axios will automatically add the boundary parameter
  const headers: any = {};
  if (body instanceof FormData) {
    headers["Content-Type"] = "multipart/form-data";
  } else {
    headers["Content-Type"] = "application/json";
  }

  const response = await apiServices.patch(`/eu-ai-act/saveAnswer/${answerId}`, body, { headers });
  return response;
}
