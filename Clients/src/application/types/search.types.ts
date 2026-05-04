/**
 * Search Types
 *
 * Application layer type definitions for search functionality.
 * Re-exports types from infrastructure for use by presentation layer.
 *
 * @module application/types/search
 */

export type {
  SearchResult,
  GroupedSearchResults,
  SearchResponse,
  SearchParams,
} from "../../infrastructure/api/searchService";

export { ENTITY_DISPLAY_NAMES, getEntityDisplayName } from "../../infrastructure/api/searchService";
