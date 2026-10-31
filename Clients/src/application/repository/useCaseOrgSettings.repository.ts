import { apiServices } from "../../infrastructure/api/networkServices";

/** What a new use case starts with in this organization. */
export interface UseCaseOrgSettings {
  organization_id: number;
  default_geography: number | null;
  default_framework_ids: number[];
}

export interface UseCaseOrgSettingsUpdate {
  default_geography?: number | null;
  default_framework_ids?: number[];
}

const ROUTE = "/v1/use-case-org-settings";

export async function getUseCaseOrgSettings(): Promise<UseCaseOrgSettings> {
  const response = await apiServices.get(ROUTE);
  return (response.data as { data: UseCaseOrgSettings }).data;
}

export async function updateUseCaseOrgSettings(
  update: UseCaseOrgSettingsUpdate,
): Promise<UseCaseOrgSettings> {
  const response = await apiServices.put(ROUTE, update);
  return (response.data as { data: UseCaseOrgSettings }).data;
}
