import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  IPMMConfig,
  IPMMConfigCreateRequest,
  IPMMConfigUpdateRequest,
  IPMMQuestion,
  IPMMQuestionCreate,
  IPMMQuestionUpdate,
  IPMMCycle,
  IPMMResponse,
  IPMMResponseSave,
  IPMMReport,
  IPMMContextSnapshot,
  IPMMConfigWithDetails,
  IPMMCycleWithDetails,
} from "../domain.layer/interfaces/i.postMarketMonitoring";

// ============================================================================
// Configuration Queries
// ============================================================================

export const getPMMConfigByProjectIdQuery = async (
  projectId: number,
  organizationId: number
): Promise<IPMMConfigWithDetails | null> => {
  const result = await sequelize.query(
    `SELECT
      c.*,
      p.project_title,
      u.name as escalation_contact_name,
      u.email as escalation_contact_email,
      (SELECT COUNT(*) FROM post_market_monitoring_questions WHERE organization_id = :organizationId AND config_id = c.id) as questions_count
    FROM post_market_monitoring_configs c
    LEFT JOIN projects p ON c.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN users u ON c.escalation_contact_id = u.id
    WHERE c.organization_id = :organizationId AND c.project_id = :projectId;`,
    {
      replacements: { projectId, organizationId },
    }
  ) as [IPMMConfigWithDetails[], number];

  if (result[0].length === 0) return null;

  const config = result[0][0];

  // Get active cycle if exists
  const activeCycle = await getActiveCycleByConfigIdQuery(config.id!, organizationId);
  config.active_cycle = activeCycle;

  return config;
};

