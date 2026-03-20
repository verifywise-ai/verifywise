/**
 * Shadow AI Controller
 *
 * Handles insights, tools, users, rules, and configuration endpoints.
 * All endpoints require JWT auth. Write operations require Admin or Editor role.
 */

import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { Transaction, QueryTypes } from "sequelize";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import {
  getInsightsSummaryQuery,
  getToolsByEventsQuery,
  getToolsByUsersQuery,
  getUsersByDepartmentQuery,
  getTrendQuery,
  getUserActivityQuery,
  getUserDetailQuery,
  getDepartmentActivityQuery,
} from "../utils/shadowAiInsights.utils";
import {
  getAllToolsQuery,
  getToolByIdQuery,
  getToolDepartmentsQuery,
  getToolTopUsersQuery,
  updateToolStatusQuery,
  linkToolToModelInventoryQuery,
} from "../utils/shadowAiTools.utils";
import {
  getAllRulesQuery,
  createRuleQuery,
  updateRuleQuery,
  deleteRuleQuery,
  getAlertHistoryQuery,
} from "../utils/shadowAiRules.utils";
import {
  getSyslogConfigsQuery,
  createSyslogConfigQuery,
  updateSyslogConfigQuery,
  deleteSyslogConfigQuery,
  getSettingsQuery,
  updateSettingsQuery,
} from "../utils/shadowAiConfig.utils";
import { ShadowAiToolStatus } from "../domain.layer/interfaces/i.shadowAi";

const FILE_NAME = "shadowAi.ctrl.ts";

// ─── Helpers ────────────────────────────────────────────────────────────

function isWriteRole(role: string): boolean {
  return role === "Admin" || role === "Editor";
}

function parsePeriod(period?: string): number {
  if (!period) return 30;
  const match = period.match(/^(\d+)d$/);
  if (!match) return 30;
  const days = parseInt(match[1], 10);
  return Math.min(Math.max(days, 1), 365);
}

function parsePageLimit(value: string | undefined, defaultVal: number, max: number = 100): number {
  const parsed = parseInt(value || String(defaultVal), 10);
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, max);
}

// ─── Insights ───────────────────────────────────────────────────────────

