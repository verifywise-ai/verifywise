import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";
import { buildVisibilityFilter } from "./visibility.utils";

/**
 * Upsert a control readiness score.
 * Uses ON CONFLICT on (control_id, framework_type, organization_id) to update.
 */
export async function upsertControlScoreQuery(
  controlId: number,
  frameworkType: string,
  organizationId: number,
  data: {
    project_id?: number | null;
    created_by?: number | null;
    visibility?: string;
    evidence_quality_score: number;
    evidence_count_score: number;
    evidence_recency_score: number;
    task_completion_score: number;
    risk_mitigation_score: number;
    overall_score: number;
    readiness_level: string;
    recommendations?: string[] | null;
  },
): Promise<any> {
  try {
    const [rows] = await sequelize.query(
      `INSERT INTO control_readiness_scores
        (control_id, framework_type, project_id, created_by, visibility,
         evidence_quality_score, evidence_count_score, evidence_recency_score,
         task_completion_score, risk_mitigation_score,
         overall_score, readiness_level, recommendations,
         calculated_at, organization_id)
       VALUES
        (:controlId, :frameworkType, :projectId, :createdBy, :visibility,
         :evidenceQuality, :evidenceCount, :evidenceRecency,
         :taskCompletion, :riskMitigation,
         :overallScore, :readinessLevel, :recommendations,
         NOW(), :organizationId)
       ON CONFLICT (control_id, framework_type, COALESCE(project_id, 0), COALESCE(created_by, 0), organization_id)
       DO UPDATE SET
         evidence_quality_score = EXCLUDED.evidence_quality_score,
         evidence_count_score = EXCLUDED.evidence_count_score,
         evidence_recency_score = EXCLUDED.evidence_recency_score,
         task_completion_score = EXCLUDED.task_completion_score,
         risk_mitigation_score = EXCLUDED.risk_mitigation_score,
         overall_score = EXCLUDED.overall_score,
         readiness_level = EXCLUDED.readiness_level,
         recommendations = EXCLUDED.recommendations,
         calculated_at = NOW()
       RETURNING *`,
      {
        replacements: {
          controlId,
          frameworkType,
          projectId: data.project_id ?? null,
          createdBy: data.created_by ?? null,
          visibility: data.visibility || "public",
          evidenceQuality: data.evidence_quality_score,
          evidenceCount: data.evidence_count_score,
          evidenceRecency: data.evidence_recency_score,
          taskCompletion: data.task_completion_score,
          riskMitigation: data.risk_mitigation_score,
          overallScore: data.overall_score,
          readinessLevel: data.readiness_level,
          recommendations: data.recommendations ? JSON.stringify(data.recommendations) : null,
          organizationId,
        },
      },
    );
    return (rows as any[])[0];
  } catch (error) {
    logger.error("Error upserting control readiness score:", error);
    throw error;
  }
}

/**
 * Upsert a framework readiness score.
 */
export async function upsertFrameworkScoreQuery(
  frameworkType: string,
  organizationId: number,
  data: {
    project_id?: number | null;
    created_by?: number | null;
    visibility?: string;
    total_controls: number;
    avg_score: number;
    ready_count: number;
    needs_work_count: number;
    at_risk_count: number;
    not_started_count: number;
    weakest_controls?: any[] | null;
  },
): Promise<any> {
  try {
    const [rows] = await sequelize.query(
      `INSERT INTO framework_readiness_scores
        (framework_type, project_id, created_by, visibility,
         total_controls, avg_score,
         ready_count, needs_work_count, at_risk_count, not_started_count,
         weakest_controls, calculated_at, organization_id)
       VALUES
        (:frameworkType, :projectId, :createdBy, :visibility,
         :totalControls, :avgScore,
         :readyCount, :needsWorkCount, :atRiskCount, :notStartedCount,
         :weakestControls, NOW(), :organizationId)
       ON CONFLICT (framework_type, COALESCE(project_id, 0), COALESCE(created_by, 0), organization_id)
       DO UPDATE SET
         total_controls = EXCLUDED.total_controls,
         avg_score = EXCLUDED.avg_score,
         ready_count = EXCLUDED.ready_count,
         needs_work_count = EXCLUDED.needs_work_count,
         at_risk_count = EXCLUDED.at_risk_count,
         not_started_count = EXCLUDED.not_started_count,
         weakest_controls = EXCLUDED.weakest_controls,
         calculated_at = NOW()
       RETURNING *`,
      {
        replacements: {
          frameworkType,
          projectId: data.project_id ?? null,
          createdBy: data.created_by ?? null,
          visibility: data.visibility || "public",
          totalControls: data.total_controls,
          avgScore: data.avg_score,
          readyCount: data.ready_count,
          needsWorkCount: data.needs_work_count,
          atRiskCount: data.at_risk_count,
          notStartedCount: data.not_started_count,
          weakestControls: data.weakest_controls ? JSON.stringify(data.weakest_controls) : null,
          organizationId,
        },
      },
    );
    return (rows as any[])[0];
  } catch (error) {
    logger.error("Error upserting framework readiness score:", error);
    throw error;
  }
}

