import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import {
  getBadgesByEntityQuery,
  markReviewedQuery,
  getUnreviewedQuery,
  getStatsQuery,
} from "../utils/aiContent.utils";

const fileName = "aiContent.ctrl.ts";

/**
 * GET /api/ai-content/:entityType/:entityId
 * Get AI content badges for a specific entity.
 */
export async function getBadges(req: Request, res: Response) {
  const functionName = "getBadges";
  const entityType = String(req.params.entityType);
  const entityId = String(req.params.entityId);
  const parsedEntityId = parseInt(entityId);

  if (!entityType || isNaN(parsedEntityId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid entity type or ID"));
  }

  try {
    const visFilter = req.query.visibility ? String(req.query.visibility) : undefined;
    const badges = await getBadgesByEntityQuery(
      entityType,
      parsedEntityId,
      req.organizationId!,
      req.userId ? Number(req.userId) : null,
      visFilter,
    );

    logStructured(
      "successful",
      `badges fetched for ${entityType}:${entityId}`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](badges));
  } catch (error) {
    logStructured("error", "failed to get badges", functionName, fileName);
    logger.error("Error in getBadges:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * PATCH /api/ai-content/:id/review
 * Mark AI content as reviewed (approved/modified/rejected).
 */
export async function reviewContent(req: Request, res: Response) {
  const functionName = "reviewContent";
  const id = parseInt(String(req.params.id));

  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid content ID"));
  }

  const { review_action } = req.body;
  if (!review_action || !["approved", "modified", "rejected"].includes(review_action)) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("review_action must be 'approved', 'modified', or 'rejected'"));
  }

  logStructured("processing", `reviewing AI content ${id}`, functionName, fileName);

  try {
    const userId = req.userId ? Number(req.userId) : 0;
    const result = await markReviewedQuery(id, req.organizationId!, {
      review_action,
      reviewed_by: userId,
    });

    if (!result) {
      return res.status(404).json(STATUS_CODE[404]("AI content not found"));
    }

    logStructured(
      "successful",
      `AI content ${id} marked as ${review_action}`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to review AI content", functionName, fileName);
    logger.error("Error in reviewContent:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-content/unreviewed
 * List all unreviewed AI content.
 */
export async function getUnreviewed(req: Request, res: Response) {
  const functionName = "getUnreviewed";

  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const visFilter = req.query.visibility ? String(req.query.visibility) : undefined;
    const result = await getUnreviewedQuery(
      req.organizationId!,
      limit,
      offset,
      req.userId ? Number(req.userId) : null,
      visFilter,
    );

    logStructured(
      "successful",
      `${result.items.length} unreviewed items fetched`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to get unreviewed content", functionName, fileName);
    logger.error("Error in getUnreviewed:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/ai-content/stats
 * AI content statistics for dashboard.
 */
export async function getStats(req: Request, res: Response) {
  const functionName = "getStats";

  try {
    const visFilter = req.query.visibility ? String(req.query.visibility) : undefined;
    const stats = await getStatsQuery(
      req.organizationId!,
      req.userId ? Number(req.userId) : null,
      visFilter,
    );

    logStructured("successful", "AI content stats fetched", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    logStructured("error", "failed to get AI content stats", functionName, fileName);
    logger.error("Error in getStats:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
