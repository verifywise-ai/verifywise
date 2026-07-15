/* eslint-disable @typescript-eslint/no-explicit-any */
import { GetRequestParams, RequestParams } from "../../domain/interfaces/i.requestParams";
import { apiServices } from "../../infrastructure/api/networkServices";
import { getDeduped } from "../../infrastructure/api/inflightGet";

/**
 * Creates a new user by sending a POST request to the specified route URL with the provided body.
 *
 * @param {RequestParams} params - The parameters for creating a new user.
 * @returns {Promise<any>} A promise that resolves to the response data of the created user.
 * @throws Will throw an error if the user creation fails.
 */
export async function createNewUser({ routeUrl, body }: RequestParams): Promise<any> {
  const response = await apiServices.post(routeUrl, body);
  return response;
}

/**
 * Logs in a user by sending a POST request to the specified route URL with the provided credentials.
 *
 * @param {RequestParams} params - The parameters for the login request.
 * @returns {Promise<any>} A promise that resolves to the response data of the logged-in user.
 * @throws Will throw an error if the login fails.
 */
export async function loginUser({ routeUrl, body }: RequestParams): Promise<any> {
  const response = await apiServices.post(routeUrl, body);
  return response;
}

/**
 * Retrieves a user by their ID from the specified route URL.
 *
 * @param {RequestParams} params - The parameters for the request.
 * @returns {Promise<any>} The user data retrieved from the API.
 * @throws Will throw an error if the request fails.
 */
export async function getEntityById({
  routeUrl,
  signal,
  responseType = "json",
}: GetRequestParams): Promise<any> {
  const response = await apiServices.get(routeUrl, {
    signal,
    responseType,
  });
  return response.data;
}

/**
 * Updates a user entity by its ID.
 *
 * @param {RequestParams} params - The parameters for the update operation.
 * @returns {Promise<any>} The updated entity data.
 * @throws Will throw an error if the update operation fails.
 */
export async function updateEntityById({ routeUrl, body, headers }: RequestParams): Promise<any> {
  const response = await apiServices.patch(routeUrl, body, {
    headers: { ...headers },
  });
  return response;
}

/**
 * Deletes a user by their ID.
 *
 * @param {RequestParams} params - The parameters for the function.
 * @returns {Promise<any>} The response data from the delete operation.
 * @throws Will throw an error if the delete operation fails.
 */
export async function deleteEntityById({ routeUrl }: RequestParams): Promise<any> {
  const response = await apiServices.delete(routeUrl);
  return response;
}

/**
 * Fetches all users from the API.
 *
 * @param {RequestParams} params - The parameters for the request.
 * @returns {Promise<any>} A promise that resolves to the data of all users.
 * @throws Will throw an error if the API request fails.
 */
export async function getAllEntities({
  routeUrl,
  params,
}: RequestParams & { params?: Record<string, any> }): Promise<any> {
  // Deduped: list fetches (e.g. /projects) are requested by several dashboard
  // consumers at mount. Concurrent identical GETs share one in-flight request.
  const response = await getDeduped(routeUrl, { params });
  return response.data;
}

/**
 * Checks if any user exists in the database.
 *
 * @param {RequestParams} params - The parameters for the request.
 * @returns {Promise<any>} The response data indicating if a user exists.
 * @throws Will throw an error if the request fails.
 */
export async function checkUserExists({ routeUrl }: RequestParams): Promise<any> {
  const response = await apiServices.get(routeUrl);
  return response.data;
}

/**
 * Creates demo data by sending a POST request to the autoDrivers endpoint.
 *
 * @returns {Promise<any>} A promise that resolves to the response data.
 * @throws Will throw an error if the request fails.
 */
export async function postAutoDrivers(): Promise<any> {
  const response = await apiServices.post("/autoDrivers");
  return response;
}

/**
 * Checks if demo data exists by querying for demo projects.
 *
 * @returns {Promise<boolean>} A promise that resolves to true if demo data exists, false otherwise.
 */
export async function checkDemoDataExists(): Promise<boolean> {
  try {
    const response = await apiServices.get("/projects");
    const projects = response.data as Array<{ project_title: string }>;

    // Check if any project has demo-specific titles
    const demoProjectTitles = [
      "AI Compliance Checker",
      "Information Security & AI Governance Framework",
    ];
    const hasDemoProjects = projects.some((project) =>
      demoProjectTitles.includes(project.project_title),
    );

    return hasDemoProjects;
  } catch {
    return false;
  }
}

/**
 * Deletes demo data by sending a DELETE request to the autoDrivers endpoint.
 *
 * @returns {Promise<any>} A promise that resolves to the response data.
 * @throws Will throw an error if the request fails.
 */
export async function deleteAutoDrivers(): Promise<any> {
  const response = await apiServices.delete("/autoDrivers");
  return response;
}

export async function resetPassword({ routeUrl, body }: RequestParams): Promise<any> {
  const response = await apiServices.post(routeUrl, body);
  return response;
}

/**
 * Fetches all users from the database.
 *
 * @param {RequestParams} params - The parameters for the request.
 * @returns {Promise<any>} A promise that resolves to the list of users.
 * @throws Will throw an error if the request fails.
 */
export async function getAllUsers(): Promise<any> {
  const response = await apiServices.get("/users");
  return response.data;
}

/**
 * Create generated reports.
 *
 * @param {RequestParams} params - The parameters for the request.
 * @returns {Promise<any>} A promise that resolves returning the generated report.
 * @throws Will throw an error if the request fails.
 */
export async function generateReport({ routeUrl, body, signal }: RequestParams): Promise<any> {
  const response = await apiServices.post(routeUrl, body, {
    signal,
    responseType: "blob",
  });

  return response;
}

export async function getAllFrameworks(): Promise<any> {
  const response = await apiServices.get("/frameworks");
  return response.data;
}

export const assignFrameworkToProject = async ({
  frameworkId,
  projectId,
}: {
  frameworkId: number;
  projectId: string;
}) => {
  const response = await apiServices.post(
    `/frameworks/toProject?frameworkId=${frameworkId}&projectId=${projectId}`,
    {},
  );

  return {
    status: response.status,
    data: response.data,
  };
};

/**
 * Archives an incident by updating its "isArchived" flag.
 *
 * @param {RequestParams} params - The parameters for the archive operation.
 * @returns {Promise<any>} A promise that resolves to the response after archiving the incident.
 * @throws Will throw an error if the archive operation fails.
 */
export async function archiveIncidentById({
  routeUrl,
  body,
  headers,
}: RequestParams): Promise<any> {
  // PATCH /incidents/:id/archive
  const response = await apiServices.patch(`${routeUrl}/archive`, body, {
    headers: { ...headers },
  });
  return response;
}
