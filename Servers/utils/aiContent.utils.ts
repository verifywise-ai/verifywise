import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";
import { buildVisibilityFilter } from "./visibility.utils";

/**
 * Get AI content badges for a specific entity.
 */
export async function getBadgesByEntityQuery(
  entityType: string,
  entityId: number,
  organizationId: number,
  userId?: number | null,
  visibility?: string,
): Promise<any[]> {
  try {
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [rows] = await sequelize.query(
      `SELECT * FROM ai_content_metadata
       WHERE entity_type = :entityType
         AND entity_id = :entityId
         AND organization_id = :organizationId
         ${vis.clause}
       ORDER BY created_at DESC`,
      { replacements: { entityType, entityId, organizationId, ...vis.replacements } },
    );
    return rows as any[];
  } catch (error) {
    logger.error("Error getting AI content badges:", error);
    throw error;
  }
}

/**
 * Mark AI content as reviewed.
 */
export async function markReviewedQuery(
  id: number,
  organizationId: number,
  data: {
    review_action: string;
    reviewed_by: number;
    review_notes?: string;
  },
): Promise<any | null> {
  try {
    const [rows] = await sequelize.query(
      `UPDATE ai_content_metadata
       SET human_reviewed = true,
           review_action = :reviewAction,
           reviewed_by = :reviewedBy,
           reviewed_at = NOW()
       WHERE id = :id
         AND organization_id = :organizationId
       RETURNING *`,
      {
        replacements: {
          id,
          organizationId,
          reviewAction: data.review_action,
          reviewedBy: data.reviewed_by,
        },
      },
    );
    return (rows as any[])[0] || null;
  } catch (error) {
    logger.error("Error marking AI content reviewed:", error);
    throw error;
  }
}

/**
 * Get all unreviewed AI content for an organization.
 */
export async function getUnreviewedQuery(
  organizationId: number,
  limit: number = 50,
  offset: number = 0,
  userId?: number | null,
  visibility?: string,
): Promise<{ items: any[]; total: number }> {
  try {
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM ai_content_metadata
       WHERE human_reviewed = false
         AND organization_id = :organizationId
         ${vis.clause}`,
      { replacements: { organizationId, ...vis.replacements } },
    );
    const total = parseInt((countResult as any[])[0]?.total, 10) || 0;

    const [rows] = await sequelize.query(
      `SELECT * FROM ai_content_metadata
       WHERE human_reviewed = false
         AND organization_id = :organizationId
         ${vis.clause}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { organizationId, limit, offset, ...vis.replacements } },
    );

    return { items: rows as any[], total };
  } catch (error) {
    logger.error("Error getting unreviewed AI content:", error);
    throw error;
  }
}

/**
 * Get AI content statistics for dashboard.
 */
export async function getStatsQuery(
  organizationId: number,
  userId?: number | null,
  visibility?: string,
): Promise<any> {
  try {
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [rows] = await sequelize.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE human_reviewed = true) AS reviewed,
         COUNT(*) FILTER (WHERE human_reviewed = false) AS unreviewed,
         COUNT(*) FILTER (WHERE badge_type = 'generated') AS generated_count,
         COUNT(*) FILTER (WHERE badge_type = 'assisted') AS assisted_count,
         COUNT(*) FILTER (WHERE badge_type = 'reviewed') AS reviewed_badge_count,
         COUNT(*) FILTER (WHERE badge_type = 'suggested') AS suggested_count,
         COUNT(*) FILTER (WHERE review_action = 'approved') AS approved_count,
         COUNT(*) FILTER (WHERE review_action = 'modified') AS modified_count,
         COUNT(*) FILTER (WHERE review_action = 'rejected') AS rejected_count,
         ROUND(AVG(confidence_score)::numeric, 1) AS avg_confidence
       FROM ai_content_metadata
       WHERE organization_id = :organizationId
         ${vis.clause}`,
      { replacements: { organizationId, ...vis.replacements } },
    );

    const stats = (rows as any[])[0] || {};
    const total = parseInt(stats.total, 10) || 0;
    const reviewed = parseInt(stats.reviewed, 10) || 0;

    return {
      total,
      reviewed,
      unreviewed: parseInt(stats.unreviewed, 10) || 0,
      review_rate: total > 0 ? Math.round((reviewed / total) * 100) : 0,
      by_badge_type: {
        generated: parseInt(stats.generated_count, 10) || 0,
        assisted: parseInt(stats.assisted_count, 10) || 0,
        reviewed: parseInt(stats.reviewed_badge_count, 10) || 0,
        suggested: parseInt(stats.suggested_count, 10) || 0,
      },
      by_review_action: {
        approved: parseInt(stats.approved_count, 10) || 0,
        modified: parseInt(stats.modified_count, 10) || 0,
        rejected: parseInt(stats.rejected_count, 10) || 0,
      },
      avg_confidence: stats.avg_confidence ? parseFloat(stats.avg_confidence) : null,
    };
  } catch (error) {
    logger.error("Error getting AI content stats:", error);
    throw error;
  }
}
