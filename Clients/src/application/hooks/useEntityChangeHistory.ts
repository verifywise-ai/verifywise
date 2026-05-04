/**
 * Generic Entity Change History Hook
 *
 * A reusable hook for fetching change history for any entity type.
 * Works with the generic change history repository.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { EntityType } from "../../config/changeHistory.config";
import { getEntityChangeHistory } from "../repository/changeHistory.repository";

export interface EntityChangeHistoryEntry {
  id: number;
  action: "created" | "updated" | "deleted";
  field_name?: string;
  old_value?: string;
  new_value?: string;
  changed_by_user_id: number;
  changed_at: string;
  user_name?: string;
  user_surname?: string;
  user_email?: string;
}

/**
 * Hook for fetching entity change history with infinite scroll/pagination support
 *
 * @param entityType - The type of entity (e.g., "model_inventory", "vendor")
 * @param entityId - The ID of the entity
 * @returns Infinite query result with change history data and pagination controls
 */
export const useEntityChangeHistory = (
  entityType: EntityType | undefined,
  entityId: number | undefined,
) => {
  return useInfiniteQuery({
    queryKey: ["changeHistory", entityType, entityId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!entityId || !entityType) {
        return { data: [], hasMore: false, total: 0 };
      }
      const limit = 100;
      const offset = pageParam;
      return await getEntityChangeHistory(entityType, entityId, limit, offset);
    },
    enabled: !!entityId && !!entityType,
    staleTime: 30000, // Cache for 30 seconds
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        // Calculate next offset based on total items fetched so far
        const totalFetched = allPages.reduce((sum, page) => sum + page.data.length, 0);
        return totalFetched;
      }
      return undefined; // No more pages
    },
    initialPageParam: 0,
  });
};
