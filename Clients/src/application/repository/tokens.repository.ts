import { RequestParams } from "../../domain/interfaces/i.requestParams";
import { apiServices } from "../../infrastructure/api/networkServices";

export async function createApiToken({ routeUrl, body }: RequestParams): Promise<any> {
  const response = await apiServices.post(routeUrl, body);
  return response;
}

export async function getApiTokens({ routeUrl }: RequestParams): Promise<any> {
  const response = await apiServices.get(routeUrl);
  return response;
}

export async function deleteApiToken({ routeUrl }: RequestParams): Promise<any> {
  const response = await apiServices.delete(routeUrl);
  return response;
}
