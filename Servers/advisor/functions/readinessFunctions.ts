import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { normalizeEvidenceCount, normalizeRecency } from "../scoring/readinessCalculator";

export interface EvaluateEvidenceParams {
  control_id: number;
  framework_type: string;
}

export interface CheckTaskCompletionParams {
  control_id: number;
  framework_type: string;
}

export interface AnalyzeRiskStatusParams {
  control_id: number;
  framework_type: string;
}

export interface GenerateRecommendationsParams {
  framework_type: string;
  project_id?: number;
  limit?: number;
}

/**
 * Evaluate evidence strength for a control:
 * - evidence count
 * - average quality score from evidence_ai_analysis
 * - freshness (days since most recent evidence)
 */
const evaluateEvidence = async (
  params: EvaluateEvidenceParams,
  organizationId: number,
): Promise<any> => {
  try {
    const { control_id, framework_type } = params;

    const [rows] = await sequelize.query(
      `SELECT
         COUNT(DISTINCT fel.file_id) AS evidence_count,
         COALESCE(AVG(eaa.overall_quality_score), 0) AS avg_quality,
         EXTRACT(DAY FROM NOW() - MAX(eaa.analyzed_at))::INT AS days_since_latest
       FROM file_entity_links fel
       LEFT JOIN evidence_ai_analysis eaa
         ON eaa.file_id = fel.file_id AND eaa.organization_id = :organizationId
       WHERE fel.entity_id = :controlId
         AND fel.framework_type = :frameworkType
         AND fel.organization_id = :organizationId`,
      { replacements: { controlId: control_id, frameworkType: framework_type, organizationId } },
    );

    const row = (rows as any[])[0] || {};
    const evidenceCount = parseInt(row.evidence_count, 10) || 0;
    const avgQuality = parseFloat(row.avg_quality) || 0;
    const daysSinceLatest =
      row.days_since_latest !== null ? parseInt(row.days_since_latest, 10) : null;

    return {
      control_id,
      framework_type,
      evidence_count: evidenceCount,
      evidence_count_score: normalizeEvidenceCount(evidenceCount),
      avg_quality_score: Math.round(avgQuality),
      evidence_recency_score: normalizeRecency(daysSinceLatest),
      days_since_latest: daysSinceLatest,
    };
  } catch (error) {
    logger.error("Error evaluating evidence:", error);
    throw new Error(
      `Failed to evaluate evidence: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Check task completion rate for a control.
 * Looks up tasks linked to the control via entity relationships.
 */
const checkTaskCompletion = async (
  params: CheckTaskCompletionParams,
  organizationId: number,
): Promise<any> => {
  try {
    const { control_id, framework_type } = params;

    // Scope tasks via file_entity_links: tasks sharing files with this control
    const [rows] = await sequelize.query(
      `SELECT
         COUNT(*) AS total_tasks,
         COUNT(*) FILTER (WHERE t.status = 'Completed') AS completed_tasks
       FROM tasks t
       WHERE t.organization_id = :organizationId
         AND t.id IN (
           SELECT fel_t.entity_id FROM file_entity_links fel_t
           WHERE fel_t.entity_type = 'task'
             AND fel_t.organization_id = :organizationId
             AND fel_t.file_id IN (
               SELECT fel_c.file_id FROM file_entity_links fel_c
               WHERE fel_c.entity_type = 'control'
                 AND fel_c.entity_id = :controlId
                 AND fel_c.framework_type = :frameworkType
                 AND fel_c.organization_id = :organizationId
             )
         )`,
      { replacements: { controlId: control_id, frameworkType: framework_type, organizationId } },
    );

    const row = (rows as any[])[0] || {};
    const totalTasks = parseInt(row.total_tasks, 10) || 0;
    const completedTasks = parseInt(row.completed_tasks, 10) || 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      control_id,
      framework_type,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      task_completion_score: completionRate,
    };
  } catch (error) {
    logger.error("Error checking task completion:", error);
    throw new Error(
      `Failed to check task completion: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Analyze risk mitigation status for a control.
 */
const analyzeRiskStatus = async (
  params: AnalyzeRiskStatusParams,
  organizationId: number,
): Promise<any> => {
  try {
    const { control_id, framework_type } = params;

    // Scope risks via file_entity_links: risks sharing files with this control
    const [rows] = await sequelize.query(
      `SELECT
         COUNT(*) AS total_risks,
         COUNT(*) FILTER (WHERE r.final_risk_level IS NOT NULL AND LOWER(r.final_risk_level) != 'high') AS mitigated_risks,
         COUNT(*) FILTER (WHERE r.final_risk_level IS NULL OR LOWER(r.final_risk_level) = 'high') AS unmitigated_risks
       FROM risks r
       WHERE r.organization_id = :organizationId
         AND r.id IN (
           SELECT fel_r.entity_id FROM file_entity_links fel_r
           WHERE fel_r.entity_type = 'risk'
             AND fel_r.organization_id = :organizationId
             AND fel_r.file_id IN (
               SELECT fel_c.file_id FROM file_entity_links fel_c
               WHERE fel_c.entity_type = 'control'
                 AND fel_c.entity_id = :controlId
                 AND fel_c.framework_type = :frameworkType
                 AND fel_c.organization_id = :organizationId
             )
         )`,
      { replacements: { controlId: control_id, frameworkType: framework_type, organizationId } },
    );

    const row = (rows as any[])[0] || {};
    const totalRisks = parseInt(row.total_risks, 10) || 0;
    const mitigatedRisks = parseInt(row.mitigated_risks, 10) || 0;
    const mitigationRate = totalRisks > 0 ? Math.round((mitigatedRisks / totalRisks) * 100) : 100; // no risks = fully mitigated

    return {
      control_id,
      framework_type,
      total_risks: totalRisks,
      mitigated_risks: mitigatedRisks,
      unmitigated_risks: parseInt(row.unmitigated_risks, 10) || 0,
      risk_mitigation_score: mitigationRate,
    };
  } catch (error) {
    logger.error("Error analyzing risk status:", error);
    throw new Error(
      `Failed to analyze risk status: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Generate actionable recommendations by finding the weakest controls
 * and suggesting specific improvements.
 */
const generateRecommendations = async (
  params: GenerateRecommendationsParams,
  organizationId: number,
): Promise<any> => {
  try {
    const { framework_type, project_id, limit = 10 } = params;

    // Get existing readiness scores sorted by weakest
    const projectFilter = project_id ? "AND project_id = :projectId" : "";
    const [weakest] = await sequelize.query(
      `SELECT
         control_id, overall_score, readiness_level,
         evidence_quality_score, evidence_count_score,
         evidence_recency_score, task_completion_score,
         risk_mitigation_score, recommendations
       FROM control_readiness_scores
       WHERE framework_type = :frameworkType
         AND organization_id = :organizationId
         ${projectFilter}
       ORDER BY overall_score ASC
       LIMIT :limit`,
      {
        replacements: {
          frameworkType: framework_type,
          organizationId,
          ...(project_id ? { projectId: project_id } : {}),
          limit,
        },
      },
    );

    const controls = weakest as any[];
    const recommendations = controls.map((ctrl) => {
      const actions: string[] = [];

      if ((ctrl.evidence_count_score || 0) < 30) {
        actions.push("Upload evidence documents for this control");
      }
      if ((ctrl.evidence_quality_score || 0) < 50) {
        actions.push("Improve quality of existing evidence (add specifics, recent data)");
      }
      if ((ctrl.evidence_recency_score || 0) < 40) {
        actions.push("Update or replace outdated evidence with recent documents");
      }
      if ((ctrl.task_completion_score || 0) < 50) {
        actions.push("Complete pending tasks linked to this control");
      }
      if ((ctrl.risk_mitigation_score || 0) < 50) {
        actions.push("Address unmitigated risks linked to this control");
      }
      if (actions.length === 0) {
        actions.push("Continue maintaining current compliance posture");
      }

      return {
        control_id: ctrl.control_id,
        overall_score: ctrl.overall_score,
        readiness_level: ctrl.readiness_level,
        priority:
          ctrl.overall_score < 30 ? "critical" : ctrl.overall_score < 60 ? "high" : "medium",
        actions,
        weakest_dimension: getWeakestDimension(ctrl),
      };
    });

    return {
      framework_type,
      total_recommendations: recommendations.length,
      recommendations,
    };
  } catch (error) {
    logger.error("Error generating recommendations:", error);
    throw new Error(
      `Failed to generate recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

function getWeakestDimension(ctrl: any): string {
  const dims: Record<string, number> = {
    evidence_quality: ctrl.evidence_quality_score || 0,
    evidence_count: ctrl.evidence_count_score || 0,
    evidence_recency: ctrl.evidence_recency_score || 0,
    task_completion: ctrl.task_completion_score || 0,
    risk_mitigation: ctrl.risk_mitigation_score || 0,
  };

  let min = Infinity;
  let minKey = "evidence_quality";
  for (const [key, val] of Object.entries(dims)) {
    if (val < min) {
      min = val;
      minKey = key;
    }
  }
  return minKey;
}

const availableReadinessTools: Record<string, Function> = {
  evaluate_evidence: evaluateEvidence,
  check_task_completion: checkTaskCompletion,
  analyze_risk_status: analyzeRiskStatus,
  generate_recommendations: generateRecommendations,
};

export { availableReadinessTools };
