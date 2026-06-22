import {
  getPMMConfigByProjectIdQuery,
  getPMMQuestionsQuery,
  getActiveCycleByProjectIdQuery,
  getCycleByIdQuery,
  getPMMResponsesQuery,
  getPMMReportsQuery,
  createPMMConfigQuery,
  updatePMMConfigQuery,
  addPMMQuestionQuery,
  createPMMCycleQuery,
  savePMMResponsesQuery,
  getLatestCycleNumberQuery,
} from "../../utils/postMarketMonitoring.utils";
import type { QuestionType } from "../../domain.layer/interfaces/i.postMarketMonitoring";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// Read Tools
// ============================================================================

const getPmmConfig = async (params: { project_id: number }, organizationId: number) => {
  try {
    const config = await getPMMConfigByProjectIdQuery(params.project_id, organizationId);
    if (!config) {
      return {
        message: "No PMM configuration found for this project.",
        project_id: params.project_id,
      };
    }
    return config;
  } catch (error) {
    logger.error("Error fetching PMM config:", error);
    throw new Error(
      `Failed to fetch PMM config: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getPmmActiveCycle = async (params: { project_id: number }, organizationId: number) => {
  try {
    const cycle = await getActiveCycleByProjectIdQuery(params.project_id, organizationId);
    if (!cycle) {
      return {
        message: "No active PMM cycle found for this project.",
        project_id: params.project_id,
      };
    }
    return cycle;
  } catch (error) {
    logger.error("Error fetching active PMM cycle:", error);
    throw new Error(
      `Failed to fetch active PMM cycle: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getPmmCycleDetail = async (params: { cycle_id: number }, organizationId: number) => {
  try {
    const cycle = await getCycleByIdQuery(params.cycle_id, organizationId);
    if (!cycle) {
      return { message: "PMM cycle not found.", cycle_id: params.cycle_id };
    }
    return cycle;
  } catch (error) {
    logger.error("Error fetching PMM cycle detail:", error);
    throw new Error(
      `Failed to fetch PMM cycle detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getPmmCycleResponses = async (params: { cycle_id: number }, organizationId: number) => {
  try {
    const responses = await getPMMResponsesQuery(params.cycle_id, organizationId);
    return {
      cycle_id: params.cycle_id,
      responses: responses || [],
      total: (responses || []).length,
    };
  } catch (error) {
    logger.error("Error fetching PMM cycle responses:", error);
    throw new Error(
      `Failed to fetch PMM cycle responses: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getPmmQuestions = async (params: { config_id?: number }, organizationId: number) => {
  try {
    if (!params.config_id) {
      return { message: "config_id is required to fetch PMM questions." };
    }
    const questions = await getPMMQuestionsQuery(params.config_id, organizationId);
    return {
      config_id: params.config_id,
      questions: questions || [],
      total: (questions || []).length,
    };
  } catch (error) {
    logger.error("Error fetching PMM questions:", error);
    throw new Error(
      `Failed to fetch PMM questions: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchPmmReports = async (
  params: { project_id?: number; limit?: number },
  organizationId: number,
) => {
  try {
    if (!params.project_id) {
      return { message: "project_id is recommended to filter PMM reports." };
    }
    const reportsResult = await getPMMReportsQuery(
      { projectId: params.project_id, limit: params.limit },
      organizationId,
    );
    return {
      project_id: params.project_id,
      reports: reportsResult.reports || [],
      total: reportsResult.total || 0,
    };
  } catch (error) {
    logger.error("Error fetching PMM reports:", error);
    throw new Error(
      `Failed to fetch PMM reports: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getPmmAnalytics = async (_params: Record<string, unknown>, organizationId: number) => {
  try {
    // Aggregate analytics across all PMM configs
    const [configsResult] = (await sequelize.query(
      `SELECT
        COUNT(*)::INTEGER as total_configs,
        COUNT(*) FILTER (WHERE is_active = true)::INTEGER as active_configs,
        COUNT(*) FILTER (WHERE is_active = false)::INTEGER as inactive_configs
      FROM post_market_monitoring_configs
      WHERE organization_id = :organizationId`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [cyclesResult] = (await sequelize.query(
      `SELECT
        COUNT(*)::INTEGER as total_cycles,
        COUNT(*) FILTER (WHERE status = 'pending')::INTEGER as pending_cycles,
        COUNT(*) FILTER (WHERE status = 'in_progress')::INTEGER as in_progress_cycles,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER as completed_cycles,
        COUNT(*) FILTER (WHERE status = 'overdue')::INTEGER as overdue_cycles
      FROM post_market_monitoring_cycles
      WHERE organization_id = :organizationId`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [flaggedResult] = (await sequelize.query(
      `SELECT COUNT(*)::INTEGER as flagged_count
      FROM post_market_monitoring_responses
      WHERE organization_id = :organizationId AND is_flagged = true`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [frequencyResult] = (await sequelize.query(
      `SELECT frequency_unit, frequency_value, COUNT(*)::INTEGER as count
      FROM post_market_monitoring_configs
      WHERE organization_id = :organizationId AND is_active = true
      GROUP BY frequency_unit, frequency_value
      ORDER BY count DESC`,
      { replacements: { organizationId } },
    )) as [any[], number];

    return {
      configs: configsResult[0] || { total_configs: 0, active_configs: 0, inactive_configs: 0 },
      cycles: cyclesResult[0] || {
        total_cycles: 0,
        pending_cycles: 0,
        in_progress_cycles: 0,
        completed_cycles: 0,
        overdue_cycles: 0,
      },
      flagged_concerns: (flaggedResult[0] as any)?.flagged_count || 0,
      frequency_distribution: frequencyResult || [],
    };
  } catch (error) {
    logger.error("Error getting PMM analytics:", error);
    throw new Error(
      `Failed to get PMM analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getPmmExecutiveSummary = async (_params: Record<string, unknown>, organizationId: number) => {
  try {
    const [summaryResult] = (await sequelize.query(
      `SELECT
        (SELECT COUNT(*)::INTEGER FROM post_market_monitoring_configs WHERE organization_id = :organizationId AND is_active = true) as active_monitors,
        (SELECT COUNT(*)::INTEGER FROM post_market_monitoring_cycles WHERE organization_id = :organizationId AND status = 'pending') as pending_cycles,
        (SELECT COUNT(*)::INTEGER FROM post_market_monitoring_cycles WHERE organization_id = :organizationId AND status = 'overdue') as overdue_cycles,
        (SELECT COUNT(*)::INTEGER FROM post_market_monitoring_responses WHERE organization_id = :organizationId AND is_flagged = true) as total_flagged_concerns`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [recentCycles] = (await sequelize.query(
      `SELECT c.id, c.cycle_number, c.status, c.due_date, cfg.project_id, p.project_title
      FROM post_market_monitoring_cycles c
      JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
      LEFT JOIN projects p ON cfg.project_id = p.id AND p.organization_id = :organizationId
      WHERE c.organization_id = :organizationId
      ORDER BY c.created_at DESC
      LIMIT 5`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [overdueCycleDetails] = (await sequelize.query(
      `SELECT c.id, c.cycle_number, c.due_date, cfg.project_id, p.project_title
      FROM post_market_monitoring_cycles c
      JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
      LEFT JOIN projects p ON cfg.project_id = p.id AND p.organization_id = :organizationId
      WHERE c.organization_id = :organizationId AND c.status = 'overdue'
      ORDER BY c.due_date ASC
      LIMIT 5`,
      { replacements: { organizationId } },
    )) as [any[], number];

    return {
      ...(summaryResult[0] || {
        active_monitors: 0,
        pending_cycles: 0,
        overdue_cycles: 0,
        total_flagged_concerns: 0,
      }),
      recent_cycles: recentCycles || [],
      overdue_cycle_details: overdueCycleDetails || [],
    };
  } catch (error) {
    logger.error("Error getting PMM executive summary:", error);
    throw new Error(
      `Failed to get PMM executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// Write Tools (Human Confirmation Flow)
// ============================================================================

const agentCreatePmmConfig = createWriteToolFn({
  toolName: "agent_create_pmm_config",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create PMM configuration for project #${params.project_id}${params.frequency ? ` with frequency ${params.frequency}` : ""}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const frequencyValue = params.frequency
        ? parseInt(String(params.frequency).replace(/\D/g, ""), 10) || 30
        : 30;
      const frequencyUnit =
        params.frequency && String(params.frequency).includes("day") ? "days" : "days";

      const config = await createPMMConfigQuery(
        {
          project_id: params.project_id as number,
          frequency_value: frequencyValue,
          frequency_unit: frequencyUnit,
          escalation_contact_id: (params.stakeholder_id as number) || undefined,
        },
        (params._userId as number) || 0,
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        id: config.id,
        project_id: params.project_id,
        message: "PMM configuration created successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentUpdatePmmConfig = createWriteToolFn({
  toolName: "agent_update_pmm_config",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const fields = Object.keys(params).filter((k) => k !== "config_id" && !k.startsWith("_"));
    return `Update PMM config #${params.config_id} — fields: ${fields.join(", ")}`;
  },
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const configId = params.config_id as number;
      const updateData: Record<string, any> = {};

      if (params.frequency !== undefined) {
        updateData.frequency_value =
          parseInt(String(params.frequency).replace(/\D/g, ""), 10) || 30;
        updateData.frequency_unit = "days";
      }
      if (params.stakeholder_id !== undefined) {
        updateData.escalation_contact_id = params.stakeholder_id;
      }
      if (params.is_active !== undefined) {
        updateData.is_active = params.is_active;
      }

      await updatePMMConfigQuery(configId, updateData, organizationId, transaction);
      await transaction.commit();
      return { id: configId, updated: true, message: "PMM configuration updated successfully" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentAddPmmQuestion = createWriteToolFn({
  toolName: "agent_add_pmm_question",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Add question to PMM config #${params.config_id}: "${String(params.question_text).substring(0, 50)}${String(params.question_text).length > 50 ? "..." : ""}"`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const question = await addPMMQuestionQuery(
        {
          config_id: params.config_id as number,
          question_text: params.question_text as string,
          question_type: (params.question_type as QuestionType) || "yes_no",
        },
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        id: question.id,
        config_id: params.config_id,
        message: "PMM question added successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentStartPmmCycle = createWriteToolFn({
  toolName: "agent_start_pmm_cycle",
  warningLevel: "warning",
  descriptionFn: (params) => `Start new PMM cycle for config #${params.config_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const configId = params.config_id as number;
      // Get next cycle number
      const latestNumber = await getLatestCycleNumberQuery(configId, organizationId);
      const nextCycleNumber = (latestNumber || 0) + 1;
      // Default due date: 30 days from now
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 30);

      const cycle = await createPMMCycleQuery(
        configId,
        nextCycleNumber,
        dueAt,
        null,
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        id: cycle.id,
        config_id: configId,
        cycle_number: cycle.cycle_number,
        message: "PMM cycle started successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentSubmitPmmResponses = createWriteToolFn({
  toolName: "agent_submit_pmm_responses",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const responses = params.responses as any[];
    return `Submit ${responses.length} response(s) for PMM cycle #${params.cycle_id}`;
  },
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const cycleId = params.cycle_id as number;
      const responses = params.responses as Array<{ question_id: number; response_value: string }>;

      await savePMMResponsesQuery(
        cycleId,
        responses.map((r) => ({
          question_id: r.question_id,
          response_value: r.response_value,
        })),
        organizationId,
        transaction,
      );
      await transaction.commit();
      return {
        cycle_id: cycleId,
        responses_saved: responses.length,
        message: "PMM responses submitted successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentFlagPmmConcern = createWriteToolFn({
  toolName: "agent_flag_pmm_concern",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Flag concern on question #${params.question_id} in cycle #${params.cycle_id}`,
  executeFn: async (params, organizationId) => {
    const cycleId = params.cycle_id as number;
    const questionId = params.question_id as number;
    const concernText = params.concern_text as string;

    await sequelize.query(
      `UPDATE post_market_monitoring_responses
       SET is_flagged = true, flag_reason = :concern_text, flagged_at = NOW()
       WHERE organization_id = :organizationId AND cycle_id = :cycleId AND question_id = :questionId`,
      {
        replacements: { organizationId, cycleId, questionId, concern_text: concernText },
      },
    );
    return {
      cycle_id: cycleId,
      question_id: questionId,
      flagged: true,
      message: "PMM concern flagged successfully",
    };
  },
});

// ============================================================================
// Export
// ============================================================================

const availablePmmTools: any = {
  get_pmm_config: getPmmConfig,
  get_pmm_active_cycle: getPmmActiveCycle,
  get_pmm_cycle_detail: getPmmCycleDetail,
  get_pmm_cycle_responses: getPmmCycleResponses,
  get_pmm_questions: getPmmQuestions,
  fetch_pmm_reports: fetchPmmReports,
  get_pmm_analytics: getPmmAnalytics,
  get_pmm_executive_summary: getPmmExecutiveSummary,
  agent_create_pmm_config: agentCreatePmmConfig,
  agent_update_pmm_config: agentUpdatePmmConfig,
  agent_add_pmm_question: agentAddPmmQuestion,
  agent_start_pmm_cycle: agentStartPmmCycle,
  agent_submit_pmm_responses: agentSubmitPmmResponses,
  agent_flag_pmm_concern: agentFlagPmmConcern,
};

export { availablePmmTools };
