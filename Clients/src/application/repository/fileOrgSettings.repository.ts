import { apiServices } from "../../infrastructure/api/networkServices";
import type { RetentionPolicy } from "../../domain/enums/retention.enum";

export interface FileOrgSettings {
  organization_id: number;
  default_retention_policy: RetentionPolicy | null;
}

export interface FileOrgSettingsUpdate {
  default_retention_policy: RetentionPolicy | null;
}

const ROUTE = "/file-manager/org-settings";

export async function getFileOrgSettings(): Promise<FileOrgSettings> {
  const response = await apiServices.get(ROUTE);
  return (response.data as { data: FileOrgSettings }).data;
}

export async function updateFileOrgSettings(
  update: FileOrgSettingsUpdate,
): Promise<FileOrgSettings> {
  const response = await apiServices.put(ROUTE, update);
  return (response.data as { data: FileOrgSettings }).data;
}
