import { getUserProjects } from "../../utils/project.utils";
import { calculateProjectRisks } from "../../utils/project.utils";
import logger from "../../utils/logger/fileLogger";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";

export interface FetchUseCasesParams {
  status?: string;
  ai_risk_classification?: string;
  limit?: number;
}

/**
 * Fetch all projects as use cases. Uses Admin role to get all projects
 * since the advisor operates at the tenant level.
 */
const getAllProjects = async (organizationId: number) => {
  // Use a high-privilege view (Admin role, userId=0) so the advisor can see all projects
  const projects = await getUserProjects({ userId: 0, role: "Admin" }, organizationId);
  return projects || [];
};

const fetchUseCases = async (
  params: FetchUseCasesParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    let projects = await getAllProjects(organizationId);

    // Apply filters
    if (params.status) {
      projects = projects.filter((p: any) => p.status === params.status);
    }
    if (params.ai_risk_classification) {
      projects = projects.filter(
        (p: any) => p.ai_risk_classification === params.ai_risk_classification,
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      projects = projects.slice(0, params.limit);
    }

    // Return lightweight projections
    return projects.map((p: any) => ({
      id: p.id,
      uc_id: p.uc_id,
      project_title: p.project_title,
      status: p.status,
      ai_risk_classification: p.ai_risk_classification,
      owner: p.owner,
      start_date: p.start_date,
      goal: p.goal,
      target_industry: p.target_industry,
      last_updated: p.last_updated,
    }));
  } catch (error) {
    logger.error("Error fetching use cases:", error);
    throw new Error(
      `Failed to fetch use cases: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUseCaseAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const projects = await getAllProjects(organizationId);
    const total = projects.length;

    // Status distribution
    const statusDistribution: Record<string, number> = {};
    projects.forEach((p: any) => {
      const status = p.status || "Draft";
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    // Risk classification distribution
    const riskClassificationDistribution: Record<string, number> = {};
    projects.forEach((p: any) => {
      const classification = p.ai_risk_classification || "Unclassified";
      riskClassificationDistribution[classification] =
        (riskClassificationDistribution[classification] || 0) + 1;
    });

    // Industry distribution
    const industryDistribution: Record<string, number> = {};
    projects.forEach((p: any) => {
      if (p.target_industry) {
        industryDistribution[p.target_industry] =
          (industryDistribution[p.target_industry] || 0) + 1;
      }
    });

    return {
      totalUseCases: total,
      statusDistribution,
      riskClassificationDistribution,
      industryDistribution,
    };
  } catch (error) {
    logger.error("Error getting use case analytics:", error);
    throw new Error(
      `Failed to get use case analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUseCaseExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const projects = await getAllProjects(organizationId);
    const total = projects.length;

    const activeCount = projects.filter(
      (p: any) => p.status === "Active" || p.status === "In Progress",
    ).length;
    const draftCount = projects.filter((p: any) => p.status === "Draft").length;
    const completedCount = projects.filter((p: any) => p.status === "Completed").length;

    const highRiskCount = projects.filter(
      (p: any) =>
        p.ai_risk_classification === "High risk" ||
        p.ai_risk_classification === "Unacceptable risk",
    ).length;

    // Get risk counts for each project (parallelized to avoid N+1)
    const projectsToCheck = projects.slice(0, 10).filter((p: any) => p.id);
    const riskResults = await Promise.allSettled(
      projectsToCheck.map((project: any) =>
        calculateProjectRisks(project.id, organizationId).then((rows) => ({
          project,
          totalRisks: rows.reduce((sum, row) => sum + parseInt(String(row.count), 10), 0),
        })),
      ),
    );

    const projectRiskSummaries = riskResults
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          project: any;
          totalRisks: number;
        }> => r.status === "fulfilled" && r.value.totalRisks > 0,
      )
      .map((r) => ({
        id: r.value.project.id,
        title: r.value.project.project_title,
        riskClassification: r.value.project.ai_risk_classification,
        totalRisks: r.value.totalRisks,
      }));

    return {
      totalUseCases: total,
      activeUseCases: activeCount,
      draftUseCases: draftCount,
      completedUseCases: completedCount,
      highRiskUseCases: highRiskCount,
      topProjectsByRisk: projectRiskSummaries
        .sort((a, b) => b.totalRisks - a.totalRisks)
        .slice(0, 5),
    };
  } catch (error) {
    logger.error("Error getting use case executive summary:", error);
    throw new Error(
      `Failed to get use case executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write tools (Human Confirmation Flow) ---

const agentCreateUseCase = createWriteToolFn({
  toolName: "agent_create_use_case",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create use case "${params.name}"${params.risk_classification ? ` with risk classification "${params.risk_classification}"` : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      // Generate next UC ID
      const ucIdResult = await sequelize.query<{ next_id: number }>(
        `SELECT nextval('project_uc_id_seq') AS next_id`,
        { type: QueryTypes.SELECT, transaction },
      );
      const ucId = `UC-${ucIdResult[0].next_id}`;

      const now = new Date();
      const result = await sequelize.query(
        `INSERT INTO projects (
          organization_id, uc_id, project_title, description, status,
          ai_risk_classification, target_industry, start_date,
          last_updated, created_at
        ) VALUES (
          :organization_id, :uc_id, :project_title, :description, :status,
          :ai_risk_classification, :target_industry, :start_date,
          :last_updated, :created_at
        ) RETURNING *`,
        {
          replacements: {
            organization_id: organizationId,
            uc_id: ucId,
            project_title: params.name as string,
            description: (params.description as string) || null,
            status: (params.status as string) || "Draft",
            ai_risk_classification: (params.risk_classification as string) || null,
            target_industry: (params.industry as string) || null,
            start_date: now,
            last_updated: now,
            created_at: now,
          },
          transaction,
        },
      );
      await transaction.commit();
      const created = (result as any)[0]?.[0] || (result as any)[0];
      return { success: true, use_case: created };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentUpdateUseCase = createWriteToolFn({
  toolName: "agent_update_use_case",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update use case #${params.use_case_id}${params.name ? ` — rename to "${params.name}"` : ""}`,
  executeFn: async (params, organizationId) => {
    const fields: Record<string, { column: string; value: unknown }> = {
      name: { column: "project_title", value: params.name },
      description: { column: "description", value: params.description },
      status: { column: "status", value: params.status },
      risk_classification: { column: "ai_risk_classification", value: params.risk_classification },
      industry: { column: "target_industry", value: params.industry },
      goal: { column: "goal", value: params.goal },
    };

    const setClauses: string[] = [];
    const replacements: Record<string, unknown> = {
      organizationId,
      id: params.use_case_id,
      last_updated: new Date(),
    };

    for (const [key, { column, value }] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        setClauses.push(`${column} = :${key}`);
        replacements[key] = value;
      }
    }

    if (setClauses.length === 0) {
      return { success: false, message: "No fields to update" };
    }

    setClauses.push("last_updated = :last_updated");

    const result = await sequelize.query(
      `UPDATE projects SET ${setClauses.join(", ")} WHERE organization_id = :organizationId AND id = :id RETURNING *`,
      { replacements },
    );
    const updated = (result as any)[0]?.[0] || (result as any)[0];
    return { success: true, use_case: updated };
  },
});