/**
 * Get all framework readiness scores for an organization.
 */
export async function getFrameworkScoresQuery(
  organizationId: number,
  projectId?: number | null,
  userId?: number | null,
  visibility?: string,
): Promise<any[]> {
  try {
    const projectFilter =
      projectId != null ? "AND project_id = :projectId" : "AND project_id IS NULL";
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [rows] = await sequelize.query(
      `SELECT * FROM framework_readiness_scores
       WHERE organization_id = :organizationId
         ${projectFilter}
         ${vis.clause}
       ORDER BY avg_score ASC`,
      {
        replacements: {
          organizationId,
          ...(projectId != null ? { projectId } : {}),
          ...vis.replacements,
        },
      },
    );
    return rows as any[];
  } catch (error) {
    logger.error("Error getting framework scores:", error);
    throw error;
  }
}

/**
 * Get framework readiness score for a specific framework.
 */
export async function getFrameworkScoreByTypeQuery(
  frameworkType: string,
  organizationId: number,
  projectId?: number | null,
  userId?: number | null,
  visibility?: string,
): Promise<any | null> {
  try {
    const projectFilter =
      projectId != null ? "AND project_id = :projectId" : "AND project_id IS NULL";
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [rows] = await sequelize.query(
      `SELECT * FROM framework_readiness_scores
       WHERE framework_type = :frameworkType
         AND organization_id = :organizationId
         ${projectFilter}
         ${vis.clause}
       LIMIT 1`,
      {
        replacements: {
          frameworkType,
          organizationId,
          ...(projectId != null ? { projectId } : {}),
          ...vis.replacements,
        },
      },
    );
    return (rows as any[])[0] || null;
  } catch (error) {
    logger.error("Error getting framework score by type:", error);
    throw error;
  }
}

/**
 * Get per-control readiness scores for a framework.
 */
export async function getControlScoresQuery(
  frameworkType: string,
  organizationId: number,
  projectId?: number | null,
  userId?: number | null,
  visibility?: string,
): Promise<any[]> {
  try {
    const projectFilter =
      projectId != null ? "AND project_id = :projectId" : "AND project_id IS NULL";
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [rows] = await sequelize.query(
      `SELECT * FROM control_readiness_scores
       WHERE framework_type = :frameworkType
         AND organization_id = :organizationId
         ${projectFilter}
         ${vis.clause}
       ORDER BY overall_score ASC`,
      {
        replacements: {
          frameworkType,
          organizationId,
          ...(projectId != null ? { projectId } : {}),
          ...vis.replacements,
        },
      },
    );
    return rows as any[];
  } catch (error) {
    logger.error("Error getting control scores:", error);
    throw error;
  }
}

/**
 * Get the weakest controls across all frameworks.
 */
