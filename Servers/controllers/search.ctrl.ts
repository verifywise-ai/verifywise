/**
 * @fileoverview Wise Search Controller
 *
 * Handles global search requests across all database entities.
 * Implements multi-tenant isolation and permission-based filtering.
 *
 * @module controllers/search
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { wiseSearch, getTotalResultCount, GroupedSearchResults, SEARCH_CONSTANTS } from "../utils/search.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";

/**
 * Search across all entities
 *
 * @route GET /api/search
 * @query {string} q - Search query (min 3 characters)
 * @query {number} limit - Maximum results per entity type (default: 20)
 * @query {number} offset - Pagination offset (default: 0)
 *
 * @returns {Object} Grouped search results by entity type
 */
export async function search(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Starting Wise Search",
    functionName: "search",
    fileName: "search.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, tenantId, organizationId } = req;

    if (!userId || !tenantId || !organizationId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = (req.query.q as string) || "";
    const rawLimit = parseInt(req.query.limit as string, 10) || SEARCH_CONSTANTS.DEFAULT_LIMIT;
    const limit = Math.min(Math.max(1, rawLimit), SEARCH_CONSTANTS.MAX_LIMIT);
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
    const reviewStatus = (req.query.reviewStatus as string) || undefined;

    // Validate minimum query length (skip if a reviewStatus filter is active)
    if (query.trim().length < SEARCH_CONSTANTS.MIN_QUERY_LENGTH && !reviewStatus) {
      return res.status(200).json(
        STATUS_CODE[200]({
          results: {},
          totalCount: 0,
          query,
          message: `Query must be at least ${SEARCH_CONSTANTS.MIN_QUERY_LENGTH} characters`,
        })
      );
    }

    // Perform search
    const results: GroupedSearchResults = await wiseSearch({
      query: query.trim(),
      organizationId,
      userId,
      limit,
      offset,
      reviewStatus,
    });

    const totalCount = getTotalResultCount(results);

    await logSuccess({
      eventType: "Read",
      description: `Wise Search completed: "${query}" returned ${totalCount} results`,
      functionName: "search",
      fileName: "search.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        results,
        totalCount,
        query,
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Wise Search failed",
      functionName: "search",
      fileName: "search.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
