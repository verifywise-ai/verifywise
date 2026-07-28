import { GetRequestParams } from "../../domain/interfaces/i.requestParams";
import { apiServices } from "../../infrastructure/api/networkServices";
import { RequestParams } from "../../domain/interfaces/i.requestParams";

/**
 * Retrieves the current user's organization details.
 *
 * @param {GetRequestParams} params - The parameters for the request.
 * @returns {Promise<any>} The organization data retrieved from the API.
 * @throws Will throw an error if the request fails.
 */
export async function GetMyOrganization({
  routeUrl,
  signal,
  responseType = "json",
}: GetRequestParams): Promise<any> {
  const response = await apiServices.get(routeUrl, {
    signal,
    responseType,
  });
  return response;
}

/**
 * Creates a new organization for the current user.
 *
 * @param {RequestParams} params - The parameters for creating a new organization.
 * @returns {Promise<any>} A promise that resolves to the response data of the created organization.
 * @throws Will throw an error if the organization creation fails.
 */
export async function CreateMyOrganization({
  routeUrl = "/organizations",
  body,
}: RequestParams): Promise<any> {
  const response = await apiServices.post(routeUrl, body);
  return response;
}

/**
 * Updates the current user's organization details.
 *
 * @param {RequestParams} params - The parameters for updating the organization.
 * @returns {Promise<any>} A promise that resolves to the updated organization data.
 * @throws Will throw an error if the update operation fails.
 */
export async function UpdateMyOrganization({
  routeUrl = "/organizations",
  body,
  headers,
}: RequestParams): Promise<any> {
  const response = await apiServices.patch(routeUrl, body, {
    headers: { ...headers },
  });
  return response.data;
}

/**
 * Checks if any organization exists in the system.
 *
 * @returns {Promise<boolean>} True if at least one organization exists.
 * @throws Will throw an error if the request fails.
 */
export async function checkOrganizationExists(): Promise<boolean> {
  const response = await apiServices.get("/organizations/exists");
  const data = response.data as { data?: { exists?: boolean } };
  return data?.data?.exists ?? false;
}

/**
 * Updates the onboarding status of an organization to 'completed'.
 * Called after user selects demo data or blank dashboard option.
 *
 * @param {number} organizationId - The ID of the organization to update.
 * @returns {Promise<any>} The response from the API.
 * @throws Will throw an error if the request fails.
 */
export async function updateOnboardingStatus(organizationId: number): Promise<any> {
  const response = await apiServices.patch(`/organizations/${organizationId}/onboarding-status`);
  return response.data;
}
