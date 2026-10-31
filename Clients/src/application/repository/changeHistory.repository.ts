/**
 * Generic Change History Repository
 *
 * API functions for fetching change history for any entity type.
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import { EntityType } from "../../config/changeHistory.config";

/**
 * Entity types whose history endpoints were added after the API versioning
 * policy (docs/technical/adr/0001-api-versioning.md), so they are served
 * under /api/v1. Older types keep their unversioned paths.
 */
const V1_HISTORY_ENTITY_TYPES = new Set<EntityType>([
  "evidence_hub",
  "model_lifecycle",
  "control_eu",
  "subcontrol_eu",
  "annex_category",
]);

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
  // Convert entity_type to route format (e.g., "model_inventory" -> "model-inventory")
  const routeType = entityType.replace(/_/g, "-");
  const prefix = V1_HISTORY_ENTITY_TYPES.has(entityType) ? "/v1" : "";
  const response = await apiServices.get(
    `${prefix}/${routeType}-change-history/${entityId}?limit=${limit}&offset=${offset}`,
  );
  // API returns { message: "OK", data: { data: [...], hasMore: boolean, total: number } }
  return (response.data as any).data;
};
