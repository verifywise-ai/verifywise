import { Request, Response, NextFunction } from "express";
import { sequelize } from "../database/db";
import logger from "../utils/logger/fileLogger";
import type { BadgeType } from "../domain.layer/interfaces/i.aiContent";

/**
 * Options for tracking AI content metadata.
 */
export interface AIContentTrackOptions {
  entityType: string;
  badgeType: BadgeType;
  modelUsed?: string;
  modelProvider?: string;
  toolName?: string;
  fieldName?: string;
  promptSummary?: string;
  confidenceScore?: number;
}

/**
 * Track AI-generated or AI-assisted content by inserting metadata
 * into ai_content_metadata table. Call this after AI tools produce output.
 */
export async function trackAIContent(
  organizationId: number,
  entityType: string,
  entityId: number,
  options: Partial<AIContentTrackOptions> & { badgeType: BadgeType; visibility?: string },
  createdBy?: number | null,
): Promise<any> {
  try {
    const [rows] = await sequelize.query(
      `INSERT INTO ai_content_metadata
        (entity_type, entity_id, field_name, badge_type,
         model_used, model_provider, tool_name,
         confidence_score, prompt_summary,
         human_reviewed, created_by, visibility, created_at, organization_id)
       VALUES
        (:entityType, :entityId, :fieldName, :badgeType,
         :modelUsed, :modelProvider, :toolName,
         :confidenceScore, :promptSummary,
         false, :createdBy, :visibility, NOW(), :organizationId)
       RETURNING *`,
      {
        replacements: {
          entityType,
          entityId,
          fieldName: options.fieldName ?? null,
          badgeType: options.badgeType,
          modelUsed: options.modelUsed ?? null,
          modelProvider: options.modelProvider ?? null,
          toolName: options.toolName ?? null,
          confidenceScore: options.confidenceScore ?? null,
          promptSummary: options.promptSummary ?? null,
          createdBy: createdBy ?? null,
          visibility: options.visibility || "public",
          organizationId,
        },
      },
    );
    return (rows as any[])[0];
  } catch (error) {
    logger.error("Error tracking AI content:", error);
    // Don't throw — tracking is non-critical
    return null;
  }
}

/**
 * Express middleware factory that automatically tracks AI content
 * for responses from AI endpoints. Attach after the controller.
 */
export function aiContentTrackerMiddleware(options: {
  entityType: string;
  badgeType: BadgeType;
  toolName?: string;
  modelUsed?: string;
  modelProvider?: string;
  getEntityId: (req: Request, res: Response) => number | null;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Track after successful response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = options.getEntityId(req, res);
        if (entityId && req.organizationId) {
          trackAIContent(
            req.organizationId,
            options.entityType,
            entityId,
            {
              badgeType: options.badgeType,
              toolName: options.toolName,
              modelUsed: options.modelUsed ?? "heuristic-v1",
              modelProvider: options.modelProvider ?? "verifywise",
            },
            req.userId ? Number(req.userId) : null,
          ).catch(() => {});
        }
      }

      return originalJson(body);
    };

    next();
  };
}
