export type SSOProvider = "AzureAD";

export interface AzureADConfigData {
  client_id: string;
  client_secret: string;
  tenant_id: string;
  cloud_environment?: "AzurePublic" | "AzureGovernment";
}

export interface ISSOConfiguration {
  id?: number;
  organization_id: number;
  provider: SSOProvider;
  is_enabled: boolean;
  config_data: AzureADConfigData;
  created_at?: Date;
  updated_at?: Date;
}
