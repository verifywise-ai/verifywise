import CustomAxios from "../../infrastructure/api/customAxios";

export interface FeatureSettings {
  id: number;
  lifecycle_enabled: boolean;
  audit_ledger_enabled: boolean;
  updated_at: string;
  updated_by: number | null;
}

export async function getFeatureSettings(): Promise<FeatureSettings> {
  const response = await CustomAxios.get("/feature-settings");
  return response.data.data;
}

export async function updateFeatureSettings(
  settings: Partial<Pick<FeatureSettings, "lifecycle_enabled" | "audit_ledger_enabled">>
): Promise<FeatureSettings> {
  const response = await CustomAxios.patch("/feature-settings", settings);
  return response.data.data;
}