export async function getInsightsSummary(req: Request, res: Response) {
  const fn = "getInsightsSummary";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching insights summary", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const period = parsePeriod(req.query.period as string);
    const summary = await getInsightsSummaryQuery(tenantId, period);
    await logSuccess({ eventType: "Read", description: "insights summary fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch insights summary", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getToolsByEvents(req: Request, res: Response) {
  const fn = "getToolsByEvents";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching tools by events", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const period = parsePeriod(req.query.period as string);
    const limit = parseInt(req.query.limit as string, 10) || 6;
    const data = await getToolsByEventsQuery(tenantId, period, limit);
    await logSuccess({ eventType: "Read", description: "tools by events fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch tools by events", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getToolsByUsers(req: Request, res: Response) {
  const fn = "getToolsByUsers";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching tools by users", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const period = parsePeriod(req.query.period as string);
    const limit = parseInt(req.query.limit as string, 10) || 6;
    const data = await getToolsByUsersQuery(tenantId, period, limit);
    await logSuccess({ eventType: "Read", description: "tools by users fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch tools by users", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getUsersByDepartment(req: Request, res: Response) {
  const fn = "getUsersByDepartment";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching users by department", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const period = parsePeriod(req.query.period as string);
    const data = await getUsersByDepartmentQuery(tenantId, period);
    await logSuccess({ eventType: "Read", description: "users by department fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch users by department", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getTrend(req: Request, res: Response) {
  const fn = "getTrend";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching trend data", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const period = parsePeriod(req.query.period as string);
    const granularity = (req.query.granularity as string) || "daily";
    const validGranularities = ["daily", "weekly", "monthly"];
    const gran = validGranularities.includes(granularity)
      ? (granularity as "daily" | "weekly" | "monthly")
      : "daily";
    const data = await getTrendQuery(tenantId, period, gran);
    await logSuccess({ eventType: "Read", description: "trend data fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch trend data", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ─── User Activity ──────────────────────────────────────────────────────

export async function getUsers(req: Request, res: Response) {
  const fn = "getUsers";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching user activity", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const data = await getUserActivityQuery(tenantId, {
      page: parsePageLimit(req.query.page as string, 1),
      limit: parsePageLimit(req.query.limit as string, 20),
      sort: req.query.sort as string,
      department: req.query.department as string,
    });
    await logSuccess({ eventType: "Read", description: "user activity fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch user activity", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getUserDetail(req: Request, res: Response) {
  const fn = "getUserDetail";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const email = decodeURIComponent(Array.isArray(req.params.email) ? req.params.email[0] : req.params.email);

  logProcessing({ description: `fetching user detail: ${email}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const period = parsePeriod(req.query.period as string);
    const tools = await getUserDetailQuery(tenantId, email, period);
    const totalPrompts = tools.reduce((sum, t) => sum + parseInt(String(t.event_count), 10), 0);

    // Get department from latest event for this user
    const [deptRows] = await sequelize.query(
      `SELECT COALESCE(department, 'Unknown') as department
       FROM shadow_ai_events
       WHERE organization_id = :organizationId AND user_email = :email
       ORDER BY event_timestamp DESC LIMIT 1`,
      { replacements: { organizationId, email } }
    );
    const department = (deptRows as any[])[0]?.department || "Unknown";

    const result = {
      email,
      department,
      tools,
      total_prompts: totalPrompts,
    };

    await logSuccess({ eventType: "Read", description: `user detail fetched: ${email}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch user detail", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getDepartmentActivity(req: Request, res: Response) {
  const fn = "getDepartmentActivity";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching department activity", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const data = await getDepartmentActivityQuery(tenantId);
    await logSuccess({ eventType: "Read", description: "department activity fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch department activity", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ─── Tools ──────────────────────────────────────────────────────────────

export async function getTools(req: Request, res: Response) {
  const fn = "getTools";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching shadow AI tools", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const data = await getAllToolsQuery(tenantId, {
      status: req.query.status as ShadowAiToolStatus | undefined,
      sort: req.query.sort as string,
      page: parsePageLimit(req.query.page as string, 1),
      limit: parsePageLimit(req.query.limit as string, 20),
    });
    await logSuccess({ eventType: "Read", description: "shadow AI tools fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch shadow AI tools", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getToolById(req: Request, res: Response) {
  const fn = "getToolById";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const toolId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({ description: `fetching tool: ${toolId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (isNaN(toolId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid tool ID"));
    }

    const tool = await getToolByIdQuery(tenantId, toolId);
    if (!tool) {
      return res.status(404).json(STATUS_CODE[404]("Tool not found"));
    }

    const [departments, topUsers] = await Promise.all([
      getToolDepartmentsQuery(tenantId, toolId),
      getToolTopUsersQuery(tenantId, toolId),
    ]);

    await logSuccess({ eventType: "Read", description: `tool fetched: ${toolId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(
      STATUS_CODE[200]({
        ...tool,
        departments,
        top_users: topUsers,
      })
    );
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch tool", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateToolStatus(req: Request, res: Response) {
  const fn = "updateToolStatus";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const toolId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({ description: `updating tool status: ${toolId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (!isWriteRole(req.role!)) {
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    if (isNaN(toolId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid tool ID"));
    }

    const { status } = req.body;
    const validStatuses: ShadowAiToolStatus[] = [
      "detected", "under_review", "approved", "restricted", "blocked", "dismissed",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid status value"));
    }

    const updated = await updateToolStatusQuery(tenantId, toolId, status);
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Tool not found"));
    }

    await logSuccess({ eventType: "Update", description: `tool status updated: ${toolId} → ${status}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await logFailure({ eventType: "Update", description: "failed to update tool status", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function startGovernance(req: Request, res: Response) {
  const fn = "startGovernance";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const toolId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({ description: `starting governance for tool: ${toolId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (!isWriteRole(req.role!)) {
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    if (isNaN(toolId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid tool ID"));
    }

    const tool = await getToolByIdQuery(tenantId, toolId);
    if (!tool) {
      return res.status(404).json(STATUS_CODE[404]("Tool not found"));
    }

    const { model_inventory, governance_owner_id } = req.body;

    if (!model_inventory?.provider || !model_inventory?.model || !governance_owner_id) {
      return res.status(400).json(STATUS_CODE[400]("Missing required fields: model_inventory.provider, model_inventory.model, governance_owner_id"));
    }

    const ownerId = parseInt(governance_owner_id, 10);
    if (isNaN(ownerId) || ownerId <= 0) {
      return res.status(400).json(STATUS_CODE[400]("governance_owner_id must be a positive integer"));
    }

    let transaction: Transaction | null = null;

    try {
      transaction = await sequelize.transaction();

      // Create model inventory entry
      const [miResult] = await sequelize.query(
        `INSERT INTO model_inventories
           (organization_id, provider, model, provider_model, version, status, status_date,
            capabilities, reference_link, biases, limitations, hosting_provider,
            approver, created_at, updated_at)
         VALUES (:organizationId, :provider, :model, :provider_model, :version, :status, NOW(),
            :capabilities, :reference_link, :biases, :limitations, :hosting_provider,
            :approver, NOW(), NOW())
         RETURNING id`,
        {
          replacements: {
            organizationId,
            provider: model_inventory.provider,
            model: model_inventory.model,
            provider_model: `${model_inventory.provider} / ${model_inventory.model}`,
            version: model_inventory.version || "N/A",
            status: ["Approved", "Restricted", "Pending", "Blocked"].includes(model_inventory.status) ? model_inventory.status : "Pending",
            capabilities: "To be assessed",
            reference_link: "",
            biases: "",
            limitations: "",
            hosting_provider: model_inventory.provider,
            approver: null,
          },
          transaction,
        }
      );
      const modelInventoryId = (miResult as any[])[0].id;

      // Link tool to model inventory
      await linkToolToModelInventoryQuery(organizationId, toolId, modelInventoryId, undefined, transaction);

      // Update tool governance owner
      await sequelize.query(
        `UPDATE shadow_ai_tools
         SET governance_owner_id = :ownerId, status = 'under_review', updated_at = NOW()
         WHERE organization_id = :organizationId AND id = :toolId`,
        {
          replacements: { organizationId, ownerId, toolId },
          transaction,
        }
      );

      // Initialize lifecycle review if requested
      let lifecycleInitialized = false;
      if (req.body.start_lifecycle) {
        try {
          await sequelize.query("SAVEPOINT lifecycle_init", { transaction });

          const activeItems = await sequelize.query(
            `SELECT i.id
             FROM model_lifecycle_items i
             INNER JOIN model_lifecycle_phases p ON i.phase_id = p.id
             WHERE i.organization_id = :organizationId
               AND p.organization_id = :organizationId
               AND i.is_active = true AND p.is_active = true`,
            { type: QueryTypes.SELECT, transaction, replacements: { organizationId } }
          ) as { id: number }[];

          if (activeItems.length > 0) {
            const valueTuples = activeItems
              .map((_, idx) => `(:organizationId, :modelInventoryId, :itemId${idx}, :userId)`)
              .join(", ");
            const replacements: Record<string, unknown> = { organizationId, modelInventoryId, userId };
            activeItems.forEach((item, idx) => {
              replacements[`itemId${idx}`] = item.id;
            });

            await sequelize.query(
              `INSERT INTO model_lifecycle_values
                 (organization_id, model_inventory_id, item_id, updated_by)
               VALUES ${valueTuples}
               ON CONFLICT (organization_id, model_inventory_id, item_id) DO NOTHING`,
              { replacements, transaction }
            );
            lifecycleInitialized = true;
          }

          await sequelize.query("RELEASE SAVEPOINT lifecycle_init", { transaction });
        } catch (lcError) {
          await sequelize.query("ROLLBACK TO SAVEPOINT lifecycle_init", { transaction }).catch(() => {});
          console.error(`[startGovernance] Lifecycle initialization failed for tool ${toolId}, continuing without it:`, lcError);
        }
      }

      await transaction.commit();

      await logSuccess({ eventType: "Create", description: `governance started for tool: ${toolId}, MI: ${modelInventoryId}, lifecycle: ${lifecycleInitialized}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

      return res.status(201).json(
        STATUS_CODE[201]({
          model_inventory_id: modelInventoryId,
          tool_id: toolId,
          lifecycle_initialized: lifecycleInitialized,
        })
      );
    } catch (innerError) {
      if (transaction) {
        try { await transaction.rollback(); } catch (rbErr) { logFailure({ eventType: "Create", description: "governance rollback failed", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: rbErr as Error }); }
      }
      throw innerError;
    }
  } catch (error) {
    await logFailure({ eventType: "Create", description: "failed to start governance", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ─── Rules ──────────────────────────────────────────────────────────────

export async function getRules(req: Request, res: Response) {
  const fn = "getRules";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching rules", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const rules = await getAllRulesQuery(tenantId);
    await logSuccess({ eventType: "Read", description: `${rules.length} rules fetched`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](rules));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch rules", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createRule(req: Request, res: Response) {
  const fn = "createRule";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "creating rule", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (!isWriteRole(req.role!)) {
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const { name, description, is_active, trigger_type, trigger_config, actions, cooldown_minutes, notification_user_ids } = req.body;

    if (!name || !trigger_type || !actions || !Array.isArray(actions)) {
      return res.status(400).json(STATUS_CODE[400]("Missing required fields: name, trigger_type, actions"));
    }

    const rule = await createRuleQuery(tenantId, {
      name,
      description,
      is_active: is_active !== false,
      trigger_type,
      trigger_config: trigger_config || {},
      actions,
      cooldown_minutes: cooldown_minutes != null ? cooldown_minutes : undefined,
      created_by: userId,
      notification_user_ids,
    });

    await logSuccess({ eventType: "Create", description: `rule created: ${name}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(201).json(STATUS_CODE[201](rule));
  } catch (error) {
    await logFailure({ eventType: "Create", description: "failed to create rule", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateRule(req: Request, res: Response) {
  const fn = "updateRule";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const ruleId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({ description: `updating rule: ${ruleId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (!isWriteRole(req.role!)) {
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    if (isNaN(ruleId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid rule ID"));
    }

    const updated = await updateRuleQuery(tenantId, ruleId, req.body);
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Rule not found"));
    }

    await logSuccess({ eventType: "Update", description: `rule updated: ${ruleId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await logFailure({ eventType: "Update", description: "failed to update rule", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteRule(req: Request, res: Response) {
  const fn = "deleteRule";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const ruleId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({ description: `deleting rule: ${ruleId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (!isWriteRole(req.role!)) {
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    if (isNaN(ruleId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid rule ID"));
    }

    const deleted = await deleteRuleQuery(tenantId, ruleId);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Rule not found"));
    }

    await logSuccess({ eventType: "Delete", description: `rule deleted: ${ruleId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200]("Rule deleted successfully"));
  } catch (error) {
    await logFailure({ eventType: "Delete", description: "failed to delete rule", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAlertHistory(req: Request, res: Response) {
  const fn = "getAlertHistory";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching alert history", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const data = await getAlertHistoryQuery(tenantId, {
      page: parsePageLimit(req.query.page as string, 1),
      limit: parsePageLimit(req.query.limit as string, 20),
      ruleId: req.query.ruleId ? parseInt(req.query.ruleId as string, 10) : undefined,
    });
    await logSuccess({ eventType: "Read", description: "alert history fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch alert history", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ─── Configuration ──────────────────────────────────────────────────────

export async function getSyslogConfigs(req: Request, res: Response) {
  const fn = "getSyslogConfigs";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching syslog configs", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (req.role !== "Admin") {
      return res.status(403).json(STATUS_CODE[403]("Only admins can manage syslog configuration"));
    }

    const configs = await getSyslogConfigsQuery(tenantId);
    await logSuccess({ eventType: "Read", description: "syslog configs fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](configs));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch syslog configs", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createSyslogConfig(req: Request, res: Response) {
  const fn = "createSyslogConfig";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "creating syslog config", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (req.role !== "Admin") {
      return res.status(403).json(STATUS_CODE[403]("Only admins can manage syslog configuration"));
    }

    const { source_identifier, parser_type, is_active } = req.body;
    if (!source_identifier || !parser_type) {
      return res.status(400).json(STATUS_CODE[400]("Missing required fields: source_identifier, parser_type"));
    }

    const validParsers = ["zscaler", "netskope", "squid", "generic_kv"];
    if (!validParsers.includes(parser_type)) {
      return res.status(400).json(STATUS_CODE[400](`Invalid parser_type. Must be one of: ${validParsers.join(", ")}`));
    }

    const config = await createSyslogConfigQuery(tenantId, {
      source_identifier,
      parser_type,
      is_active: is_active !== false,
    });

    await logSuccess({ eventType: "Create", description: `syslog config created: ${source_identifier}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(201).json(STATUS_CODE[201](config));
  } catch (error) {
    await logFailure({ eventType: "Create", description: "failed to create syslog config", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateSyslogConfig(req: Request, res: Response) {
  const fn = "updateSyslogConfig";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const configId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({ description: `updating syslog config: ${configId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (req.role !== "Admin") {
      return res.status(403).json(STATUS_CODE[403]("Only admins can manage syslog configuration"));
    }

    if (isNaN(configId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid config ID"));
    }

    const { source_identifier, parser_type, is_active } = req.body;

    if (parser_type) {
      const validParsers = ["zscaler", "netskope", "squid", "generic_kv"];
      if (!validParsers.includes(parser_type)) {
        return res.status(400).json(STATUS_CODE[400](`Invalid parser_type. Must be one of: ${validParsers.join(", ")}`));
      }
    }

    const updated = await updateSyslogConfigQuery(tenantId, configId, {
      source_identifier,
      parser_type,
      is_active,
    });

    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Syslog config not found"));
    }

    await logSuccess({ eventType: "Update", description: `syslog config updated: ${configId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await logFailure({ eventType: "Update", description: "failed to update syslog config", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteSyslogConfig(req: Request, res: Response) {
  const fn = "deleteSyslogConfig";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;
  const configId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({ description: `deleting syslog config: ${configId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (req.role !== "Admin") {
      return res.status(403).json(STATUS_CODE[403]("Only admins can manage syslog configuration"));
    }

    if (isNaN(configId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid config ID"));
    }

    const deleted = await deleteSyslogConfigQuery(tenantId, configId);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Syslog config not found"));
    }

    await logSuccess({ eventType: "Delete", description: `syslog config deleted: ${configId}`, functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200]("Syslog config deleted successfully"));
  } catch (error) {
    await logFailure({ eventType: "Delete", description: "failed to delete syslog config", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ─── Settings (Rate Limiting & Data Retention) ──────────────────────────

export async function getSettings(req: Request, res: Response) {
  const fn = "getSettings";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "fetching settings", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    const settings = await getSettingsQuery(tenantId);
    await logSuccess({ eventType: "Read", description: "settings fetched", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    await logFailure({ eventType: "Read", description: "failed to fetch settings", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateSettings(req: Request, res: Response) {
  const fn = "updateSettings";
  const userId = req.userId!;
  const tenantId = req.tenantId!;
  const organizationId = req.organizationId!;

  logProcessing({ description: "updating settings", functionName: fn, fileName: FILE_NAME, userId, organizationId });

  try {
    if (req.role !== "Admin") {
      return res.status(403).json(STATUS_CODE[403]("Only admins can manage settings"));
    }

    const {
      rate_limit_max_events_per_hour,
      retention_events_days,
      retention_daily_rollups_days,
      retention_alert_history_days,
    } = req.body;

    const updated = await updateSettingsQuery(tenantId, {
      rate_limit_max_events_per_hour,
      retention_events_days,
      retention_daily_rollups_days,
      retention_alert_history_days,
      updated_by: userId,
    });

    await logSuccess({ eventType: "Update", description: "settings updated", functionName: fn, fileName: FILE_NAME, userId, organizationId });
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await logFailure({ eventType: "Update", description: "failed to update settings", functionName: fn, fileName: FILE_NAME, userId, organizationId, error: error as Error });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
