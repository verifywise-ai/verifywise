import {
  getAllFunctionsWithCategoriesQuery,
  getAllCategoriesWithSubcategoriesQuery,
  getSubcategoryByIdQuery,
  countSubcategoriesNISTByProjectId,
  countSubcategoryAssignmentsNISTByProjectId,
  updateSubcategoryQuery,
} from "../../utils/nistAiRmfCorrect.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// --- Helper: resolve project_id to projects_frameworks.id for NIST AI RMF (framework_id=4) ---
const getProjectFrameworkId = async (
  projectId: number,
  organizationId: number,
): Promise<number> => {
  const result = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 4`,
    { replacements: { organizationId, project_id: projectId } },
  )) as [{ id: number }[], number];
  if (!result[0] || result[0].length === 0) {
    throw new Error(`NIST AI RMF framework not found for project #${projectId}`);
  }
  return result[0][0].id;
};

// --- Read Tools ---

const getNistFunctions = async (_params: Record<string, unknown>, organizationId: number) => {
  try {
    // getAllFunctionsWithCategoriesQuery requires a projectFrameworkId but
    // we just want the structure. Pass 0 — the function reads from struct tables.
    const functions = await getAllFunctionsWithCategoriesQuery(0, organizationId);
    return functions;
  } catch (error) {
    logger.error("Error fetching NIST AI RMF functions:", error);
    throw new Error(
      `Failed to fetch NIST AI RMF functions: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNistCategoriesByFunction = async (
  params: { function_id: string },
  _organizationId: number,
) => {
  try {
    const categories = (await sequelize.query(
      `SELECT id, category_id, description, order_no, function
       FROM nist_ai_rmf_categories_struct
       WHERE function = :function_id
       ORDER BY order_no ASC, category_id ASC`,
      { replacements: { function_id: params.function_id } },
    )) as [any[], number];
    return categories[0];
  } catch (error) {
    logger.error("Error fetching NIST AI RMF categories by function:", error);
    throw new Error(
      `Failed to fetch NIST AI RMF categories: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNistSubcategoryDetail = async (
  params: { subcategory_id: number },
  organizationId: number,
) => {
  try {
    const subcategory = await getSubcategoryByIdQuery(params.subcategory_id, organizationId);
    if (!subcategory) {
      throw new Error(`NIST AI RMF subcategory #${params.subcategory_id} not found`);
    }
    return subcategory;
  } catch (error) {
    logger.error("Error fetching NIST AI RMF subcategory detail:", error);
    throw new Error(
      `Failed to fetch NIST AI RMF subcategory detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNistProgress = async (params: { project_id: number }, organizationId: number) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const [subcategoryCounts, assignmentCounts] = await Promise.all([
      countSubcategoriesNISTByProjectId(projectFrameworkId, organizationId),
      countSubcategoryAssignmentsNISTByProjectId(projectFrameworkId, organizationId),
    ]);
    return {
      totalSubcategories: parseInt(subcategoryCounts.totalSubcategories) || 0,
      doneSubcategories: parseInt(subcategoryCounts.doneSubcategories) || 0,
      completionPercentage:
        parseInt(subcategoryCounts.totalSubcategories) > 0
          ? Math.round(
              (parseInt(subcategoryCounts.doneSubcategories) /
                parseInt(subcategoryCounts.totalSubcategories)) *
                100,
            )
          : 0,
      totalAssigned: parseInt(assignmentCounts.assignedSubcategories) || 0,
      assignmentPercentage:
        parseInt(assignmentCounts.totalSubcategories) > 0
          ? Math.round(
              (parseInt(assignmentCounts.assignedSubcategories) /
                parseInt(assignmentCounts.totalSubcategories)) *
                100,
            )
          : 0,
    };
  } catch (error) {
    logger.error("Error fetching NIST AI RMF progress:", error);
    throw new Error(
      `Failed to fetch NIST AI RMF progress: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNistProgressByFunction = async (
  params: { project_id: number; function_id: string },
  organizationId: number,
) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const allSubcategories = await getAllCategoriesWithSubcategoriesQuery(
      projectFrameworkId,
      organizationId,
    );
    // Filter to subcategories belonging to the specified function
    const filtered = allSubcategories.filter((s: any) => s.function === params.function_id);
    return filtered.map((s: any) => ({
      id: s.id,
      title: s.title,
      index: s.index,
      status: s.status,
      owner: s.owner,
      category_title: s.category_title,
    }));
  } catch (error) {
    logger.error("Error fetching NIST AI RMF progress by function:", error);
    throw new Error(
      `Failed to fetch NIST AI RMF progress by function: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNistStatusBreakdown = async (params: { project_id: number }, organizationId: number) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const result = (await sequelize.query(
      `SELECT status, COUNT(*) as count
       FROM nist_ai_rmf_subcategories
       WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id
       GROUP BY status
       ORDER BY status`,
      {
        replacements: {
          organizationId,
          projects_frameworks_id: projectFrameworkId,
        },
      },
    )) as [{ status: string; count: string }[], number];

    const breakdown: Record<string, number> = {};
    for (const row of result[0]) {
      breakdown[row.status || "Not started"] = parseInt(row.count) || 0;
    }
    return breakdown;
  } catch (error) {
    logger.error("Error fetching NIST AI RMF status breakdown:", error);
    throw new Error(
      `Failed to fetch NIST AI RMF status breakdown: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools ---

const agentUpdateNistSubcategory = createWriteToolFn({
  toolName: "agent_update_nist_subcategory",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update NIST AI RMF subcategory #${params.subcategory_id} in project #${params.project_id}${params.status ? ` — status: ${params.status}` : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const subcategoryId = params.subcategory_id as number;
      const updateData: any = {};
      if (params.status !== undefined) updateData.status = params.status;
      if (params.notes !== undefined) updateData.implementation_description = params.notes;
      if (params.evidence !== undefined) updateData.auditor_feedback = params.evidence;

      await updateSubcategoryQuery(subcategoryId, updateData, [], [], organizationId, transaction);
      await transaction.commit();
      return {
        id: subcategoryId,
        updated: true,
        message: "NIST AI RMF subcategory updated successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

// --- Export ---

const availableNistAiRmfTools: any = {
  get_nist_functions: getNistFunctions,
  get_nist_categories_by_function: getNistCategoriesByFunction,
  get_nist_subcategory_detail: getNistSubcategoryDetail,
  get_nist_progress: getNistProgress,
  get_nist_progress_by_function: getNistProgressByFunction,
  get_nist_status_breakdown: getNistStatusBreakdown,
  agent_update_nist_subcategory: agentUpdateNistSubcategory,
};

export { availableNistAiRmfTools };
