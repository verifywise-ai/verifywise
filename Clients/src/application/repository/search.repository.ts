/**
 * @fileoverview Search Repository
 *
 * Repository layer for search functionality.
 * Provides abstraction over the infrastructure search service.
 *
 * @module application/repository/search.repository
 */

import {
  wiseSearch as infraWiseSearch,
  SearchParams,
  SearchResponse,
  GroupedSearchResults,
  SearchResult,
  getEntityDisplayName as infraGetEntityDisplayName,
  ENTITY_DISPLAY_NAMES,
} from "../../infrastructure/api/searchService";

// Re-export types for consumers
export type { SearchParams, SearchResponse, GroupedSearchResults, SearchResult };

/**
 * Perform a Wise Search across all entities
 *
 * @param params - Search parameters
 * @returns Promise resolving to grouped search results
 */
export async function performWiseSearch(params: SearchParams): Promise<SearchResponse> {
  return infraWiseSearch(params);
}

/**
 * Get display name for entity type
 *
 * @param entityType - The entity type key
 * @returns Human-readable display name
 */
export function getEntityDisplayName(entityType: string): string {
  return infraGetEntityDisplayName(entityType);
}

/**
 * Entity display names mapping
 */
export { ENTITY_DISPLAY_NAMES };
