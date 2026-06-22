import { calculateComplianceScore } from "../../utils/compliance.utils";
import { getDashboardDataQuery } from "../../utils/dashboard.utils";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

const getComplianceScore = async (
  _params: { project_id?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const score = await calculateComplianceScore(organizationId);

    return {
      overall_score: score.overallScore,
      calculated_at: score.calculatedAt,
      modules: {
        risk_management: {
          score: score.modules.riskManagement.score,
          weight: score.modules.riskManagement.weight,
          data_points: score.modules.riskManagement.totalDataPoints,
        },
        vendor_management: {
          score: score.modules.vendorManagement.score,
          weight: score.modules.vendorManagement.weight,
          data_points: score.modules.vendorManagement.totalDataPoints,
        },
        project_governance: {
          score: score.modules.projectGovernance.score,
          weight: score.modules.projectGovernance.weight,
          data_points: score.modules.projectGovernance.totalDataPoints,
        },
        model_lifecycle: {
          score: score.modules.modelLifecycle.score,
          weight: score.modules.modelLifecycle.weight,
          data_points: score.modules.modelLifecycle.totalDataPoints,
        },
        policy_documentation: {
          score: score.modules.policyDocumentation.score,
          weight: score.modules.policyDocumentation.weight,
          data_points: score.modules.policyDocumentation.totalDataPoints,
        },
      },
      metadata: score.metadata,
    };
  } catch (error) {
    logger.error("Error getting compliance score:", error);
    throw new Error(
      `Failed to get compliance score: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getComplianceDetails = async (
  params: { project_id: number; framework_id?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const score = await calculateComplianceScore(organizationId);

    // Get project-specific framework data if framework_id is provided
    let frameworkData: any = null;
    if (params.framework_id) {
      const rows = await sequelize.query(
        `SELECT pf.*, f.name as framework_name
         FROM projects_frameworks pf
         LEFT JOIN frameworks f ON f.id = pf.framework_id
         WHERE pf.project_id = :project_id
         AND pf.framework_id = :framework_id
         AND pf.organization_id = :organization_id`,
        {
          replacements: {
            project_id: params.project_id,
            framework_id: params.framework_id,
            organization_id: organizationId,
          },
          type: QueryTypes.SELECT,
        },
      );
      frameworkData = rows[0] || null;
    }

    // Get project-specific stats
    const riskCount = (await sequelize.query(
      `SELECT COUNT(*) as count FROM risks
       WHERE organization_id = :organization_id
       AND (is_deleted = false OR is_deleted IS NULL)
       AND id IN (SELECT risk_id FROM risks_projects_frameworks WHERE project_id = :project_id AND organization_id = :organization_id)`,
      {
        replacements: { organization_id: organizationId, project_id: params.project_id },
        type: QueryTypes.SELECT,
      },
    )) as { count: string }[];

    return {
      project_id: params.project_id,
      overall_score: score.overallScore,
      modules: score.modules,
      framework_data: frameworkData,
      project_risk_count: parseInt(riskCount[0]?.count || "0"),
    };
  } catch (error) {
    logger.error("Error getting compliance details:", error);
    throw new Error(
      `Failed to get compliance details: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getDashboardOverview = async (_params: {}, organizationId: number): Promise<any> => {
  try {
    // Use a default userId/role for the dashboard query since this is an advisor tool
    const dashboard = await getDashboardDataQuery(organizationId, 0, "Admin");

    return {
      projects: dashboard?.projects || 0,
      trainings: dashboard?.trainings || 0,
      models: dashboard?.models || 0,
      reports: dashboard?.reports || 0,
      task_radar: dashboard?.task_radar || { overdue: 0, due: 0, upcoming: 0 },
      project_count: dashboard?.projects_list?.length || 0,
    };
  } catch (error) {
    logger.error("Error getting dashboard overview:", error);
    throw new Error(
      `Failed to get dashboard overview: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getProjectComplianceProgress = async (
  params: { project_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    // Get frameworks for project
    const frameworks = (await sequelize.query(
      `SELECT pf.framework_id, f.name as framework_name
       FROM projects_frameworks pf
       LEFT JOIN frameworks f ON f.id = pf.framework_id
       WHERE pf.project_id = :project_id AND pf.organization_id = :organization_id`,
      {
        replacements: { project_id: params.project_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Get control completion stats
    const controlStats = (await sequelize.query(
      `SELECT
         COUNT(*) as total_controls,
         COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_controls
       FROM controls
       WHERE project_id = :project_id AND organization_id = :organization_id`,
      {
        replacements: { project_id: params.project_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Get assessment progress
    const assessmentStats = (await sequelize.query(
      `SELECT COUNT(*) as total_assessments
       FROM assessments
       WHERE project_id = :project_id`,
      {
        replacements: { project_id: params.project_id },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    const totalControls = parseInt(controlStats[0]?.total_controls || "0");
    const completedControls = parseInt(controlStats[0]?.completed_controls || "0");

    return {
      project_id: params.project_id,
      frameworks: frameworks.map((f: any) => ({
        id: f.framework_id,
        name: f.framework_name,
      })),
      framework_count: frameworks.length,
      control_progress: {
        total: totalControls,
        completed: completedControls,
        percentage: totalControls > 0 ? Math.round((completedControls / totalControls) * 100) : 0,
      },
      assessment_count: parseInt(assessmentStats[0]?.total_assessments || "0"),
    };
  } catch (error) {
    logger.error("Error getting project compliance progress:", error);
    throw new Error(
      `Failed to get project compliance progress: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAllProjectsCompliance = async (_params: {}, organizationId: number): Promise<any> => {
  try {
    // Get all projects
    const projects = (await sequelize.query(
      `SELECT id, project_title, status, created_at
       FROM projects
       WHERE organization_id = :organization_id
       AND (is_organizational = false OR is_organizational IS NULL)
       ORDER BY created_at DESC`,
      {
        replacements: { organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Get framework counts per project
    const frameworkCounts = (await sequelize.query(
      `SELECT project_id, COUNT(*) as framework_count
       FROM projects_frameworks
       WHERE organization_id = :organization_id
       GROUP BY project_id`,
      {
        replacements: { organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    const frameworkMap = new Map(
      frameworkCounts.map((f: any) => [f.project_id, parseInt(f.framework_count)]),
    );

    // Get overall compliance score
    const overallScore = await calculateComplianceScore(organizationId);

    return {
      overall_score: overallScore.overallScore,
      projects: projects.map((p: any) => ({
        id: p.id,
        name: p.project_title,
        status: p.status,
        framework_count: frameworkMap.get(p.id) || 0,
      })),
      total_projects: projects.length,
    };
  } catch (error) {
    logger.error("Error getting all projects compliance:", error);
    throw new Error(
      `Failed to get all projects compliance: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getProjectStats = async (
  params: { project_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    const projectId = params.project_id;

    // Run all stat queries in parallel
    const [riskStats, vendorStats, modelStats, taskStats, projectInfo] = await Promise.all([
      sequelize.query(
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN mitigation_status = 'Completed' THEN 1 END) as mitigated,
           COUNT(CASE WHEN current_risk_level IN ('High risk', 'Very high risk') THEN 1 END) as high_risk
         FROM risks
         WHERE organization_id = :organization_id
         AND (is_deleted = false OR is_deleted IS NULL)
         AND id IN (SELECT risk_id FROM risks_projects_frameworks WHERE project_id = :project_id AND organization_id = :organization_id)`,
        {
          replacements: { organization_id: organizationId, project_id: projectId },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT v.id) as total
         FROM vendors v
         INNER JOIN vendors_projects vp ON v.id = vp.vendor_id AND vp.organization_id = :organization_id
         WHERE v.organization_id = :organization_id
         AND vp.project_id = :project_id
         AND (v.is_deleted = false OR v.is_deleted IS NULL)`,
        {
          replacements: { organization_id: organizationId, project_id: projectId },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `SELECT COUNT(*) as total
         FROM model_inventories
         WHERE organization_id = :organization_id
         AND (is_deleted = false OR is_deleted IS NULL)
         AND id IN (SELECT model_inventory_id FROM model_inventories_projects_frameworks WHERE project_id = :project_id AND organization_id = :organization_id)`,
        {
          replacements: { organization_id: organizationId, project_id: projectId },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed,
           COUNT(CASE WHEN due_date < CURRENT_DATE AND status NOT IN ('Completed', 'Deleted') THEN 1 END) as overdue
         FROM tasks
         WHERE organization_id = :organization_id
         AND project_id = :project_id
         AND status != 'Deleted'`,
        {
          replacements: { organization_id: organizationId, project_id: projectId },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `SELECT project_title, status, goal, created_at FROM projects
         WHERE id = :project_id AND organization_id = :organization_id`,
        {
          replacements: { organization_id: organizationId, project_id: projectId },
          type: QueryTypes.SELECT,
        },
      ),
    ]);

    const risk = (riskStats as any[])[0] || {};
    const vendor = (vendorStats as any[])[0] || {};
    const model = (modelStats as any[])[0] || {};
    const task = (taskStats as any[])[0] || {};
    const project = (projectInfo as any[])[0] || {};

    return {
      project_id: projectId,
      project_name: project.project_title,
      project_status: project.status,
      risks: {
        total: parseInt(risk.total || "0"),
        mitigated: parseInt(risk.mitigated || "0"),
        high_risk: parseInt(risk.high_risk || "0"),
      },
      vendors: {
        total: parseInt(vendor.total || "0"),
      },
      models: {
        total: parseInt(model.total || "0"),
      },
      tasks: {
        total: parseInt(task.total || "0"),
        completed: parseInt(task.completed || "0"),
        overdue: parseInt(task.overdue || "0"),
      },
    };
  } catch (error) {
    logger.error("Error getting project stats:", error);
    throw new Error(
      `Failed to get project stats: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableComplianceTools: any = {
  get_compliance_score: getComplianceScore,
  get_compliance_details: getComplianceDetails,
  get_dashboard_overview: getDashboardOverview,
  get_project_compliance_progress: getProjectComplianceProgress,
  get_all_projects_compliance: getAllProjectsCompliance,
  get_project_stats: getProjectStats,
};

export { availableComplianceTools };
