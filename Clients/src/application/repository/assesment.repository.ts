import { apiServices } from "../../infrastructure/api/networkServices";

export async function getAssessmentById({
  id,
  signal,
  responseType = "json",
}: {
  id: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/assessments/project/byid/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

export async function createAssessment({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/assessments", body);
  return response;
}

export async function updateAssessment({ id, body }: { id: string; body: any }): Promise<any> {
  const response = await apiServices.patch(`/assessments/${id}`, body);
  return response;
}

export async function deleteAssessment({ id }: { id: string }): Promise<any> {
  const response = await apiServices.delete(`/assessments/${id}`);
  return response;
}

export async function getAssessmentProgress({
  projectFrameworkId,
  signal,
}: {
  projectFrameworkId: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/eu-ai-act/assessments/progress/${projectFrameworkId}`, {
    signal,
  });
  return response.data;
}

export async function getAssessmentAnswers({
  assessmentId,
}: {
  assessmentId: string;
}): Promise<any> {
  const response = await apiServices.get(`/assessments/getAnswaers/${assessmentId}`);
  return response.data;
}

export async function getAssessmentTopicById({
  topicId,
  projectFrameworkId,
  signal,
}: {
  topicId: number;
  projectFrameworkId?: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(
    `/eu-ai-act/topicById?topicId=${topicId}&projectFrameworkId=${projectFrameworkId}`,
    {
      signal,
    },
  );
  return response.data;
}

export async function getAllAssessmentTopics({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get(`/eu-ai-act/topics`, {
    signal,
  });
  return response.data;
}
