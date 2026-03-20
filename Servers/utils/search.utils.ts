/**
 * @fileoverview Wise Search Utilities
 *
 * Provides unified search functionality across all database tables.
 * Implements ILIKE-based case-insensitive search with multi-tenant isolation.
 *
 * Search Features:
 * - Case-insensitive search using PostgreSQL ILIKE
 * - Multi-tenant schema isolation
 * - Organization-scoped filtering where applicable
 * - Project-based access control
 * - Result grouping by entity type
 * - Match highlighting support
 *
 * @module utils/search
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Search constants
 */
export const SEARCH_CONSTANTS = {
  MIN_QUERY_LENGTH: 3,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

/**
 * Validate organization ID
 */
function validateOrganizationId(organizationId: number): void {
  if (!organizationId || !Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error("Invalid organization ID");
  }
}

/**
 * Whitelist of allowed table names for search queries
 * This prevents SQL injection via table name manipulation
 */
const ALLOWED_TABLE_NAMES = new Set([
  "projects",
  "tasks",
  "vendors",
  "vendor_risks",
  "model_inventories",
  "evidence_hub",
  "risks",
  "files",
  "policy_manager",
  "ai_trust_center_resources",
  "ai_trust_center_subprocessor",
  "trainingregistar",
  "ai_incident_managements",
  "llm_evals_projects",
]);

/**
 * Validate table name against whitelist to prevent SQL injection
 */
function validateTableName(tableName: string): string {
  if (!ALLOWED_TABLE_NAMES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return tableName;
}

/**
 * Escape ILIKE special characters in search query
 * Escapes %, _, and \ which have special meaning in ILIKE
 */
function escapeILikePattern(query: string): string {
  return query
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Search result interface for individual matches
 */
export interface SearchResult {
  id: number | string;
  entityType: string;
  title: string;
  subtitle?: string;
  matchedField: string;
  matchedValue: string;
  route: string;
  icon?: string;
}

/**
 * Grouped search results by entity type
 */
export interface GroupedSearchResults {
  [entityType: string]: {
    results: SearchResult[];
    count: number;
    icon: string;
  };
}

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  organizationId: number;
  userId: number;
  limit?: number;
  offset?: number;
  /** Optional review status filter (e.g. "draft", "pending_review", "approved", "rejected", "expired", "superseded") */
  reviewStatus?: string;
}

/**
 * Entity configuration for search
 */
interface EntityConfig {
  tableName: string;
  searchColumns: string[];
  titleColumn: string;
  subtitleColumn?: string;
  icon: string;
  route: (id: number | string) => string;
  requiresProjectAccess?: boolean;
  requiresVendorAccess?: boolean;
  projectColumn?: string;
  /** Column name for review_status filtering (if the entity supports it) */
  reviewStatusColumn?: string;
}

/**
 * Entity configurations for all searchable tables
 */
const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  projects: {
    tableName: "projects",
    searchColumns: ["project_title", "goal", "target_industry", "description"],
    titleColumn: "project_title",
    subtitleColumn: "description",
    icon: "FolderTree",
    route: (id) => `/overview?projectId=${id}`,
    requiresProjectAccess: true,
  },
  tasks: {
    tableName: "tasks",
    searchColumns: ["title", "description"],
    titleColumn: "title",
    icon: "Flag",
    route: (id) => `/tasks?taskId=${id}`,
  },
  vendors: {
    tableName: "vendors",
    searchColumns: ["vendor_name", "vendor_provides", "website", "vendor_contact_person", "review_result"],
    titleColumn: "vendor_name",
    subtitleColumn: "vendor_provides",
    icon: "Building2",
    route: (id) => `/vendors?vendorId=${id}`,
    // No project access required - vendors are visible to all users in tenant (matches Vendors page behavior)
    reviewStatusColumn: "review_status",
  },
  vendor_risks: {
    tableName: "vendor_risks",
    searchColumns: ["risk_description", "impact_description", "action_plan"],
    titleColumn: "risk_description",
    subtitleColumn: "impact_description",
    icon: "AlertTriangle",
    route: (id) => `/vendors?tab=risks&riskId=${id}`,
    requiresVendorAccess: true,
  },
  model_inventories: {
    tableName: "model_inventories",
    searchColumns: ["provider", "model", "version", "approver", "capabilities", "biases", "limitations", "hosting_provider"],
    titleColumn: "model",
    subtitleColumn: "provider",
    icon: "GitBranch",
    route: (id) => `/model-inventory?modelId=${id}`,
    // Note: model_inventories links to projects via junction table model_inventories_projects_frameworks
    // For now, we search all model inventories in the tenant schema (tenant isolation provides security)
  },
  evidence_hub: {
    tableName: "evidence_hub",
    searchColumns: ["evidence_name", "evidence_type", "description"],
    titleColumn: "evidence_name",
    subtitleColumn: "description",
    icon: "FileCheck",
    route: (id) => `/model-inventory/evidence-hub?evidenceId=${id}`,
  },
  project_risks: {
    tableName: "risks",
    searchColumns: ["risk_name", "risk_description", "impact", "mitigation_plan", "review_notes"],
    titleColumn: "risk_name",
    subtitleColumn: "risk_description",
    icon: "AlertTriangle",
    route: (id) => `/risk-management?riskId=${id}`,
    // Note: risks table contains actual risk data; projects_risks is a junction table
    // Tenant schema isolation provides security
  },
  file_manager: {
    tableName: "files",
    // We keep filename as the title, but search across additional
    // metadata fields (description, review_status, expiry_date, tags)
    // so that files can be discovered by more than just their name.
    // Also include content_text so Wise Search can match on extracted file contents.
    searchColumns: ["filename", "description", "review_status", "expiry_date", "tags", "content_text"],
    titleColumn: "filename",
    icon: "Folder",
    route: (id) => `/file-manager?fileId=${id}`,
    // Note: For file manager, we only search org-level files (project_id IS NULL)
    // This is handled via additionalWhereClause in the search query
    reviewStatusColumn: "review_status",
  },
  policy_manager: {
    tableName: "policy_manager",
    searchColumns: ["title", "content_html"],
    titleColumn: "title",
    icon: "Shield",
    route: (id) => `/policies?policyId=${id}`,
  },
  ai_trust_center_resources: {
    tableName: "ai_trust_center_resources",
    searchColumns: ["name", "description"],
    titleColumn: "name",
    subtitleColumn: "description",
    icon: "Brain",
    route: (id) => `/ai-trust-center/resources?resourceId=${id}`,
  },
  ai_trust_center_subprocessors: {
    tableName: "ai_trust_center_subprocessor",
    searchColumns: ["name", "purpose", "location"],
    titleColumn: "name",
    subtitleColumn: "purpose",
    icon: "Telescope",
    route: (id) => `/ai-trust-center/subprocessors?subprocessorId=${id}`,
  },
  training_registar: {
    tableName: "trainingregistar",
    searchColumns: ["training_name", "provider", "department"],
    titleColumn: "training_name",
    subtitleColumn: "provider",
    icon: "GraduationCap",
    route: (id) => `/training?trainingId=${id}`,
  },
  incident_management: {
    tableName: "ai_incident_managements",
    searchColumns: ["ai_project", "reporter", "description", "immediate_mitigations"],
    titleColumn: "ai_project",
    subtitleColumn: "description",
    icon: "AlertCircle",
    route: (id) => `/ai-incident-managements?incidentId=${id}`,
  },
  llm_evals_projects: {
    tableName: "llm_evals_projects",
    searchColumns: ["name", "description"],
    titleColumn: "name",
    subtitleColumn: "description",
    icon: "FlaskConical",
    route: (id) => `/evals/${id}`,
    // Note: No tenantColumn filter needed - schema isolation is sufficient
    // The EvalServer stores "default" in tenant column but uses schema "a4ayc80OGd"
  },
};

/**
 * Builds the ILIKE conditions for a set of columns
 */
function buildILikeConditions(columns: string[], paramName: string): string {
  return columns.map((col) => `${col}::text ILIKE :${paramName}`).join(" OR ");
}

/**
 * Get the first matching column and its value for highlighting
 */
function getMatchedField(row: any, columns: string[], query: string): { field: string; value: string } {
  const lowerQuery = query.toLowerCase();
  for (const col of columns) {
    const value = row[col];
    if (value && value.toString().toLowerCase().includes(lowerQuery)) {
      return { field: col, value: value.toString() };
    }
  }
  return { field: columns[0], value: row[columns[0]]?.toString() || "" };
}

/**
 * Get user's accessible project IDs
 */
async function getUserProjectIds(organizationId: number, userId: number): Promise<number[]> {
  try {
    validateOrganizationId(organizationId);
    const result = await sequelize.query<{ project_id: number }>(
      `SELECT project_id FROM projects_members WHERE user_id = :userId AND organization_id = :organizationId`,
      {
        replacements: { userId, organizationId },
        type: QueryTypes.SELECT,
      }
    );
    return result.map((r) => r.project_id);
  } catch (error) {
    console.error("Error fetching user project IDs:", error);
    return [];
  }
}

/**
 * Get vendor IDs accessible to user through their projects
 */
async function getUserVendorIds(organizationId: number, projectIds: number[]): Promise<number[]> {
  if (projectIds.length === 0) return [];

  try {
    validateOrganizationId(organizationId);
    const result = await sequelize.query<{ vendor_id: number }>(
      `SELECT DISTINCT vendor_id FROM vendors_projects WHERE project_id IN (:projectIds) AND organization_id = :organizationId`,
      {
        replacements: { projectIds, organizationId },
        type: QueryTypes.SELECT,
      }
    );
    return result.map((r) => r.vendor_id);
  } catch (error) {
    console.error("Error fetching user vendor IDs:", error);
    return [];
  }
}

/**
 * Search a single entity type
 */
async function searchEntity(
  config: EntityConfig,
  entityType: string,
  options: SearchOptions,
  projectIds: number[],
  vendorIds: number[]
): Promise<SearchResult[]> {
  const { query, organizationId, limit = 20, reviewStatus } = options;

  // If a reviewStatus filter is active, skip entities that don't have a review_status column
  if (reviewStatus && !config.reviewStatusColumn) {
    return [];
  }

  // Validate organizationId and escape query for ILIKE
  validateOrganizationId(organizationId);
  const hasTextQuery = query && query.trim().length >= SEARCH_CONSTANTS.MIN_QUERY_LENGTH;

  // Build WHERE conditions
  const conditions: string[] = [];
  const replacements: Record<string, any> = {};

  // Add ILIKE search conditions only if there is a text query
  if (hasTextQuery) {
    const escapedQuery = escapeILikePattern(query);
    const searchPattern = `%${escapedQuery}%`;
    replacements.searchPattern = searchPattern;

    if (entityType === "file_manager") {
      // For file manager, search across filename and key metadata fields.
      // tags is JSONB, so we cast to text for simple ILIKE matching.
      const fileSearchConditions = [
        "filename::text ILIKE :searchPattern",
        "description::text ILIKE :searchPattern",
        "review_status::text ILIKE :searchPattern",
        "expiry_date::text ILIKE :searchPattern",
        "tags::text ILIKE :searchPattern",
        "content_text::text ILIKE :searchPattern",
      ];
      conditions.push(`(${fileSearchConditions.join(" OR ")})`);
    } else {
      conditions.push(`(${buildILikeConditions(config.searchColumns, "searchPattern")})`);
    }
  }

  // Always add organization filter for shared-schema multi-tenancy
  conditions.push(`organization_id = :organizationId`);
  replacements.organizationId = organizationId;

  // Add project access filter if applicable
  if (config.requiresProjectAccess) {
    if (projectIds.length === 0) return [];

    // For projects table, filter by id directly
    if (entityType === "projects") {
      conditions.push(`id IN (:projectIds)`);
      replacements.projectIds = projectIds;
    }
    // For vendors, filter by accessible vendor IDs
    else if (entityType === "vendors") {
      if (vendorIds.length === 0) return [];
      conditions.push(`id IN (:vendorIds)`);
      replacements.vendorIds = vendorIds;
    }
    // For entities with project_id column
    else if (config.projectColumn) {
      conditions.push(`${config.projectColumn} IN (:projectIds)`);
      replacements.projectIds = projectIds;
    }
  }

  // Add vendor access filter if applicable (for vendor_risks)
  if (config.requiresVendorAccess) {
    if (vendorIds.length === 0) return [];
    conditions.push(`vendor_id IN (:vendorIds)`);
    replacements.vendorIds = vendorIds;
  }

  // Add review status exact-match filter if provided
  if (reviewStatus && config.reviewStatusColumn) {
    conditions.push(`${config.reviewStatusColumn} = :reviewStatus`);
    replacements.reviewStatus = reviewStatus;
  }

  // For file_manager searches, only include org-level files (project_id IS NULL)
  if (entityType === "file_manager") {
    conditions.push(`project_id IS NULL`);
  }

  // Validate table name against whitelist (SQL injection prevention)
  const safeTableName = validateTableName(config.tableName);

  // Build and execute query
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT DISTINCT * FROM ${safeTableName}
    ${whereClause}
    LIMIT :limit
  `;
  replacements.limit = Math.min(limit, SEARCH_CONSTANTS.MAX_LIMIT);

  try {
    const rows = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    return rows.map((row: any) => {
      const matched = getMatchedField(row, config.searchColumns, query);
      return {
        id: row.id,
        entityType,
        title: row[config.titleColumn]?.toString() || "",
        subtitle: config.subtitleColumn ? row[config.subtitleColumn]?.toString() : undefined,
        matchedField: matched.field,
        matchedValue: matched.value,
        route: config.route(row.id),
        icon: config.icon,
      };
    });
  } catch (error) {
    // Table might not exist in this tenant schema, skip silently
    console.error(`Search error for ${entityType}:`, (error as Error).message);
    return [];
  }
}

/**
 * Search across all entities
 */
export async function wiseSearch(options: SearchOptions): Promise<GroupedSearchResults> {
  const { query, organizationId, userId, reviewStatus } = options;

  // Minimum characters required for search (skip check if a reviewStatus filter is active)
  const hasTextQuery = query && query.trim().length >= SEARCH_CONSTANTS.MIN_QUERY_LENGTH;
  const hasFilter = !!reviewStatus;
  if (!hasTextQuery && !hasFilter) {
    return {};
  }

  // Get user's accessible project IDs for permission filtering
  const projectIds = await getUserProjectIds(organizationId, userId);

  // Get vendor IDs accessible through user's projects
  const vendorIds = await getUserVendorIds(organizationId, projectIds);

  // Search all entities in parallel
  const searchPromises = Object.entries(ENTITY_CONFIGS).map(async ([entityType, config]) => {
    const results = await searchEntity(config, entityType, options, projectIds, vendorIds);
    return { entityType, results, icon: config.icon };
  });

  const searchResults = await Promise.all(searchPromises);

  // Group results by entity type
  const grouped: GroupedSearchResults = {};
  for (const { entityType, results, icon } of searchResults) {
    if (results.length > 0) {
      grouped[entityType] = {
        results,
        count: results.length,
        icon,
      };
    }
  }

  return grouped;
}

/**
 * Get total count of search results across all entities
 */
export function getTotalResultCount(results: GroupedSearchResults): number {
  return Object.values(results).reduce((sum, group) => sum + group.count, 0);
}

/**
 * Flatten grouped results into a single array
 */
export function flattenResults(grouped: GroupedSearchResults): SearchResult[] {
  const flattened: SearchResult[] = [];
  for (const group of Object.values(grouped)) {
    flattened.push(...group.results);
  }
  return flattened;
}
