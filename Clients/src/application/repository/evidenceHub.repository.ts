/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Creates a new evidence hub entry in the database.
 */
export async function createEvidenceHub(routeUrl: string, data: any): Promise<any> {
  const response = await apiServices.post(routeUrl, data);
  return response.data;
}
