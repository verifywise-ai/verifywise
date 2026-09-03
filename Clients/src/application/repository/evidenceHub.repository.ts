/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Creates a new incident management entry in the database.
 *
 * @param {string} routeUrl - The API route URL.
 * @param {any} data - The incident management data to be saved.
 * @param {string} [authToken=getAuthToken()] - Optional auth token.
 * @returns {Promise<any>} The response from the API.
 */
export async function createEvidenceHub(routeUrl: string, data: any): Promise<any> {
  const response = await apiServices.post(routeUrl, data);
  return response.data;
}

// ---- Org-wide Evidence Hub settings (retention policy) ----

export interface EvidenceHubOrgSettings {
  organization_id: number;
  default_retention_period: string | null;
  archive_on_expiry: boolean;
}

export interface EvidenceHubOrgSettingsUpdate {
  default_retention_period?: string | null;
  archive_on_expiry?: boolean;
}

export async function getEvidenceHubSettings(): Promise<EvidenceHubOrgSettings> {
  const response = await apiServices.get("/evidenceHub/settings");
  return (response.data as { data: EvidenceHubOrgSettings }).data;
}

export async function updateEvidenceHubSettings(
  update: EvidenceHubOrgSettingsUpdate,
): Promise<EvidenceHubOrgSettings> {
  const response = await apiServices.put("/evidenceHub/settings", update);
  return (response.data as { data: EvidenceHubOrgSettings }).data;
}

