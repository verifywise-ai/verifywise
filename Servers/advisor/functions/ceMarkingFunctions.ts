import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

const getCeMarkingStatus = async (
  params: { project_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    // Get CE marking record
    const ceMarking = (await sequelize.query(
      `SELECT * FROM ce_markings
       WHERE project_id = :project_id AND organization_id = :organization_id`,
      {
        replacements: { project_id: params.project_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    if (!ceMarking || ceMarking.length === 0) {
      return {
        project_id: params.project_id,
        status: "not_initialized",
        message: "CE Marking has not been initialized for this project.",
      };
    }

    const record = ceMarking[0];

    // Get conformity steps
    const steps = (await sequelize.query(
      `SELECT step_number, step_name, is_completed, completed_at, completed_by
       FROM ce_marking_conformity_steps
       WHERE ce_marking_id = :ce_marking_id
       ORDER BY step_number ASC`,
      {
        replacements: { ce_marking_id: record.id },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    const completedSteps = steps.filter((s: any) => s.is_completed).length;

    return {
      project_id: params.project_id,
      id: record.id,
      is_high_risk_ai_system: record.is_high_risk_ai_system,
      role_in_product: record.role_in_product,
      annex_iii_category: record.annex_iii_category,
      declaration_status: record.declaration_status,
      registration_status: record.registration_status,
      conformity_steps: {
        total: steps.length,
        completed: completedSteps,
        percentage: steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0,
        steps: steps.map((s: any) => ({
          step_number: s.step_number,
          step_name: s.step_name,
          is_completed: s.is_completed,
        })),
      },
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  } catch (error) {
    logger.error("Error getting CE marking status:", error);
    throw new Error(
      `Failed to get CE marking status: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools ---

const agentUpdateCeMarking = createWriteToolFn({
  toolName: "agent_update_ce_marking",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update CE Marking for project #${params.project_id} — declaration status to "${params.status}"${params.notes ? " with notes" : ""}`,
  executeFn: async (params, organizationId) => {
    const setClauses: string[] = ["declaration_status = :status", "updated_at = NOW()"];
    const replacements: Record<string, any> = {
      project_id: params.project_id,
      organization_id: organizationId,
      status: params.status,
    };

    if (params.notes !== undefined) {
      setClauses.push("notes = :notes");
      replacements.notes = params.notes;
    }

    await sequelize.query(
      `UPDATE ce_markings SET ${setClauses.join(", ")}
       WHERE project_id = :project_id AND organization_id = :organization_id`,
      { replacements },
    );

    return {
      project_id: params.project_id,
      declaration_status: params.status,
      message: "CE Marking updated successfully",
    };
  },
});

const availableCeMarkingTools: any = {
  get_ce_marking_status: getCeMarkingStatus,
  agent_update_ce_marking: agentUpdateCeMarking,
};

export { availableCeMarkingTools };
