import { apiServices } from "../../infrastructure/api/networkServices";

const BASE_URL = "/readiness";

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) q.set(key, String(val));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export async function triggerCalculateAll(projectId?: number, visibility?: string) {
  const response = await apiServices.post<any>(`${BASE_URL}/calculate`, {
    project_id: projectId,
    visibility,
  });
  return response.data;
}

export async function triggerCalculateFramework(
  frameworkType: string,
  projectId?: number,
  visibility?: string,
) {
  const response = await apiServices.post<any>(`${BASE_URL}/calculate/${frameworkType}`, {
    project_id: projectId,
    visibility,
  });
  return response.data;
}

export async function getReadinessScores(projectId?: number, visibility?: string) {
  const query = buildQuery({ project_id: projectId, visibility });
  const response = await apiServices.get<any>(`${BASE_URL}/scores${query}`);
  return response.data;
}

export async function getReadinessScoresByFramework(
  frameworkType: string,
  projectId?: number,
  visibility?: string,
) {
  const query = buildQuery({ project_id: projectId, visibility });
  const response = await apiServices.get<any>(`${BASE_URL}/scores/${frameworkType}${query}`);
  return response.data;
}

export async function getControlScores(
  frameworkType: string,
  projectId?: number,
  visibility?: string,
) {
  const query = buildQuery({ project_id: projectId, visibility });
  const response = await apiServices.get<any>(`${BASE_URL}/controls/${frameworkType}${query}`);
  return response.data;
}

export async function getWeakestControls(limit?: number, projectId?: number, visibility?: string) {
  const query = buildQuery({ limit, project_id: projectId, visibility });
  const response = await apiServices.get<any>(`${BASE_URL}/weakest${query}`);
  return response.data;
}

export async function getRecommendations(limit?: number, projectId?: number, visibility?: string) {
  const query = buildQuery({ limit, project_id: projectId, visibility });
  const response = await apiServices.get<any>(`${BASE_URL}/recommendations${query}`);
  return response.data;
}

export async function getReadinessHistory(
  frameworkType?: string,
  projectId?: number,
  visibility?: string,
) {
  const query = buildQuery({ framework_type: frameworkType, project_id: projectId, visibility });
  const response = await apiServices.get<any>(`${BASE_URL}/history${query}`);
  return response.data;
}
