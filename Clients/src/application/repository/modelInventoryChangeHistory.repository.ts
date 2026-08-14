import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Get change history for a specific model inventory
 */
export async function getModelInventoryChangeHistory(modelInventoryId: number): Promise<any> {
  const response = await apiServices.get(`/modelInventoryChangeHistory/${modelInventoryId}`);
  return response.data;
}