export async function getWeakestControlsQuery(
  organizationId: number,
  limit: number = 10,
  projectId?: number | null,
  userId?: number | null,
  visibility?: string,
): Promise<any[]> {
  try {
    const projectFilter =
      projectId != null ? "AND project_id = :projectId" : "AND project_id IS NULL";
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [rows] = await sequelize.query(
      `SELECT control_id, framework_type, overall_score, readiness_level,
              evidence_quality_score, evidence_count_score,
              evidence_recency_score, task_completion_score, risk_mitigation_score,
              recommendations
       FROM control_readiness_scores
       WHERE organization_id = :organizationId
         ${projectFilter}
         ${vis.clause}
       ORDER BY overall_score ASC
       LIMIT :limit`,
      {
        replacements: {
          organizationId,
          limit,
          ...(projectId != null ? { projectId } : {}),
          ...vis.replacements,
        },
      },
    );
    return rows as any[];
  } catch (error) {
    logger.error("Error getting weakest controls:", error);
    throw error;
  }
}

/**
 * Insert a snapshot into readiness_history for trend tracking.
 * Called after each framework score upsert — INSERT-only, never overwritten.
 */
export async function insertReadinessHistoryQuery(
  frameworkType: string,
  organizationId: number,
  data: {
    project_id?: number | null;
    created_by?: number | null;
    visibility?: string;
    avg_score: number;
    total_controls: number;
    ready_count: number;
    needs_work_count: number;
    at_risk_count: number;
    not_started_count: number;
  },
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO readiness_history
        (framework_type, project_id, created_by, visibility, avg_score, total_controls,
         ready_count, needs_work_count, at_risk_count, not_started_count,
         calculated_at, organization_id)
       VALUES
        (:frameworkType, :projectId, :createdBy, :visibility, :avgScore, :totalControls,
         :readyCount, :needsWorkCount, :atRiskCount, :notStartedCount,
         NOW(), :organizationId)`,
      {
        replacements: {
          frameworkType,
          projectId: data.project_id ?? null,
          createdBy: data.created_by ?? null,
          visibility: data.visibility || "public",
          avgScore: data.avg_score,
          totalControls: data.total_controls,
          readyCount: data.ready_count,
          needsWorkCount: data.needs_work_count,
          atRiskCount: data.at_risk_count,
          notStartedCount: data.not_started_count,
          organizationId,
        },
      },
    );
  } catch (error) {
    logger.error("Error inserting readiness history:", error);
    // Non-critical — don't throw
  }
}

/**
 * Get historical readiness scores from the history table for trend chart.
 */
export async function getReadinessHistoryQuery(
  organizationId: number,
  frameworkType?: string,
  projectId?: number | null,
  userId?: number | null,
  visibility?: string,
): Promise<any[]> {
  try {
    const frameworkFilter = frameworkType ? "AND framework_type = :frameworkType" : "";
    const projectFilter =
      projectId != null ? "AND project_id = :projectId" : "AND project_id IS NULL";
    const vis = buildVisibilityFilter(userId ?? null, visibility);
    const [rows] = await sequelize.query(
      `SELECT framework_type, avg_score, calculated_at,
              total_controls, ready_count, needs_work_count, at_risk_count, not_started_count
       FROM readiness_history
       WHERE organization_id = :organizationId
         ${frameworkFilter}
         ${projectFilter}
         ${vis.clause}
       ORDER BY calculated_at DESC
       LIMIT 50`,
      {
        replacements: {
          organizationId,
          ...(frameworkType ? { frameworkType } : {}),
          ...(projectId != null ? { projectId } : {}),
          ...vis.replacements,
        },
      },
    );
    return rows as any[];
  } catch (error) {
    logger.error("Error getting readiness history:", error);
    throw error;
  }
}

/**
 * Get all controls from a framework struct table for calculation.
 */
export async function getFrameworkControlsQuery(frameworkType: string): Promise<any[]> {
  try {
    let query: string;
    if (frameworkType === "eu_ai_act") {
      query = `SELECT id AS control_id, title
               FROM controls_struct_eu
               WHERE title IS NOT NULL`;
    } else if (frameworkType === "iso_42001") {
      query = `SELECT id AS control_id, title
               FROM annexcategories_struct_iso
               WHERE title IS NOT NULL`;
    } else {
      // Generic — try the eu_ai_act table as fallback
      query = `SELECT id AS control_id, title
               FROM controls_struct_eu
               WHERE title IS NOT NULL`;
    }

    const [rows] = await sequelize.query(query);
    return rows as any[];
  } catch (error) {
    logger.error("Error getting framework controls:", error);
    throw error;
  }
}
