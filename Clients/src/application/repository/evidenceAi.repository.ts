import { apiServices } from "../../infrastructure/api/networkServices";

const BASE_URL = "/evidence-ai";

export async function triggerAnalysis(fileId: number, visibility?: string) {
  const response = await apiServices.post<any>(`${BASE_URL}/analyze/${fileId}`, { visibility });
  return response.data;
}

export async function getAnalysis(fileId: number) {
  const response = await apiServices.get<any>(`${BASE_URL}/analysis/${fileId}`);
  return response.data;
}

export async function getQualityScores() {
  const response = await apiServices.get<any>(`${BASE_URL}/quality-scores`);
  return response.data;
}

export async function getEvidenceGaps(params?: {
  framework_type?: string;
  quality_threshold?: number;
}) {
  const query = new URLSearchParams();
  if (params?.framework_type) query.set("framework_type", params.framework_type);
  if (params?.quality_threshold) query.set("quality_threshold", String(params.quality_threshold));
  const qs = query.toString();
  const response = await apiServices.get<any>(`${BASE_URL}/gaps${qs ? `?${qs}` : ""}`);
  return response.data;
}

export async function getSuggestions(fileId: number) {
  const response = await apiServices.get<any>(`${BASE_URL}/suggestions/${fileId}`);
  return response.data;
}

export async function applySuggestions(
  fileId: number,
  suggestions: Array<{ control_id: number; framework_type: string }>,
) {
  const response = await apiServices.post<any>(`${BASE_URL}/suggestions/${fileId}/apply`, {
    suggestions,
  });
  return response.data;
}