export const createPMMConfigQuery = async (
  configData: IPMMConfigCreateRequest,
  userId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMConfig> => {
  const result = await sequelize.query(
    `INSERT INTO post_market_monitoring_configs (
      organization_id, project_id, frequency_value, frequency_unit, start_date,
      reminder_days, escalation_days, escalation_contact_id,
      notification_hour, created_by
    ) VALUES (
      :organizationId, :project_id, :frequency_value, :frequency_unit, :start_date,
      :reminder_days, :escalation_days, :escalation_contact_id,
      :notification_hour, :created_by
    ) RETURNING *;`,
    {
      replacements: {
        organizationId,
        project_id: configData.project_id,
        frequency_value: configData.frequency_value || 30,
        frequency_unit: configData.frequency_unit || "days",
        start_date: configData.start_date || null,
        reminder_days: configData.reminder_days || 3,
        escalation_days: configData.escalation_days || 7,
        escalation_contact_id: configData.escalation_contact_id || null,
        notification_hour: configData.notification_hour || 9,
        created_by: userId,
      },
      transaction,
    }
  ) as [IPMMConfig[], number];

  return result[0][0];
};

export const updatePMMConfigQuery = async (
  configId: number,
  updateData: IPMMConfigUpdateRequest,
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMConfig | null> => {
  const setClauses: string[] = [];
  const replacements: Record<string, any> = { configId, organizationId };

  if (updateData.is_active !== undefined) {
    setClauses.push("is_active = :is_active");
    replacements.is_active = updateData.is_active;
  }
  if (updateData.frequency_value !== undefined) {
    setClauses.push("frequency_value = :frequency_value");
    replacements.frequency_value = updateData.frequency_value;
  }
  if (updateData.frequency_unit !== undefined) {
    setClauses.push("frequency_unit = :frequency_unit");
    replacements.frequency_unit = updateData.frequency_unit;
  }
  if (updateData.start_date !== undefined) {
    setClauses.push("start_date = :start_date");
    replacements.start_date = updateData.start_date;
  }
  if (updateData.reminder_days !== undefined) {
    setClauses.push("reminder_days = :reminder_days");
    replacements.reminder_days = updateData.reminder_days;
  }
  if (updateData.escalation_days !== undefined) {
    setClauses.push("escalation_days = :escalation_days");
    replacements.escalation_days = updateData.escalation_days;
  }
  if (updateData.escalation_contact_id !== undefined) {
    setClauses.push("escalation_contact_id = :escalation_contact_id");
    replacements.escalation_contact_id = updateData.escalation_contact_id;
  }
  if (updateData.notification_hour !== undefined) {
    setClauses.push("notification_hour = :notification_hour");
    replacements.notification_hour = updateData.notification_hour;
  }

  setClauses.push("updated_at = NOW()");

  if (setClauses.length === 1) {
    // Only updated_at, nothing to update
    const result = await sequelize.query(
      `SELECT * FROM post_market_monitoring_configs WHERE organization_id = :organizationId AND id = :configId;`,
      { replacements: { configId, organizationId }, transaction }
    ) as [IPMMConfig[], number];
    return result[0][0] || null;
  }

  const result = await sequelize.query(
    `UPDATE post_market_monitoring_configs
     SET ${setClauses.join(", ")}
     WHERE organization_id = :organizationId AND id = :configId
     RETURNING *;`,
    { replacements, transaction }
  ) as [IPMMConfig[], number];

  return result[0][0] || null;
};

export const deletePMMConfigQuery = async (
  configId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> => {
  const result = await sequelize.query(
    `DELETE FROM post_market_monitoring_configs WHERE organization_id = :organizationId AND id = :configId;`,
    { replacements: { configId, organizationId }, transaction }
  );
  return (result as any)[1] > 0;
};

export const getActiveConfigsForNotificationHourQuery = async (
  hour: number,
  organizationId: number
): Promise<IPMMConfigWithDetails[]> => {
  const result = await sequelize.query(
    `SELECT
      c.*,
      p.project_title,
      u.name as escalation_contact_name,
      u.email as escalation_contact_email
    FROM post_market_monitoring_configs c
    LEFT JOIN projects p ON c.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN users u ON c.escalation_contact_id = u.id
    WHERE c.organization_id = :organizationId AND c.is_active = true AND c.notification_hour = :hour;`,
    { replacements: { hour, organizationId } }
  ) as [IPMMConfigWithDetails[], number];

  return result[0];
};

// ============================================================================
// Question Queries
// ============================================================================

export const getPMMQuestionsQuery = async (
  configId: number | null,
  organizationId: number
): Promise<IPMMQuestion[]> => {
  const whereClause = configId === null
    ? "config_id IS NULL"
    : "config_id = :configId";

  const result = await sequelize.query(
    `SELECT * FROM post_market_monitoring_questions
     WHERE organization_id = :organizationId AND ${whereClause}
     ORDER BY display_order ASC;`,
    { replacements: { configId, organizationId } }
  ) as [IPMMQuestion[], number];

  return result[0];
};

export const addPMMQuestionQuery = async (
  questionData: IPMMQuestionCreate,
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMQuestion> => {
  // Get next display order
  const orderResult = await sequelize.query(
    `SELECT COALESCE(MAX(display_order), 0) + 1 as next_order
     FROM post_market_monitoring_questions
     WHERE organization_id = :organizationId AND ${questionData.config_id ? "config_id = :configId" : "config_id IS NULL"};`,
    { replacements: { configId: questionData.config_id, organizationId }, transaction }
  ) as [{ next_order: number }[], number];

  const nextOrder = questionData.display_order ?? orderResult[0][0].next_order;

  const result = await sequelize.query(
    `INSERT INTO post_market_monitoring_questions (
      organization_id, config_id, question_text, question_type, options,
      suggestion_text, is_required, allows_flag_for_concern,
      display_order, eu_ai_act_article
    ) VALUES (
      :organizationId, :config_id, :question_text, :question_type, :options,
      :suggestion_text, :is_required, :allows_flag_for_concern,
      :display_order, :eu_ai_act_article
    ) RETURNING *;`,
    {
      replacements: {
        organizationId,
        config_id: questionData.config_id || null,
        question_text: questionData.question_text,
        question_type: questionData.question_type,
        options: JSON.stringify(questionData.options || []),
        suggestion_text: questionData.suggestion_text || null,
        is_required: questionData.is_required ?? true,
        allows_flag_for_concern: questionData.allows_flag_for_concern ?? true,
        display_order: nextOrder,
        eu_ai_act_article: questionData.eu_ai_act_article || null,
      },
      transaction,
    }
  ) as [IPMMQuestion[], number];

  return result[0][0];
};

export const updatePMMQuestionQuery = async (
  questionId: number,
  updateData: IPMMQuestionUpdate,
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMQuestion | null> => {
  const setClauses: string[] = [];
  const replacements: Record<string, any> = { questionId, organizationId };

  if (updateData.question_text !== undefined) {
    setClauses.push("question_text = :question_text");
    replacements.question_text = updateData.question_text;
  }
  if (updateData.question_type !== undefined) {
    setClauses.push("question_type = :question_type");
    replacements.question_type = updateData.question_type;
  }
  if (updateData.options !== undefined) {
    setClauses.push("options = :options");
    replacements.options = JSON.stringify(updateData.options);
  }
  if (updateData.suggestion_text !== undefined) {
    setClauses.push("suggestion_text = :suggestion_text");
    replacements.suggestion_text = updateData.suggestion_text;
  }
  if (updateData.is_required !== undefined) {
    setClauses.push("is_required = :is_required");
    replacements.is_required = updateData.is_required;
  }
  if (updateData.allows_flag_for_concern !== undefined) {
    setClauses.push("allows_flag_for_concern = :allows_flag_for_concern");
    replacements.allows_flag_for_concern = updateData.allows_flag_for_concern;
  }
  if (updateData.display_order !== undefined) {
    setClauses.push("display_order = :display_order");
    replacements.display_order = updateData.display_order;
  }
  if (updateData.eu_ai_act_article !== undefined) {
    setClauses.push("eu_ai_act_article = :eu_ai_act_article");
    replacements.eu_ai_act_article = updateData.eu_ai_act_article;
  }

  if (setClauses.length === 0) {
    const result = await sequelize.query(
      `SELECT * FROM post_market_monitoring_questions WHERE organization_id = :organizationId AND id = :questionId;`,
      { replacements: { questionId, organizationId }, transaction }
    ) as [IPMMQuestion[], number];
    return result[0][0] || null;
  }

  const result = await sequelize.query(
    `UPDATE post_market_monitoring_questions
     SET ${setClauses.join(", ")}
     WHERE organization_id = :organizationId AND id = :questionId
     RETURNING *;`,
    { replacements, transaction }
  ) as [IPMMQuestion[], number];

  return result[0][0] || null;
};

export const deletePMMQuestionQuery = async (
  questionId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> => {
  const result = await sequelize.query(
    `DELETE FROM post_market_monitoring_questions
     WHERE organization_id = :organizationId AND id = :questionId AND is_system_default = false;`,
    { replacements: { questionId, organizationId }, transaction }
  );
  return (result as any)[1] > 0;
};

export const reorderPMMQuestionsQuery = async (
  questionOrders: Array<{ id: number; display_order: number }>,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  for (const item of questionOrders) {
    await sequelize.query(
      `UPDATE post_market_monitoring_questions
       SET display_order = :display_order
       WHERE organization_id = :organizationId AND id = :id;`,
      {
        replacements: { id: item.id, display_order: item.display_order, organizationId },
        transaction,
      }
    );
  }
};

// ============================================================================
// Cycle Queries
// ============================================================================

export const createPMMCycleQuery = async (
  configId: number,
  cycleNumber: number,
  dueAt: Date,
  stakeholderId: number | null,
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMCycle> => {
  const result = await sequelize.query(
    `INSERT INTO post_market_monitoring_cycles (
      organization_id, config_id, cycle_number, status, started_at, due_at, assigned_stakeholder_id
    ) VALUES (
      :organizationId, :config_id, :cycle_number, 'pending', NOW(), :due_at, :stakeholder_id
    ) RETURNING *;`,
    {
      replacements: {
        organizationId,
        config_id: configId,
        cycle_number: cycleNumber,
        due_at: dueAt,
        stakeholder_id: stakeholderId,
      },
      transaction,
    }
  ) as [IPMMCycle[], number];

  return result[0][0];
};

export const getActiveCycleByConfigIdQuery = async (
  configId: number,
  organizationId: number
): Promise<IPMMCycleWithDetails | null> => {
  const result = await sequelize.query(
    `SELECT
      c.*,
      cfg.project_id,
      p.project_title,
      u.name as stakeholder_name,
      u.email as stakeholder_email,
      cu.name as completed_by_name,
      (SELECT COUNT(*) FROM post_market_monitoring_responses r WHERE r.organization_id = :organizationId AND r.cycle_id = c.id AND r.is_flagged = true) > 0 as has_flagged_concerns,
      (SELECT COUNT(*) FROM post_market_monitoring_responses r WHERE r.organization_id = :organizationId AND r.cycle_id = c.id) as responses_count,
      (SELECT COUNT(*) FROM post_market_monitoring_questions q WHERE q.organization_id = :organizationId AND q.config_id = c.config_id) as questions_count
    FROM post_market_monitoring_cycles c
    LEFT JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
    LEFT JOIN projects p ON cfg.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN users u ON c.assigned_stakeholder_id = u.id
    LEFT JOIN users cu ON c.completed_by = cu.id
    WHERE c.organization_id = :organizationId AND c.config_id = :configId AND c.status IN ('pending', 'in_progress', 'escalated')
    ORDER BY c.cycle_number DESC
    LIMIT 1;`,
    { replacements: { configId, organizationId } }
  ) as [IPMMCycleWithDetails[], number];

  return result[0][0] || null;
};

export const getActiveCycleByProjectIdQuery = async (
  projectId: number,
  organizationId: number
): Promise<IPMMCycleWithDetails | null> => {
  const result = await sequelize.query(
    `SELECT
      c.*,
      cfg.project_id,
      p.project_title,
      u.name as stakeholder_name,
      u.email as stakeholder_email,
      (SELECT COUNT(*) FROM post_market_monitoring_responses r WHERE r.organization_id = :organizationId AND r.cycle_id = c.id) as responses_count,
      (SELECT COUNT(*) FROM post_market_monitoring_questions q WHERE q.organization_id = :organizationId AND q.config_id = c.config_id) as questions_count
    FROM post_market_monitoring_cycles c
    LEFT JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
    LEFT JOIN projects p ON cfg.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN users u ON c.assigned_stakeholder_id = u.id
    WHERE c.organization_id = :organizationId AND cfg.project_id = :projectId AND c.status IN ('pending', 'in_progress', 'escalated')
    ORDER BY c.cycle_number DESC
    LIMIT 1;`,
    { replacements: { projectId, organizationId } }
  ) as [IPMMCycleWithDetails[], number];

  return result[0][0] || null;
};

export const getCycleByIdQuery = async (
  cycleId: number,
  organizationId: number
): Promise<IPMMCycleWithDetails | null> => {
  const result = await sequelize.query(
    `SELECT
      c.*,
      cfg.project_id,
      p.project_title,
      u.name as stakeholder_name,
      u.email as stakeholder_email,
      cu.name as completed_by_name,
      (SELECT COUNT(*) FROM post_market_monitoring_responses r WHERE r.organization_id = :organizationId AND r.cycle_id = c.id AND r.is_flagged = true) > 0 as has_flagged_concerns,
      (SELECT COUNT(*) FROM post_market_monitoring_responses r WHERE r.organization_id = :organizationId AND r.cycle_id = c.id) as responses_count,
      (SELECT COUNT(*) FROM post_market_monitoring_questions q WHERE q.organization_id = :organizationId AND q.config_id = c.config_id) as questions_count
    FROM post_market_monitoring_cycles c
    LEFT JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
    LEFT JOIN projects p ON cfg.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN users u ON c.assigned_stakeholder_id = u.id
    LEFT JOIN users cu ON c.completed_by = cu.id
    WHERE c.organization_id = :organizationId AND c.id = :cycleId;`,
    { replacements: { cycleId, organizationId } }
  ) as [IPMMCycleWithDetails[], number];

  return result[0][0] || null;
};

export const getPendingCyclesForProcessingQuery = async (
  organizationId: number
): Promise<IPMMCycleWithDetails[]> => {
  const result = await sequelize.query(
    `SELECT
      c.*,
      cfg.project_id,
      cfg.reminder_days,
      cfg.escalation_days,
      cfg.escalation_contact_id,
      p.project_title,
      u.name as stakeholder_name,
      u.email as stakeholder_email,
      eu.name as escalation_contact_name,
      eu.email as escalation_contact_email
    FROM post_market_monitoring_cycles c
    JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
    LEFT JOIN projects p ON cfg.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN users u ON c.assigned_stakeholder_id = u.id
    LEFT JOIN users eu ON cfg.escalation_contact_id = eu.id
    WHERE c.organization_id = :organizationId AND cfg.is_active = true
      AND c.status IN ('pending', 'in_progress', 'escalated');`,
    { replacements: { organizationId } }
  ) as [IPMMCycleWithDetails[], number];

  return result[0];
};

export const updateCycleStatusQuery = async (
  cycleId: number,
  status: string,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE post_market_monitoring_cycles
     SET status = :status
     WHERE organization_id = :organizationId AND id = :cycleId;`,
    { replacements: { cycleId, status, organizationId }, transaction }
  );
};

export const markCycleReminderSentQuery = async (
  cycleId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE post_market_monitoring_cycles
     SET reminder_sent_at = NOW()
     WHERE organization_id = :organizationId AND id = :cycleId;`,
    { replacements: { cycleId, organizationId }, transaction }
  );
};

export const markCycleEscalationSentQuery = async (
  cycleId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE post_market_monitoring_cycles
     SET escalation_sent_at = NOW(), status = 'escalated'
     WHERE organization_id = :organizationId AND id = :cycleId;`,
    { replacements: { cycleId, organizationId }, transaction }
  );
};

export const completeCycleQuery = async (
  cycleId: number,
  userId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE post_market_monitoring_cycles
     SET status = 'completed', completed_at = NOW(), completed_by = :userId
     WHERE organization_id = :organizationId AND id = :cycleId;`,
    { replacements: { cycleId, userId, organizationId }, transaction }
  );
};

export const reassignCycleStakeholderQuery = async (
  cycleId: number,
  newStakeholderId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE post_market_monitoring_cycles
     SET assigned_stakeholder_id = :stakeholderId
     WHERE organization_id = :organizationId AND id = :cycleId;`,
    { replacements: { cycleId, stakeholderId: newStakeholderId, organizationId }, transaction }
  );
};

export const getLatestCycleNumberQuery = async (
  configId: number,
  organizationId: number
): Promise<number> => {
  const result = await sequelize.query(
    `SELECT COALESCE(MAX(cycle_number), 0) as latest_cycle
     FROM post_market_monitoring_cycles
     WHERE organization_id = :organizationId AND config_id = :configId;`,
    { replacements: { configId, organizationId } }
  ) as [{ latest_cycle: number }[], number];

  return result[0][0].latest_cycle;
};

// ============================================================================
// Response Queries
// ============================================================================

export const savePMMResponseQuery = async (
  cycleId: number,
  responseData: IPMMResponseSave,
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMResponse> => {
  const result = await sequelize.query(
    `INSERT INTO post_market_monitoring_responses (
      organization_id, cycle_id, question_id, response_value, is_flagged
    ) VALUES (
      :organizationId, :cycle_id, :question_id, :response_value, :is_flagged
    )
    ON CONFLICT (organization_id, cycle_id, question_id)
    DO UPDATE SET
      response_value = :response_value,
      is_flagged = :is_flagged,
      updated_at = NOW()
    RETURNING *;`,
    {
      replacements: {
        organizationId,
        cycle_id: cycleId,
        question_id: responseData.question_id,
        response_value: JSON.stringify(responseData.response_value),
        is_flagged: responseData.is_flagged ?? false,
      },
      transaction,
    }
  ) as [IPMMResponse[], number];

  return result[0][0];
};

export const savePMMResponsesQuery = async (
  cycleId: number,
  responses: IPMMResponseSave[],
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMResponse[]> => {
  const savedResponses: IPMMResponse[] = [];

  for (const response of responses) {
    const saved = await savePMMResponseQuery(cycleId, response, organizationId, transaction);
    savedResponses.push(saved);
  }

  return savedResponses;
};

export const getPMMResponsesQuery = async (
  cycleId: number,
  organizationId: number
): Promise<IPMMResponse[]> => {
  const result = await sequelize.query(
    `SELECT
      r.*,
      q.question_text,
      q.question_type,
      q.suggestion_text,
      q.eu_ai_act_article
    FROM post_market_monitoring_responses r
    JOIN post_market_monitoring_questions q ON r.question_id = q.id AND q.organization_id = :organizationId
    WHERE r.organization_id = :organizationId AND r.cycle_id = :cycleId
    ORDER BY q.display_order ASC;`,
    { replacements: { cycleId, organizationId } }
  ) as [IPMMResponse[], number];

  return result[0];
};

export const getFlaggedResponsesQuery = async (
  cycleId: number,
  organizationId: number
): Promise<IPMMResponse[]> => {
  const result = await sequelize.query(
    `SELECT
      r.*,
      q.question_text,
      q.question_type,
      q.suggestion_text,
      q.eu_ai_act_article
    FROM post_market_monitoring_responses r
    JOIN post_market_monitoring_questions q ON r.question_id = q.id AND q.organization_id = :organizationId
    WHERE r.organization_id = :organizationId AND r.cycle_id = :cycleId AND r.is_flagged = true
    ORDER BY q.display_order ASC;`,
    { replacements: { cycleId, organizationId } }
  ) as [IPMMResponse[], number];

  return result[0];
};

// ============================================================================
// Report Queries
// ============================================================================

export const createPMMReportQuery = async (
  cycleId: number,
  contextSnapshot: IPMMContextSnapshot,
  fileId: number | null,
  userId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<IPMMReport> => {
  const result = await sequelize.query(
    `INSERT INTO post_market_monitoring_reports (
      organization_id, cycle_id, file_id, context_snapshot, generated_by
    ) VALUES (
      :organizationId, :cycle_id, :file_id, :context_snapshot, :generated_by
    ) RETURNING *;`,
    {
      replacements: {
        organizationId,
        cycle_id: cycleId,
        file_id: fileId,
        context_snapshot: JSON.stringify(contextSnapshot),
        generated_by: userId,
      },
      transaction,
    }
  ) as [IPMMReport[], number];

  return result[0][0];
};

export const getPMMReportByCycleIdQuery = async (
  cycleId: number,
  organizationId: number
): Promise<IPMMReport | null> => {
  const result = await sequelize.query(
    `SELECT r.*, f.filename as file_name
     FROM post_market_monitoring_reports r
     LEFT JOIN files f ON r.file_id = f.id AND f.organization_id = :organizationId
     WHERE r.organization_id = :organizationId AND r.cycle_id = :cycleId;`,
    { replacements: { cycleId, organizationId } }
  ) as [IPMMReport[], number];

  return result[0][0] || null;
};

export const getPMMReportsQuery = async (
  filters: {
    projectId?: number;
    startDate?: string;
    endDate?: string;
    completedBy?: number;
    flaggedOnly?: boolean;
    page?: number;
    limit?: number;
  },
  organizationId: number
): Promise<{ reports: any[]; total: number }> => {
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const offset = (page - 1) * limit;

  const whereClauses: string[] = ["r.organization_id = :organizationId"];
  const replacements: Record<string, any> = { limit, offset, organizationId };

  if (filters.projectId) {
    whereClauses.push("cfg.project_id = :projectId");
    replacements.projectId = filters.projectId;
  }
  if (filters.startDate) {
    whereClauses.push("r.generated_at >= :startDate");
    replacements.startDate = filters.startDate;
  }
  if (filters.endDate) {
    whereClauses.push("r.generated_at <= :endDate");
    replacements.endDate = filters.endDate;
  }
  if (filters.completedBy) {
    whereClauses.push("c.completed_by = :completedBy");
    replacements.completedBy = filters.completedBy;
  }
  if (filters.flaggedOnly) {
    whereClauses.push(`(SELECT COUNT(*) FROM post_market_monitoring_responses resp WHERE resp.organization_id = :organizationId AND resp.cycle_id = c.id AND resp.is_flagged = true) > 0`);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countResult = await sequelize.query(
    `SELECT COUNT(*) as total
     FROM post_market_monitoring_reports r
     JOIN post_market_monitoring_cycles c ON r.cycle_id = c.id AND c.organization_id = :organizationId
     JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
     ${whereClause};`,
    { replacements }
  ) as [{ total: string }[], number];

  const total = parseInt(countResult[0][0].total, 10);

  const result = await sequelize.query(
    `SELECT
      r.*,
      c.cycle_number,
      c.completed_at,
      c.completed_by,
      cfg.project_id,
      p.project_title,
      u.name as completed_by_name,
      f.filename as file_name,
      (SELECT COUNT(*) FROM post_market_monitoring_responses resp WHERE resp.organization_id = :organizationId AND resp.cycle_id = c.id AND resp.is_flagged = true) > 0 as has_flagged_concerns
     FROM post_market_monitoring_reports r
     JOIN post_market_monitoring_cycles c ON r.cycle_id = c.id AND c.organization_id = :organizationId
     JOIN post_market_monitoring_configs cfg ON c.config_id = cfg.id AND cfg.organization_id = :organizationId
     LEFT JOIN projects p ON cfg.project_id = p.id AND p.organization_id = :organizationId
     LEFT JOIN users u ON c.completed_by = u.id
     LEFT JOIN files f ON r.file_id = f.id AND f.organization_id = :organizationId
     ${whereClause}
     ORDER BY r.generated_at DESC
     LIMIT :limit OFFSET :offset;`,
    { replacements }
  ) as [any[], number];

  return { reports: result[0], total };
};

// ============================================================================
// Context Snapshot Queries
// ============================================================================

export const getContextSnapshotQuery = async (
  projectId: number,
  organizationId: number
): Promise<IPMMContextSnapshot> => {
  // Get project details
  const projectResult = await sequelize.query(
    `SELECT project_title, status FROM projects WHERE organization_id = :organizationId AND id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ project_title: string; status: string }[], number];

  const project = projectResult[0][0] || { project_title: "", status: "" };

  // Get risk counts
  const riskResult = await sequelize.query(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN risk_severity = 'High' OR risk_severity = 'high' THEN 1 ELSE 0 END) as high_count,
      SUM(CASE WHEN risk_severity = 'Medium' OR risk_severity = 'medium' THEN 1 ELSE 0 END) as medium_count,
      SUM(CASE WHEN risk_severity = 'Low' OR risk_severity = 'low' THEN 1 ELSE 0 END) as low_count
     FROM risks
     WHERE organization_id = :organizationId AND project_id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ total: string; high_count: string; medium_count: string; low_count: string }[], number];

  const risks = riskResult[0][0] || { total: "0", high_count: "0", medium_count: "0", low_count: "0" };

  // Get model counts
  const modelResult = await sequelize.query(
    `SELECT COUNT(*) as total FROM model_inventories WHERE organization_id = :organizationId AND project_id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ total: string }[], number];

  const models = parseInt(modelResult[0][0]?.total || "0", 10);

  // Get model risks count
  const modelRiskResult = await sequelize.query(
    `SELECT COUNT(*) as total
     FROM model_risks mr
     JOIN model_inventories mi ON mr.model_id = mi.id AND mi.organization_id = :organizationId
     WHERE mr.organization_id = :organizationId AND mi.project_id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ total: string }[], number];

  const modelRisks = parseInt(modelRiskResult[0][0]?.total || "0", 10);

  // Get vendor counts
  const vendorResult = await sequelize.query(
    `SELECT COUNT(DISTINCT v.id) as total
     FROM vendors v
     JOIN vendors_projects vp ON v.id = vp.vendor_id AND vp.organization_id = :organizationId
     WHERE v.organization_id = :organizationId AND vp.project_id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ total: string }[], number];

  const vendors = parseInt(vendorResult[0][0]?.total || "0", 10);

  // Get vendor risks count
  const vendorRiskResult = await sequelize.query(
    `SELECT COUNT(*) as total
     FROM vendorrisks vr
     JOIN vendors v ON vr.vendor_id = v.id AND v.organization_id = :organizationId
     JOIN vendors_projects vp ON v.id = vp.vendor_id AND vp.organization_id = :organizationId
     WHERE vr.organization_id = :organizationId AND vp.project_id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ total: string }[], number];

  const vendorRisks = parseInt(vendorRiskResult[0][0]?.total || "0", 10);

  return {
    use_case_title: project.project_title,
    use_case_status: project.status,
    risks_count: parseInt(risks.total, 10),
    high_risk_count: parseInt(risks.high_count, 10),
    medium_risk_count: parseInt(risks.medium_count, 10),
    low_risk_count: parseInt(risks.low_count, 10),
    models_count: models,
    model_risks_count: modelRisks,
    vendors_count: vendors,
    vendor_risks_count: vendorRisks,
    captured_at: new Date(),
  };
};