const agentUpdateUseCaseStatus = createWriteToolFn({
  toolName: "agent_update_use_case_status",
  warningLevel: "warning",
  descriptionFn: (params) => `Update use case #${params.use_case_id} status to "${params.status}"`,
  executeFn: async (params, organizationId) => {
    const result = await sequelize.query(
      `UPDATE projects SET status = :status, last_updated = :last_updated WHERE organization_id = :organizationId AND id = :id RETURNING *`,
      {
        replacements: {
          organizationId,
          id: params.use_case_id,
          status: params.status,
          last_updated: new Date(),
        },
      },
    );
    const updated = (result as any)[0]?.[0] || (result as any)[0];
    return { success: true, use_case: updated };
  },
});

const agentAddMemberToUseCase = createWriteToolFn({
  toolName: "agent_add_member_to_use_case",
  warningLevel: "info",
  descriptionFn: (params) =>
    `Add user #${params.user_id} as member to use case #${params.use_case_id}`,
  executeFn: async (params, organizationId) => {
    // Check if membership already exists
    const existing = await sequelize.query(
      `SELECT id FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id AND user_id = :user_id`,
      {
        replacements: {
          organizationId,
          project_id: params.use_case_id,
          user_id: params.user_id,
        },
        type: QueryTypes.SELECT,
      },
    );

    if ((existing as any[]).length > 0) {
      return { success: false, message: "User is already a member of this use case" };
    }

    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id) VALUES (:organizationId, :project_id, :user_id)`,
      {
        replacements: {
          organizationId,
          project_id: params.use_case_id,
          user_id: params.user_id,
        },
      },
    );
    return {
      success: true,
      message: `User #${params.user_id} added to use case #${params.use_case_id}`,
    };
  },
});

const agentDeleteUseCase = createWriteToolFn({
  toolName: "agent_delete_use_case",
  warningLevel: "danger",
  descriptionFn: (params) =>
    `Permanently delete use case #${params.use_case_id} and all associated data`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      // Delete dependent records first
      await sequelize.query(
        `DELETE FROM projects_members WHERE organization_id = :organizationId AND project_id = :id`,
        { replacements: { organizationId, id: params.use_case_id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM files WHERE organization_id = :organizationId AND project_id = :id`,
        { replacements: { organizationId, id: params.use_case_id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM projects_risks WHERE organization_id = :organizationId AND project_id = :id`,
        { replacements: { organizationId, id: params.use_case_id }, transaction },
      );

      const result = await sequelize.query(
        `DELETE FROM projects WHERE organization_id = :organizationId AND id = :id RETURNING id, project_title`,
        { replacements: { organizationId, id: params.use_case_id }, transaction },
      );
      await transaction.commit();
      const deleted = (result as any)[0]?.[0] || (result as any)[0];
      return { success: true, deleted_use_case: deleted };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const availableUseCaseTools: Record<string, Function> = {
  fetch_use_cases: fetchUseCases,
  get_use_case_analytics: getUseCaseAnalytics,
  get_use_case_executive_summary: getUseCaseExecutiveSummary,
  agent_create_use_case: agentCreateUseCase,
  agent_update_use_case: agentUpdateUseCase,
  agent_update_use_case_status: agentUpdateUseCaseStatus,
  agent_add_member_to_use_case: agentAddMemberToUseCase,
  agent_delete_use_case: agentDeleteUseCase,
};

export { availableUseCaseTools };
