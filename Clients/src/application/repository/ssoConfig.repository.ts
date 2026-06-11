import { GetRequestParams, RequestParams } from "../../domain/interfaces/i.requestParams";
import { apiServices } from "../../infrastructure/api/networkServices";

let ssoFeaturePromise: Promise<boolean> | null = null;

export function GetSsoFeatureEnabled(): Promise<boolean> {
  if (!ssoFeaturePromise) {
    ssoFeaturePromise = apiServices
      .get("ssoConfig/feature")
      .then((response) => {
        const data = (response.data as any)?.data ?? response.data;
        return !!data?.enabled;
      })
      .catch(() => false);
  }
  return ssoFeaturePromise;
}

export async function GetSsoConfig({
  routeUrl,
  signal,
  responseType = "json",
}: GetRequestParams): Promise<any> {
  const response = await apiServices.get(routeUrl, { signal, responseType });
  return response;
}

export async function UpdateSsoConfig({ routeUrl, body }: RequestParams): Promise<any> {
  const response = await apiServices.put(routeUrl, body);
  return response.data;
}

export async function ToggleSsoStatus({ routeUrl, body }: RequestParams): Promise<any> {
  const response = await apiServices.put(routeUrl, body);
  return response.data;
}

export async function CheckSsoStatus(
  organizationId?: number,
  provider: string = "AzureAD",
): Promise<{
  isEnabled: boolean;
  hasConfig: boolean;
  organizationId?: number;
  tenantId?: string;
  clientId?: string;
}> {
  const params = new URLSearchParams({ provider });
  if (organizationId) params.set("organizationId", organizationId.toString());
  const response = await apiServices.get(`ssoConfig/check-status?${params.toString()}`);
  return (response.data as any)?.data ?? response.data;
}

export async function GetSsoOrgs(
  provider: string = "AzureAD",
): Promise<Array<{ id: number; name: string; ssoEnabled: boolean }>> {
  const response = await apiServices.get(`ssoConfig/orgs?provider=${provider}`);
  return (response.data as any)?.data ?? response.data;
}