// ============================================================================
// Stakeholder Queries
// ============================================================================

export const getAssignedStakeholderQuery = async (
  projectId: number,
  organizationId: number
): Promise<{ id: number; name: string; email: string } | null> => {
  // First try to get an assigned stakeholder from project members
  const result = await sequelize.query(
    `SELECT u.id, u.name, u.email
     FROM users u
     JOIN projects_members pm ON u.id = pm.user_id AND pm.organization_id = :organizationId
     WHERE pm.project_id = :projectId
     ORDER BY pm.id ASC
     LIMIT 1;`,
    { replacements: { projectId, organizationId } }
  ) as [{ id: number; name: string; email: string }[], number];

  if (result[0].length > 0) {
    return result[0][0];
  }

  // Fallback to project owner
  const ownerResult = await sequelize.query(
    `SELECT u.id, u.name, u.email
     FROM users u
     JOIN projects p ON u.id = p.owner AND p.organization_id = :organizationId
     WHERE p.id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ id: number; name: string; email: string }[], number];

  return ownerResult[0][0] || null;
};

export const getProjectStakeholdersQuery = async (
  projectId: number,
  organizationId: number
): Promise<Array<{ id: number; name: string; email: string }>> => {
  const result = await sequelize.query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     LEFT JOIN projects_members pm ON u.id = pm.user_id AND pm.organization_id = :organizationId AND pm.project_id = :projectId
     LEFT JOIN projects p ON u.id = p.owner AND p.organization_id = :organizationId AND p.id = :projectId
     WHERE pm.project_id = :projectId OR p.id = :projectId;`,
    { replacements: { projectId, organizationId } }
  ) as [{ id: number; name: string; email: string }[], number];

  return result[0];
};

// ============================================================================
// Deactivation Queries
// ============================================================================

export const deactivateConfigForProjectQuery = async (
  projectId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE post_market_monitoring_configs
     SET is_active = false, updated_at = NOW()
     WHERE organization_id = :organizationId AND project_id = :projectId;`,
    { replacements: { projectId, organizationId }, transaction }
  );
};

export const cancelPendingCyclesForConfigQuery = async (
  configId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(
    `UPDATE post_market_monitoring_cycles
     SET status = 'completed', completed_at = NOW()
     WHERE organization_id = :organizationId AND config_id = :configId AND status IN ('pending', 'in_progress');`,
    { replacements: { configId, organizationId }, transaction }
  );
};
