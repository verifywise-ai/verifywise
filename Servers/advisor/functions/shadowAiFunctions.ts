import {
  getInsightsSummaryQuery,
  getToolsByEventsQuery,
  getToolsByUsersQuery,
  getUsersByDepartmentQuery,
  getTrendQuery,
  getUserActivityQuery,
} from "../../utils/shadowAiInsights.utils";
import {
  getToolByIdQuery,
  getToolDepartmentsQuery,
  getToolTopUsersQuery,
  updateToolStatusQuery,
} from "../../utils/shadowAiTools.utils";
import { getAlertHistoryQuery, createRuleQuery } from "../../utils/shadowAiRules.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// Read Tools
// ============================================================================

const getShadowAiSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<unknown> => {
  try {
    const summary = await getInsightsSummaryQuery(organizationId);
    return summary;
  } catch (error) {
    logger.error("Error fetching Shadow AI summary:", error);
    throw new Error(
      `Failed to fetch Shadow AI summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getShadowAiToolsByEvents = async (
  params: { limit?: number; time_range?: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const limit = params.limit || 6;
    const periodDays = params.time_range || 30;
    const tools = await getToolsByEventsQuery(organizationId, periodDays, limit);
    return tools;
  } catch (error) {
    logger.error("Error fetching Shadow AI tools by events:", error);
    throw new Error(
      `Failed to fetch Shadow AI tools by events: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getShadowAiToolsByUsers = async (
  params: { limit?: number; time_range?: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const limit = params.limit || 6;
    const periodDays = params.time_range || 30;
    const tools = await getToolsByUsersQuery(organizationId, periodDays, limit);
    return tools;
  } catch (error) {
    logger.error("Error fetching Shadow AI tools by users:", error);
    throw new Error(
      `Failed to fetch Shadow AI tools by users: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getShadowAiTrend = async (
  params: { time_range?: number; interval?: "daily" | "weekly" | "monthly" },
  organizationId: number,
): Promise<unknown> => {
  try {
    const periodDays = params.time_range || 90;
    const granularity = params.interval || "daily";
    const trend = await getTrendQuery(organizationId, periodDays, granularity);
    return trend;
  } catch (error) {
    logger.error("Error fetching Shadow AI trend:", error);
    throw new Error(
      `Failed to fetch Shadow AI trend: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getShadowAiUsersByDepartment = async (
  params: { department?: string; limit?: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    let departments = await getUsersByDepartmentQuery(organizationId);

    if (params.department) {
      departments = departments.filter((d) =>
        d.department.toLowerCase().includes(params.department!.toLowerCase()),
      );
    }

    if (params.limit && params.limit > 0) {
      departments = departments.slice(0, params.limit);
    }

    return departments;
  } catch (error) {
    logger.error("Error fetching Shadow AI users by department:", error);
    throw new Error(
      `Failed to fetch Shadow AI users by department: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getShadowAiUserActivity = async (
  params: { user_id: string },
  organizationId: number,
): Promise<unknown> => {
  try {
    const result = await getUserActivityQuery(organizationId, {
      department: undefined,
    });

    // Find the specific user in the results
    const user = result.users.find(
      (u) => u.user_email.toLowerCase() === params.user_id.toLowerCase(),
    );

    if (!user) {
      return { message: `No activity found for user: ${params.user_id}` };
    }

    return user;
  } catch (error) {
    logger.error("Error fetching Shadow AI user activity:", error);
    throw new Error(
      `Failed to fetch Shadow AI user activity: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getShadowAiToolDetail = async (
  params: { tool_id: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const tool = await getToolByIdQuery(organizationId, params.tool_id);

    if (!tool) {
      return { message: `Tool with ID ${params.tool_id} not found` };
    }

    // Fetch additional details
    const [departments, topUsers] = await Promise.all([
      getToolDepartmentsQuery(organizationId, params.tool_id),
      getToolTopUsersQuery(organizationId, params.tool_id),
    ]);

    return {
      ...tool,
      departments,
      top_users: topUsers,
    };
  } catch (error) {
    logger.error("Error fetching Shadow AI tool detail:", error);
    throw new Error(
      `Failed to fetch Shadow AI tool detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getShadowAiAlertHistory = async (
  params: { limit?: number; rule_id?: number },
  organizationId: number,
): Promise<unknown> => {
  try {
    const result = await getAlertHistoryQuery(organizationId, {
      limit: params.limit || 20,
      ruleId: params.rule_id,
    });
    return result;
  } catch (error) {
    logger.error("Error fetching Shadow AI alert history:", error);
    throw new Error(
      `Failed to fetch Shadow AI alert history: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// Write Tools
// ============================================================================

const agentUpdateShadowAiToolStatus = createWriteToolFn({
  toolName: "agent_update_shadow_ai_tool_status",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update Shadow AI tool #${params.tool_id} status to "${params.status}"`,
  executeFn: async (params, organizationId) => {
    const toolId = params.tool_id as number;
    const status = params.status as "approved" | "blocked" | "under_review";
    const result = await updateToolStatusQuery(organizationId, toolId, status);
    if (!result) {
      throw new Error(`Tool with ID ${toolId} not found`);
    }
    return { id: toolId, status, message: "Tool status updated successfully" };
  },
});

const agentStartShadowAiGovernance = createWriteToolFn({
  toolName: "agent_start_shadow_ai_governance",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Start governance review for Shadow AI tool #${params.tool_id}${params.governance_notes ? ` with notes` : ""}`,
  executeFn: async (params, organizationId) => {
    const toolId = params.tool_id as number;
    const governanceNotes = params.governance_notes as string | undefined;

    // Set tool to under_review status
    const result = await updateToolStatusQuery(organizationId, toolId, "under_review");
    if (!result) {
      throw new Error(`Tool with ID ${toolId} not found`);
    }

    // If governance notes provided, store them
    if (governanceNotes) {
      await sequelize.query(
        `UPDATE shadow_ai_tools
         SET governance_notes = :governance_notes, updated_at = NOW()
         WHERE organization_id = :organizationId AND id = :toolId`,
        {
          replacements: { organizationId, toolId, governance_notes: governanceNotes },
        },
      );
    }

    return {
      id: toolId,
      status: "under_review",
      governance_notes: governanceNotes || null,
      message: "Governance review started successfully",
    };
  },
});

const agentCreateShadowAiAlertRule = createWriteToolFn({
  toolName: "agent_create_shadow_ai_alert_rule",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create Shadow AI alert rule "${params.name}" with condition "${params.condition}"`,
  executeFn: async (params, organizationId) => {
    const name = params.name as string;
    const condition = params.condition as string;
    const threshold = params.threshold as number | undefined;
    const notificationChannels = params.notification_channels as string[] | undefined;

    const triggerConfig: Record<string, unknown> = {};
    if (threshold !== undefined) {
      triggerConfig.threshold = threshold;
    }

    const actions: Array<{ type: string }> = [];
    if (notificationChannels && notificationChannels.length > 0) {
      for (const channel of notificationChannels) {
        actions.push({ type: channel });
      }
    } else {
      actions.push({ type: "in_app" });
    }

    const result = await createRuleQuery(organizationId, {
      name,
      description: `Auto-created rule: ${name}`,
      is_active: true,
      trigger_type: condition,
      trigger_config: triggerConfig,
      actions,
      cooldown_minutes: 1440,
      created_by: (params._userId as number) || 0,
    });

    return {
      id: result.id,
      name: result.name,
      trigger_type: result.trigger_type,
      message: "Alert rule created successfully",
    };
  },
});

// ============================================================================
// Export
// ============================================================================

const availableShadowAiTools: any = {
  get_shadow_ai_summary: getShadowAiSummary,
  get_shadow_ai_tools_by_events: getShadowAiToolsByEvents,
  get_shadow_ai_tools_by_users: getShadowAiToolsByUsers,
  get_shadow_ai_trend: getShadowAiTrend,
  get_shadow_ai_users_by_department: getShadowAiUsersByDepartment,
  get_shadow_ai_user_activity: getShadowAiUserActivity,
  get_shadow_ai_tool_detail: getShadowAiToolDetail,
  get_shadow_ai_alert_history: getShadowAiAlertHistory,
  agent_update_shadow_ai_tool_status: agentUpdateShadowAiToolStatus,
  agent_start_shadow_ai_governance: agentStartShadowAiGovernance,
  agent_create_shadow_ai_alert_rule: agentCreateShadowAiAlertRule,
};

export { availableShadowAiTools };
