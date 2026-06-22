import { wiseSearch, GroupedSearchResults } from "../../utils/search.utils";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

const globalSearch = async (
  params: { query: string; entity_types?: string[]; limit?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const results: GroupedSearchResults = await wiseSearch({
      query: params.query,
      organizationId,
      userId: 0, // Advisor uses org-level access
      limit: params.limit || 20,
    });

    // Filter by entity_types if specified
    if (params.entity_types && params.entity_types.length > 0) {
      const filtered: GroupedSearchResults = {};
      for (const entityType of params.entity_types) {
        if (results[entityType]) {
          filtered[entityType] = results[entityType];
        }
      }
      return {
        results: filtered,
        total_matches: Object.values(filtered).reduce((sum, g) => sum + g.count, 0),
        entity_types_searched: params.entity_types,
      };
    }

    return {
      results,
      total_matches: Object.values(results).reduce((sum, g) => sum + g.count, 0),
      entity_types_found: Object.keys(results),
    };
  } catch (error) {
    logger.error("Error in global search:", error);
    throw new Error(
      `Failed to perform global search: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const searchWithinEntity = async (
  params: {
    entity_type: string;
    query: string;
    filters?: { review_status?: string };
    limit?: number;
  },
  organizationId: number,
): Promise<any> => {
  try {
    const results: GroupedSearchResults = await wiseSearch({
      query: params.query,
      organizationId,
      userId: 0, // Advisor uses org-level access
      limit: params.limit || 20,
      reviewStatus: params.filters?.review_status,
    });

    // Return only the requested entity type
    const entityResults = results[params.entity_type];

    return {
      entity_type: params.entity_type,
      results: entityResults?.results || [],
      count: entityResults?.count || 0,
      query: params.query,
      filters_applied: params.filters || {},
    };
  } catch (error) {
    logger.error("Error in entity search:", error);
    throw new Error(
      `Failed to search within entity: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableSearchTools: any = {
  global_search: globalSearch,
  search_within_entity: searchWithinEntity,
};

export { availableSearchTools };
