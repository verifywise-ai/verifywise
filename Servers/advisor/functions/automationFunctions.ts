import {
  getAllAutomationTriggersQuery,
  getAllAutomationsQuery,
  getAutomationByIdQuery,
  createAutomationQuery,
  updateAutomationByIdQuery,
  deleteAutomationByIdQuery,
} from "../../utils/automation.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// ──────────────────────────────────────────────────────────────────
// READ tools
// ──────────────────────────────────────────────────────────────────

const fetchAutomations = async (
  params: { is_active?: boolean; limit?: number },
  organizationId: number,
): Promise<any[]> => {
  try {
    let automations = await getAllAutomationsQuery(organizationId);

    if (params.is_active !== undefined) {
      automations = automations.filter((a: any) => a.is_active === params.is_active);
    }

    if (params.limit && params.limit > 0) {
      automations = automations.slice(0, params.limit);
    }

    return automations.map((a: any) => ({
      id: a.id,
      name: a.name,
      trigger_id: a.trigger_id,
      is_active: a.is_active,
      created_by: a.created_by,
      created_at: a.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching automations:", error);
    throw new Error(
      `Failed to fetch automations: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAutomationDetail = async (
  params: { automation_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    const automation = await getAutomationByIdQuery(params.automation_id, organizationId);

    if (!automation) {
      return { error: `Automation #${params.automation_id} not found` };
    }

    return automation;
  } catch (error) {
    logger.error("Error fetching automation detail:", error);
    throw new Error(
      `Failed to fetch automation detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchAutomationTriggers = async (
  _params: Record<string, unknown>,
  _organizationId: number,
): Promise<any[]> => {
  try {
    const triggers = await getAllAutomationTriggersQuery();
    return triggers.map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      event_type: t.event_type,
    }));
  } catch (error) {
    logger.error("Error fetching automation triggers:", error);
    throw new Error(
      `Failed to fetch triggers: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAutomationHistory = async (
  params: { automation_id?: number; limit?: number },
  organizationId: number,
): Promise<any[]> => {
  try {
    const limit = params.limit || 50;
    let automationFilter = "";
    const replacements: any = { organizationId, limit };

    if (params.automation_id) {
      automationFilter = "AND al.automation_id = :automationId";
      replacements.automationId = params.automation_id;
    }

    const [results] = await sequelize.query(
      `SELECT al.*, a.name as automation_name
       FROM automation_logs al
       JOIN automations a ON al.automation_id = a.id AND al.organization_id = a.organization_id
       WHERE al.organization_id = :organizationId ${automationFilter}
       ORDER BY al.created_at DESC
       LIMIT :limit`,
      { replacements },
    );

    return results as any[];
  } catch (error) {
    // Table may not exist yet — return empty gracefully
    logger.error("Error fetching automation history:", error);
    return [];
  }
};

const getAutomationStats = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const automations = await getAllAutomationsQuery(organizationId);

    const activeCount = automations.filter((a: any) => a.is_active).length;
    const inactiveCount = automations.filter((a: any) => !a.is_active).length;

    // Try to get execution stats from logs
    let executionStats: any = {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
    };
    try {
      const [logStats] = await sequelize.query(
        `SELECT
           COUNT(*)::int as total_executions,
           COUNT(*) FILTER (WHERE status = 'success')::int as success_count,
           COUNT(*) FILTER (WHERE status = 'failure')::int as failure_count
         FROM automation_logs
         WHERE organization_id = :organizationId`,
        { replacements: { organizationId } },
      );
      if ((logStats as any[]).length > 0) {
        executionStats = {
          totalExecutions: (logStats as any[])[0].total_executions || 0,
          successCount: (logStats as any[])[0].success_count || 0,
          failureCount: (logStats as any[])[0].failure_count || 0,
        };
      }
    } catch {
      // automation_logs table may not exist
    }

    return {
      totalAutomations: automations.length,
      activeCount,
      inactiveCount,
      ...executionStats,
    };
  } catch (error) {
    logger.error("Error getting automation stats:", error);
    throw new Error(
      `Failed to get automation stats: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAutomationAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const automations = await getAllAutomationsQuery(organizationId);

    // Trigger type distribution
    const triggerDist: Record<number, { trigger_id: number; count: number }> = {};
    automations.forEach((a: any) => {
      if (!triggerDist[a.trigger_id]) {
        triggerDist[a.trigger_id] = { trigger_id: a.trigger_id, count: 0 };
      }
      triggerDist[a.trigger_id].count++;
    });

    // Action type usage from automation_actions_data
    let actionUsage: any[] = [];
    try {
      const [actions] = await sequelize.query(
        `SELECT aa.name as action_name, COUNT(aad.id)::int as usage_count
         FROM automation_actions_data aad
         JOIN automation_actions aa ON aad.action_type_id = aa.id
         WHERE aad.organization_id = :organizationId
         GROUP BY aa.name
         ORDER BY usage_count DESC`,
        { replacements: { organizationId } },
      );
      actionUsage = actions as any[];
    } catch {
      // Tables may not exist
    }

    // Active vs inactive ratio
    const activeCount = automations.filter((a: any) => a.is_active).length;

    return {
      totalAutomations: automations.length,
      activeCount,
      inactiveCount: automations.length - activeCount,
      triggerDistribution: Object.values(triggerDist),
      actionTypeUsage: actionUsage,
    };
  } catch (error) {
    logger.error("Error getting automation analytics:", error);
    throw new Error(
      `Failed to get automation analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAutomationExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<any> => {
  try {
    const automations = await getAllAutomationsQuery(organizationId);

    const activeCount = automations.filter((a: any) => a.is_active).length;
    const inactiveCount = automations.length - activeCount;

    // Most used triggers
    const triggerCounts = new Map<number, number>();
    automations.forEach((a: any) => {
      triggerCounts.set(a.trigger_id, (triggerCounts.get(a.trigger_id) || 0) + 1);
    });

    const topTriggers = Array.from(triggerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([triggerId, count]) => ({ trigger_id: triggerId, count }));

    // Recent execution stats (if available)
    let recentStats: any = null;
    try {
      const [stats] = await sequelize.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int as executions_last_7_days,
           COUNT(*) FILTER (WHERE status = 'failure' AND created_at >= NOW() - INTERVAL '7 days')::int as failures_last_7_days
         FROM automation_logs
         WHERE organization_id = :organizationId`,
        { replacements: { organizationId } },
      );
      recentStats = (stats as any[])[0] || null;
    } catch {
      // Table may not exist
    }

    return {
      totalAutomations: automations.length,
      activeCount,
      inactiveCount,
      topTriggers,
      recentExecutionStats: recentStats,
    };
  } catch (error) {
    logger.error("Error getting automation executive summary:", error);
    throw new Error(
      `Failed to get executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ──────────────────────────────────────────────────────────────────
// WRITE tools (Human Confirmation Flow)
// ──────────────────────────────────────────────────────────────────

const agentCreateAutomation = createWriteToolFn({
  toolName: "agent_create_automation",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create automation "${params.name}" with trigger #${params.trigger_id} and ${(params.actions as any[])?.length || 0} action(s)`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const actions = ((params.actions as any[]) || []).map((a: any) => ({
        action_type_id: a.action_type_id,
        params: a.params || null,
      }));

      const result = await createAutomationQuery(
        {
          name: params.name as string,
          trigger_id: params.trigger_id as number,
          params: {},
        },
        actions,
        (params._userId as number) || 0,
        organizationId,
        transaction,
      );

      await transaction.commit();
      return {
        id: (result as any).id,
        name: (result as any).name,
        message: "Automation created successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentUpdateAutomation = createWriteToolFn({
  toolName: "agent_update_automation",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const fields = Object.keys(params).filter((k) => k !== "automation_id" && !k.startsWith("_"));
    return `Update automation #${params.automation_id} — fields: ${fields.join(", ")}`;
  },
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const automationId = params.automation_id as number;
      const updateData: any = {};

      if (params.name !== undefined) updateData.name = params.name;
      if (params.trigger_id !== undefined) updateData.trigger_id = params.trigger_id;
      if (params.is_active !== undefined) updateData.is_active = params.is_active;

      const actions = params.actions
        ? ((params.actions as any[]) || []).map((a: any) => ({
            action_type_id: a.action_type_id,
            params: a.params || null,
          }))
        : [];

      await updateAutomationByIdQuery(
        automationId,
        updateData,
        actions,
        organizationId,
        transaction,
      );

      await transaction.commit();
      return {
        id: automationId,
        updated: true,
        message: "Automation updated successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

const agentToggleAutomation = createWriteToolFn({
  toolName: "agent_toggle_automation",
  warningLevel: "info",
  descriptionFn: (params) =>
    `${params.is_active ? "Enable" : "Disable"} automation #${params.automation_id}`,
  executeFn: async (params, organizationId) => {
    const automationId = params.automation_id as number;
    const isActive = params.is_active as boolean;

    await sequelize.query(
      `UPDATE automations SET is_active = :isActive WHERE organization_id = :organizationId AND id = :automationId`,
      {
        replacements: {
          isActive,
          organizationId,
          automationId,
        },
      },
    );

    return {
      id: automationId,
      is_active: isActive,
      message: `Automation ${isActive ? "enabled" : "disabled"} successfully`,
    };
  },
});

const agentDeleteAutomation = createWriteToolFn({
  toolName: "agent_delete_automation",
  warningLevel: "danger",
  descriptionFn: (params) => `Delete automation #${params.automation_id}`,
  executeFn: async (params, organizationId) => {
    const transaction = await sequelize.transaction();
    try {
      const automationId = params.automation_id as number;
      await deleteAutomationByIdQuery(automationId, organizationId, transaction);
      await transaction.commit();
      return {
        id: automationId,
        deleted: true,
        message: "Automation deleted successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
});

// ──────────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────────

const availableAutomationTools: any = {
  fetch_automations: fetchAutomations,
  get_automation_detail: getAutomationDetail,
  fetch_automation_triggers: fetchAutomationTriggers,
  get_automation_history: getAutomationHistory,
  get_automation_stats: getAutomationStats,
  get_automation_analytics: getAutomationAnalytics,
  get_automation_executive_summary: getAutomationExecutiveSummary,
  agent_create_automation: agentCreateAutomation,
  agent_update_automation: agentUpdateAutomation,
  agent_toggle_automation: agentToggleAutomation,
  agent_delete_automation: agentDeleteAutomation,
};

export { availableAutomationTools };
