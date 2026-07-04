import { apiServices } from "../../infrastructure/api/networkServices";
import {
  IAIAppCreatePayload,
  IAIAppDetail,
  IAIAppListResponse,
  IAIAppUpdatePayload,
  IGetAiAppsFilters,
  IPolicySuggestion,
} from "../../domain/interfaces/i.aiApp";
import { AiAppStatus } from "../../domain/enums/aiApp.enum";

function buildQueryString(filters: IGetAiAppsFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.append("status", filters.status);
  if (filters.vendorId) params.append("vendorId", String(filters.vendorId));
  if (filters.page) params.append("page", String(filters.page));
  if (filters.limit) params.append("limit", String(filters.limit));
  if (filters.sortBy) params.append("sortBy", filters.sortBy);
  if (filters.order) params.append("order", filters.order);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getAllAiApps(
  filters: IGetAiAppsFilters = {},
  signal?: AbortSignal,
): Promise<IAIAppListResponse> {
  const response = await apiServices.get(`/ai-apps${buildQueryString(filters)}`, {
    signal,
  });
  // Backend wraps payloads as STATUS_CODE[200]({ ai_apps, total }) → { message, data },
  // and apiServices adds another layer, so the real payload is at response.data.data.
  return (response.data as { data: IAIAppListResponse }).data;
}

export async function getAiAppById(id: number, signal?: AbortSignal): Promise<IAIAppDetail> {
  const response = await apiServices.get(`/ai-apps/${id}`, { signal });
  return (response.data as { data: IAIAppDetail }).data;
}

export async function createAiApp(data: IAIAppCreatePayload): Promise<IAIAppDetail> {
  const response = await apiServices.post("/ai-apps", data);
  return (response.data as { data: IAIAppDetail }).data;
}

export async function updateAiApp(id: number, data: IAIAppUpdatePayload): Promise<IAIAppDetail> {
  const response = await apiServices.patch(`/ai-apps/${id}`, data);
  return (response.data as { data: IAIAppDetail }).data;
}

export async function updateAiAppStatus(id: number, status: AiAppStatus): Promise<IAIAppDetail> {
  const response = await apiServices.patch(`/ai-apps/${id}/status`, { status });
  return (response.data as { data: IAIAppDetail }).data;
}

export async function deleteAiApp(id: number): Promise<{ id: number }> {
  const response = await apiServices.delete(`/ai-apps/${id}`);
  return (response.data as { data: { id: number } }).data;
}

export async function linkModelsToAiApp(
  id: number,
  modelInventoryIds: number[],
): Promise<IAIAppDetail> {
  const response = await apiServices.post(`/ai-apps/${id}/models`, {
    model_inventory_ids: modelInventoryIds,
  });
  return (response.data as { data: IAIAppDetail }).data;
}

export async function setPoliciesForAiApp(
  id: number,
  policies: Array<{ policy_id: number; status: string }>,
): Promise<IAIAppDetail> {
  const response = await apiServices.post(`/ai-apps/${id}/policies`, {
    policies,
  });
  return (response.data as { data: IAIAppDetail }).data;
}

export async function setDataExposureForAiApp(
  id: number,
  dataExposure: Array<{ data_type: string; allowed: boolean }>,
): Promise<IAIAppDetail> {
  const response = await apiServices.post(`/ai-apps/${id}/data-exposure`, {
    data_exposure: dataExposure,
  });
  return (response.data as { data: IAIAppDetail }).data;
}

export async function getPolicySuggestions(
  name: string,
  signal?: AbortSignal,
): Promise<IPolicySuggestion[]> {
  const response = await apiServices.get(
    `/ai-apps/policy-suggestions?name=${encodeURIComponent(name)}`,
    { signal },
  );
  return (response.data as { data: IPolicySuggestion[] }).data;
}

export async function promoteFromShadowAi(shadowAiToolId: number): Promise<IAIAppDetail> {
  const response = await apiServices.post(`/ai-apps/from-shadow-ai/${shadowAiToolId}`, {});
  return (response.data as { data: IAIAppDetail }).data;
}
