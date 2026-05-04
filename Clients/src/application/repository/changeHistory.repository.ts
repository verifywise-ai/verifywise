/**
 * Generic Change History Repository
 *
 * API functions for fetching change history for any entity type.
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import { EntityType } from "../../config/changeHistory.config";

export interface ChangeHistoryResponse {
  data: any[];
  hasMore: boolean;
  total: number;
}

/**
 * Get change history for a specific entity with pagination support
 *
 * @param entityType - The type of entity
 * @param entityId - The ID of the entity
 * @param limit - Number of entries to fetch (default: 100)
 * @param offset - Number of entries to skip (default: 0)
 * @returns Promise with change history data and pagination info
 */
export const getEntityChangeHistory = async (
  entityType: EntityType,
  entityId: number,
  limit: number = 100,
  offset: number = 0,
): Promise<ChangeHistoryResponse> => {
  try {
    // Convert entity_type to route format (e.g., "model_inventory" -> "model-inventory")
    const routeType = entityType.replace(/_/g, "-");
    const response = await apiServices.get(
      `/${routeType}-change-history/${entityId}?limit=${limit}&offset=${offset}`,
    );
    // API returns { message: "OK", data: { data: [...], hasMore: boolean, total: number } }
    return (response.data as any).data;
  } catch (error) {
    console.error(`Error getting ${entityType} change history:`, error);
    throw error;
  }
};
