import {
  getAllControlCategoriesQuery,
  getControlStructByControlCategoryIdQuery,
  getComplianceEUByProjectIdQuery,
  getAssessmentsEUByProjectIdQuery,
  countSubControlsEUByProjectId,
  countAnswersEUByProjectId,
  updateControlEUByIdQuery,
  updateQuestionEUByIdQuery,
} from "../../utils/eu.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// --- Helper: resolve project_id to projects_frameworks.id for EU AI Act (framework_id=1) ---
const getProjectFrameworkId = async (
  projectId: number,
  organizationId: number,
): Promise<number> => {
  const result = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 1`,
    { replacements: { organizationId, project_id: projectId } },
  )) as [{ id: number }[], number];
  if (!result[0] || result[0].length === 0) {
    throw new Error(`EU AI Act framework not found for project #${projectId}`);
  }
  return result[0][0].id;
};

// --- Read Tools ---

const getEuAiActControlCategories = async (
  _params: Record<string, unknown>,
  organizationId: number,
) => {
  try {
    const categories = await getAllControlCategoriesQuery(organizationId);
    return categories.map((c: any) => ({
      id: c.id ?? c.dataValues?.id,
      title: c.title ?? c.dataValues?.title,
      order_no: c.order_no ?? c.dataValues?.order_no,
    }));
  } catch (error) {
    logger.error("Error fetching EU AI Act control categories:", error);
    throw new Error(
      `Failed to fetch EU AI Act control categories: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getEuAiActControlsByCategory = async (
  params: { category_id: number },
  _organizationId: number,
) => {
  try {
    const controls = await getControlStructByControlCategoryIdQuery(params.category_id);
    return controls.map((c: any) => ({
      id: c.id ?? c.dataValues?.id,
      title: c.title ?? c.dataValues?.title,
      description: c.description ?? c.dataValues?.description,
      order_no: c.order_no ?? c.dataValues?.order_no,
      control_category_id: c.control_category_id ?? c.dataValues?.control_category_id,
    }));
  } catch (error) {
    logger.error("Error fetching EU AI Act controls by category:", error);
    throw new Error(
      `Failed to fetch EU AI Act controls by category: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getEuAiActProjectCompliance = async (
  params: { project_id: number },
  organizationId: number,
) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const compliance = await getComplianceEUByProjectIdQuery(projectFrameworkId, organizationId);
    return compliance;
  } catch (error) {
    logger.error("Error fetching EU AI Act project compliance:", error);
    throw new Error(
      `Failed to fetch EU AI Act project compliance: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getEuAiActProjectAssessment = async (
  params: { project_id: number },
  organizationId: number,
) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const assessments = await getAssessmentsEUByProjectIdQuery(projectFrameworkId, organizationId);
    return assessments;
  } catch (error) {
    logger.error("Error fetching EU AI Act project assessment:", error);
    throw new Error(
      `Failed to fetch EU AI Act project assessment: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getEuAiActComplianceProgress = async (
  params: { project_id: number },
  organizationId: number,
) => {
  try {
    const projectFrameworkId = await getProjectFrameworkId(params.project_id, organizationId);
    const [subControlCounts, answerCounts] = await Promise.all([
      countSubControlsEUByProjectId(projectFrameworkId, organizationId),
      countAnswersEUByProjectId(projectFrameworkId, organizationId),
    ]);
    return {
      compliance: {
        totalSubcontrols: parseInt(subControlCounts.totalSubcontrols) || 0,
        doneSubcontrols: parseInt(subControlCounts.doneSubcontrols) || 0,
        completionPercentage:
          parseInt(subControlCounts.totalSubcontrols) > 0
            ? Math.round(
                (parseInt(subControlCounts.doneSubcontrols) /
                  parseInt(subControlCounts.totalSubcontrols)) *
                  100,
              )
            : 0,
      },
      assessment: {
        totalAssessments: parseInt(answerCounts.totalAssessments) || 0,
        answeredAssessments: parseInt(answerCounts.answeredAssessments) || 0,
        completionPercentage:
          parseInt(answerCounts.totalAssessments) > 0
            ? Math.round(
                (parseInt(answerCounts.answeredAssessments) /
                  parseInt(answerCounts.totalAssessments)) *
                  100,
              )
            : 0,
      },
    };
  } catch (error) {
    logger.error("Error fetching EU AI Act compliance progress:", error);
    throw new Error(
      `Failed to fetch EU AI Act compliance progress: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools ---

const agentSaveEuAiActControl = createWriteToolFn({
  toolName: "agent_save_eu_ai_act_control",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update EU AI Act control #${params.control_id} in project #${params.project_id} — status: ${params.status}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const controlId = params.control_id as number;
      const updateData: any = {};
      if (params.status !== undefined) updateData.status = params.status;
      if (params.notes !== undefined) updateData.implementation_details = params.notes;

      await updateControlEUByIdQuery(controlId, updateData, organizationId, transaction);
      await transaction.commit();
      return {
        id: controlId,
        updated: true,
        message: "EU AI Act control updated successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentSaveEuAiActAssessmentAnswer = createWriteToolFn({
  toolName: "agent_save_eu_ai_act_assessment_answer",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update EU AI Act assessment answer #${params.question_id} in project #${params.project_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const answerId = params.question_id as number;
      const updateData: any = {};
      if (params.answer !== undefined) updateData.answer = params.answer;
      updateData.status = "Done";

      await updateQuestionEUByIdQuery(answerId, updateData, organizationId, transaction);
      await transaction.commit();
      return {
        id: answerId,
        updated: true,
        message: "EU AI Act assessment answer updated successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

// --- Export ---

const availableEuAiActTools: any = {
  get_eu_ai_act_control_categories: getEuAiActControlCategories,
  get_eu_ai_act_controls_by_category: getEuAiActControlsByCategory,
  get_eu_ai_act_project_compliance: getEuAiActProjectCompliance,
  get_eu_ai_act_project_assessment: getEuAiActProjectAssessment,
  get_eu_ai_act_compliance_progress: getEuAiActComplianceProgress,
  agent_save_eu_ai_act_control: agentSaveEuAiActControl,
  agent_save_eu_ai_act_assessment_answer: agentSaveEuAiActAssessmentAnswer,
};

export { availableEuAiActTools };
