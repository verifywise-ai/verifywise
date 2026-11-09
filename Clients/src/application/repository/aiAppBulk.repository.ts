import { apiServices } from "../../infrastructure/api/networkServices";
import {
  IAiAppAnswersUploadPayload,
  IAiAppAnswersUploadResult,
  IAiAppAssessment,
  IAiAppAssessmentFilters,
  IAiAppAssessmentListResponse,
  IAiAppBulkAssessPayload,
  IAiAppBulkAssessResult,
  IAiAppIdsFilters,
  IAiAppIdsResponse,
  IAiAppImportPayload,
  IAiAppImportResult,
  IAiAppQuestionnaire,
  IAiAppQuestionnairePayload,
} from "../../domain/interfaces/i.aiAppBulk";

const BASE = "/v1/ai-apps";

/** These screens show their own errors, so the global toast would be a duplicate. */
const OWN_ERROR_UI = { suppressGlobalErrorToast: true };

const unwrap = <T>(response: { data: unknown }): T => (response.data as { data: T }).data;

/** The body of a 4xx response that carries detail, such as a rejected import. */
export function errorBody<T>(error: unknown, status: number): T | null {
  const candidate = error as { status?: number; response?: { data?: unknown } } | null;
  if (candidate?.status !== status) return null;
  const data = candidate.response?.data;
  return data && typeof data === "object" ? (data as T) : null;
}

/** The server's message for a failed request, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const candidate = error as { status?: number; message?: unknown } | null;
  // Only client errors explain themselves; a 500 or a network failure does not.
  const status = candidate?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    if (typeof candidate?.message === "string" && candidate.message) return candidate.message;
  }
  return fallback;
}

export async function getAiAppIds(
  filters: IAiAppIdsFilters,
  signal?: AbortSignal,
): Promise<IAiAppIdsResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.append("status", filters.status);
  if (filters.lifecycleStage) params.append("lifecycle_stage", filters.lifecycleStage);
  if (filters.search) params.append("search", filters.search);
  const query = params.toString();
  const response = await apiServices.get(`${BASE}/ids${query ? `?${query}` : ""}`, { signal });
  return unwrap<IAiAppIdsResponse>(response);
}

export async function downloadAiAppImportTemplate(): Promise<Blob> {
  const response = await apiServices.get(`${BASE}/import/template`, {
    responseType: "blob",
    ...OWN_ERROR_UI,
  });
  return response.data as Blob;
}

export async function importAiApps(payload: IAiAppImportPayload): Promise<IAiAppImportResult> {
  const response = await apiServices.post(`${BASE}/import`, payload, OWN_ERROR_UI);
  return unwrap<IAiAppImportResult>(response);
}

export async function getAiAppQuestionnaires(signal?: AbortSignal): Promise<IAiAppQuestionnaire[]> {
  const response = await apiServices.get(`${BASE}/questionnaires`, { signal });
  return unwrap<{ questionnaires: IAiAppQuestionnaire[] }>(response).questionnaires;
}

export async function createAiAppQuestionnaire(
  payload: IAiAppQuestionnairePayload,
): Promise<IAiAppQuestionnaire> {
  const response = await apiServices.post(`${BASE}/questionnaires`, payload, OWN_ERROR_UI);
  return unwrap<IAiAppQuestionnaire>(response);
}

export async function updateAiAppQuestionnaire(
  id: number,
  payload: IAiAppQuestionnairePayload,
): Promise<IAiAppQuestionnaire> {
  const response = await apiServices.patch(`${BASE}/questionnaires/${id}`, payload, OWN_ERROR_UI);
  return unwrap<IAiAppQuestionnaire>(response);
}

export async function deleteAiAppQuestionnaire(id: number): Promise<void> {
  await apiServices.delete(`${BASE}/questionnaires/${id}`, OWN_ERROR_UI);
}

export async function bulkAssessAiApps(
  payload: IAiAppBulkAssessPayload,
): Promise<IAiAppBulkAssessResult> {
  const response = await apiServices.post(`${BASE}/bulk-assess`, payload, OWN_ERROR_UI);
  return unwrap<IAiAppBulkAssessResult>(response);
}

export async function getAiAppAssessments(
  filters: IAiAppAssessmentFilters,
  signal?: AbortSignal,
): Promise<IAiAppAssessmentListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.append("status", filters.status);
  if (filters.questionnaireId) params.append("questionnaire_id", String(filters.questionnaireId));
  if (filters.search) params.append("search", filters.search);
  if (filters.assignedToMe) params.append("assigned_to_me", "true");
  if (filters.page) params.append("page", String(filters.page));
  if (filters.limit) params.append("limit", String(filters.limit));
  const query = params.toString();
  const response = await apiServices.get(`${BASE}/assessments${query ? `?${query}` : ""}`, {
    signal,
  });
  return unwrap<IAiAppAssessmentListResponse>(response);
}

export async function getAiAppAssessmentHistory(
  appId: number,
  signal?: AbortSignal,
): Promise<IAiAppAssessment[]> {
  const response = await apiServices.get(`${BASE}/${appId}/assessments`, { signal });
  return unwrap<{ assessments: IAiAppAssessment[] }>(response).assessments;
}

export async function saveAiAppAssessmentAnswers(
  assessmentId: number,
  answers: Record<string, number>,
): Promise<IAiAppAssessment> {
  const response = await apiServices.put(
    `${BASE}/assessments/${assessmentId}/answers`,
    { answers },
    OWN_ERROR_UI,
  );
  return unwrap<IAiAppAssessment>(response);
}

export async function cancelAiAppAssessments(
  assessmentIds: number[],
): Promise<{ cancelled: number }> {
  const response = await apiServices.post(
    `${BASE}/assessments/cancel`,
    { assessment_ids: assessmentIds },
    OWN_ERROR_UI,
  );
  return unwrap<{ cancelled: number }>(response);
}

export async function downloadAiAppAssessmentWorksheet(questionnaireId: number): Promise<Blob> {
  const response = await apiServices.get(
    `${BASE}/assessments/worksheet?questionnaire_id=${questionnaireId}`,
    { responseType: "blob", ...OWN_ERROR_UI },
  );
  return response.data as Blob;
}

export async function uploadAiAppAssessmentAnswers(
  payload: IAiAppAnswersUploadPayload,
): Promise<IAiAppAnswersUploadResult> {
  const response = await apiServices.post(`${BASE}/assessments/answers`, payload, OWN_ERROR_UI);
  return unwrap<IAiAppAnswersUploadResult>(response);
}
