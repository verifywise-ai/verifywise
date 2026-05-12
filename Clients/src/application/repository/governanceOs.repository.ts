import { apiServices } from "../../infrastructure/api/networkServices";
import { IRecommendationRequest } from "../../domain/interfaces/i.governanceOs";

const BASE = "/governance-os";

// Mappings
export async function getAllMappings({
  signal,
  frameworkId,
  strength,
  domain,
}: {
  signal?: AbortSignal;
  frameworkId?: number;
  strength?: string;
  domain?: string;
} = {}): Promise<any> {
  const params = new URLSearchParams();
  if (frameworkId) params.set("frameworkId", String(frameworkId));
  if (strength) params.set("strength", strength);
  if (domain) params.set("domain", domain);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await apiServices.get(`${BASE}/mappings${query}`, { signal });
  return response.data;
}

export async function getMappingsBetween({
  sourceId,
  targetId,
  signal,
}: {
  sourceId: number;
  targetId: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`${BASE}/mappings/between/${sourceId}/${targetId}`, {
    signal,
  });
  return response.data;
}

export async function getMappingsForControl({
  controlType,
  controlId,
  signal,
}: {
  controlType: string;
  controlId: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`${BASE}/mappings/control/${controlType}/${controlId}`, {
    signal,
  });
  return response.data;
}

// Scenarios
export async function getAllScenarios({ signal }: { signal?: AbortSignal } = {}): Promise<any> {
  const response = await apiServices.get(`${BASE}/scenarios`, { signal });
  return response.data;
}

export async function getScenarioById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`${BASE}/scenarios/${id}`, { signal });
  return response.data;
}

export async function createScenario({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post(`${BASE}/scenarios`, body);
  return response.data;
}

export async function updateScenario({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.put(`${BASE}/scenarios/${id}`, body);
  return response.data;
}

export async function deleteScenario({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`${BASE}/scenarios/${id}`);
  return response.data;
}

// Recommendations
export async function getRecommendations({ body }: { body: IRecommendationRequest }): Promise<any> {
  const response = await apiServices.post(`${BASE}/recommend`, body);
  return response.data;
}

// Coverage
export async function getCoverage({
  projectId,
  signal,
}: {
  projectId: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`${BASE}/coverage/${projectId}`, { signal });
  return response.data;
}

export async function refreshCoverage({ projectId }: { projectId: number }): Promise<any> {
  const response = await apiServices.post(`${BASE}/coverage/${projectId}/refresh`, {});
  return response.data;
}

// Unified View
export async function getUnifiedView({
  projectId,
  signal,
}: {
  projectId: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`${BASE}/unified-view/${projectId}`, { signal });
  return response.data;
}

// Eligibility
export async function getEligibility({ signal }: { signal?: AbortSignal } = {}): Promise<any> {
  const response = await apiServices.get(`${BASE}/eligibility`, { signal });
  return response.data;
}

// Preferences
export async function getPreferences({ signal }: { signal?: AbortSignal } = {}): Promise<any> {
  const response = await apiServices.get(`${BASE}/preferences`, { signal });
  return response.data;
}

export async function updatePreferences({ body }: { body: any }): Promise<any> {
  const response = await apiServices.put(`${BASE}/preferences`, body);
  return response.data;
}
