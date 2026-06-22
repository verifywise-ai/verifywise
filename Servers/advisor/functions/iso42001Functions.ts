import {
  getAllClausesQuery,
  getAllClausesWithSubClauseQuery,
  getAllAnnexesQuery,
  getAllAnnexesWithCategoriesQuery,
  countSubClausesISOByProjectId,
  countAnnexCategoriesISOByProjectId,
  updateSubClauseQuery,
  updateAnnexCategoryQuery,
} from "../../utils/iso42001.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// --- Helper: resolve project_id to projects_frameworks.id for ISO 42001 (framework_id=2) ---
const getProjectFrameworkId = async (
  projectId: number,
  organizationId: number,
): Promise<number> => {
  const result = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 2`,
    { replacements: { organizationId, project_id: projectId } },
  )) as [{ id: number }[], number];
  if (!result[0] || result[0].length === 0) {
    throw new Error(`ISO 42001 framework not found for project #${projectId}`);
  }
  return result[0][0].id;
};

// --- Read Tools ---

const getIso42001ClausesStructure = async (
  _params: Record<string, unknown>,
  organizationId: number,
) => {
  try {
    const clauses = await getAllClausesQuery(organizationId);
    return clauses.map((c: any) => ({
      id: c.id ?? c.dataValues?.id,
      title: c.title ?? c.dataValues?.title,
      description: c.description ?? c.dataValues?.description,
      order_no: c.order_no ?? c.dataValues?.order_no,
    }));
  } catch (error) {
    logger.error("Error fetching ISO 42001 clauses structure:", error);
    throw new Error(
      `Failed to fetch ISO 42001 clauses structure: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getIso42001AnnexesStructure = async (
  _params: Record<string, unknown>,
  organizationId: number,
) => {
  try {
    const annexes = await getAllAnnexesQuery(organizationId);
    return annexes.map((a: any) => ({
      id: a.id ?? a.dataValues?.id,
      title: a.title ?? a.dataValues?.title,
      description: a.description ?? a.dataValues?.description,
      order_no: a.order_no ?? a.dataValues?.order_no,
    }));
  } catch (error) {
    logger.error("Error fetching ISO 42001 annexes structure:", error);
    throw new Error(
      `Failed to fetch ISO 42001 annexes structure: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getIso42001ProjectClauses = async (
  params: { project_id: number },
  organizationId: number,
) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const clauses = await getAllClausesWithSubClauseQuery(projectFrameworkId, organizationId);
    return clauses;
  } catch (error) {
    logger.error("Error fetching ISO 42001 project clauses:", error);
    throw new Error(
      `Failed to fetch ISO 42001 project clauses: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getIso42001ProjectAnnexes = async (
  params: { project_id: number },
  organizationId: number,
) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const annexes = await getAllAnnexesWithCategoriesQuery(projectFrameworkId, organizationId);
    return annexes;
  } catch (error) {
    logger.error("Error fetching ISO 42001 project annexes:", error);
    throw new Error(
      `Failed to fetch ISO 42001 project annexes: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getIso42001Progress = async (params: { project_id: number }, organizationId: number) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const [subClauseCounts, annexCategoryCounts] = await Promise.all([
      countSubClausesISOByProjectId(projectFrameworkId, organizationId),
      countAnnexCategoriesISOByProjectId(projectFrameworkId, organizationId),
    ]);
    return {
      clauses: {
        totalSubclauses: parseInt(subClauseCounts.totalSubclauses) || 0,
        doneSubclauses: parseInt(subClauseCounts.doneSubclauses) || 0,
        completionPercentage:
          parseInt(subClauseCounts.totalSubclauses) > 0
            ? Math.round(
                (parseInt(subClauseCounts.doneSubclauses) /
                  parseInt(subClauseCounts.totalSubclauses)) *
                  100,
              )
            : 0,
      },
      annexes: {
        totalAnnexCategories: parseInt(annexCategoryCounts.totalAnnexcategories) || 0,
        doneAnnexCategories: parseInt(annexCategoryCounts.doneAnnexcategories) || 0,
        completionPercentage:
          parseInt(annexCategoryCounts.totalAnnexcategories) > 0
            ? Math.round(
                (parseInt(annexCategoryCounts.doneAnnexcategories) /
                  parseInt(annexCategoryCounts.totalAnnexcategories)) *
                  100,
              )
            : 0,
      },
    };
  } catch (error) {
    logger.error("Error fetching ISO 42001 progress:", error);
    throw new Error(
      `Failed to fetch ISO 42001 progress: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools ---

const agentSaveIso42001Clauses = createWriteToolFn({
  toolName: "agent_save_iso42001_clauses",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update ISO 42001 subclause #${params.clause_id} in project #${params.project_id}${params.status ? ` — status: ${params.status}` : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const subClauseId = params.clause_id as number;
      const updateData: any = {};
      if (params.status !== undefined) updateData.status = params.status;
      if (params.notes !== undefined) updateData.implementation_description = params.notes;
      if (params.evidence !== undefined) updateData.auditor_feedback = params.evidence;

      await updateSubClauseQuery(subClauseId, updateData, [], [], organizationId, transaction);
      await transaction.commit();
      return {
        id: subClauseId,
        updated: true,
        message: "ISO 42001 subclause updated successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentSaveIso42001Annexes = createWriteToolFn({
  toolName: "agent_save_iso42001_annexes",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update ISO 42001 annex category #${params.annex_id} in project #${params.project_id}${params.status ? ` — status: ${params.status}` : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const annexCategoryId = params.annex_id as number;
      const updateData: any = {};
      if (params.status !== undefined) updateData.status = params.status;
      if (params.notes !== undefined) updateData.implementation_description = params.notes;
      if (params.evidence !== undefined) updateData.auditor_feedback = params.evidence;

      await updateAnnexCategoryQuery(
        annexCategoryId,
        updateData,
        [],
        [],
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        id: annexCategoryId,
        updated: true,
        message: "ISO 42001 annex category updated successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

// --- Export ---

const availableIso42001Tools: any = {
  get_iso42001_clauses_structure: getIso42001ClausesStructure,
  get_iso42001_annexes_structure: getIso42001AnnexesStructure,
  get_iso42001_project_clauses: getIso42001ProjectClauses,
  get_iso42001_project_annexes: getIso42001ProjectAnnexes,
  get_iso42001_progress: getIso42001Progress,
  agent_save_iso42001_clauses: agentSaveIso42001Clauses,
  agent_save_iso42001_annexes: agentSaveIso42001Annexes,
};

export { availableIso42001Tools };
